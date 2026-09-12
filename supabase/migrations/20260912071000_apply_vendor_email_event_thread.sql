CREATE OR REPLACE FUNCTION public.apply_vendor_email_event(
  p_to_address text,
  p_message_id text,
  p_from_address text,
  p_subject text,
  p_body_text text,
  p_parsed jsonb DEFAULT '{}'::jsonb,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_message_id text := btrim(COALESCE(p_message_id, ''));
  v_parsed jsonb := COALESCE(p_parsed, '{}'::jsonb);
  v_ingest_id uuid;
  v_existing public.vendor_email_inbound_events%ROWTYPE;
  v_token text;
  v_thread text;
  v_dispatch public.issue_email_dispatches%ROWTYPE;
  v_channel public.vendor_email_channels%ROWTYPE;
  v_method text;
  v_event text;
  v_extracted jsonb := '{}'::jsonb;
  v_match jsonb;
  v_tpl public.vendor_email_inbound_templates%ROWTYPE;
  v_cand uuid;
  v_from_ok boolean;
  v_notify boolean := false;
  v_guess text;
BEGIN
  IF NOT private.vendor_email_is_service_role() THEN
    RAISE EXCEPTION 'Brak uprawnień.';
  END IF;

  IF v_message_id = '' OR length(v_message_id) > 998 THEN
    RAISE EXCEPTION 'Brak lub nieprawidłowy Message-ID';
  END IF;

  INSERT INTO public.vendor_email_inbound_events (
    message_id, from_address, to_address, subject, body_text, raw_payload, status
  )
  VALUES (
    v_message_id,
    NULLIF(btrim(COALESCE(p_from_address, '')), ''),
    NULLIF(btrim(COALESCE(p_to_address, '')), ''),
    NULLIF(left(btrim(COALESCE(p_subject, '')), 500), ''),
    NULLIF(left(COALESCE(p_body_text, ''), 20000), ''),
    COALESCE(p_raw_payload, '{}'::jsonb),
    'received'
  )
  ON CONFLICT (message_id) DO NOTHING
  RETURNING id INTO v_ingest_id;

  IF v_ingest_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.vendor_email_inbound_events
    WHERE message_id = v_message_id;

    RETURN jsonb_build_object(
      'ingest_id', v_existing.id,
      'issue_id', v_existing.issue_id,
      'status', 'duplicate',
      'match_method', v_existing.match_method,
      'notify_partner', false
    );
  END IF;

  v_method := lower(btrim(COALESCE(v_parsed->>'match_method', '')));
  v_event := lower(btrim(COALESCE(v_parsed->>'event_type', '')));
  IF jsonb_typeof(v_parsed->'extracted') = 'object' THEN
    v_extracted := v_parsed->'extracted';
  END IF;

  v_token := private.vendor_email_extract_token(p_to_address, p_subject, p_body_text);

  IF v_token IS NOT NULL THEN
    SELECT * INTO v_dispatch
    FROM public.issue_email_dispatches
    WHERE correlation_token = v_token;
    IF v_dispatch.id IS NOT NULL THEN
      v_method := 'token';
    END IF;
  END IF;

  IF v_dispatch.id IS NULL THEN
    v_thread := private.vendor_email_thread_blob(p_raw_payload);
    IF v_thread <> '' THEN
      SELECT d.* INTO v_dispatch
      FROM public.issue_email_dispatches d
      WHERE d.outbound_message_id IS NOT NULL
        AND btrim(d.outbound_message_id) <> ''
        AND position(lower(btrim(d.outbound_message_id)) IN v_thread) > 0
      ORDER BY d.sent_at DESC NULLS LAST, d.queued_at DESC
      LIMIT 1;
      IF v_dispatch.id IS NOT NULL THEN
        v_method := 'thread';
      END IF;
    END IF;
  END IF;

  IF v_dispatch.id IS NULL
     AND NULLIF(btrim(COALESCE(v_extracted->>'vendor_ticket', '')), '') IS NOT NULL THEN
    SELECT d.* INTO v_dispatch
    FROM public.issue_email_dispatches d
    WHERE d.vendor_external_ref = btrim(v_extracted->>'vendor_ticket')
    ORDER BY d.queued_at DESC
    LIMIT 1;
    IF v_dispatch.id IS NOT NULL THEN
      v_method := 'vendor_ref';
    END IF;
  END IF;

  IF v_dispatch.id IS NULL THEN
    FOR v_cand IN
      SELECT c.vendor_id
      FROM public.vendor_email_channels c
      WHERE c.is_enabled = true
        AND private.vendor_email_from_allowed(p_from_address, c.inbound_from_allowlist)
    LOOP
      IF v_dispatch.id IS NULL THEN
        SELECT d.* INTO v_dispatch
        FROM public.issue_email_dispatches d
        WHERE d.vendor_id = v_cand
          AND d.vendor_external_ref IS NOT NULL
          AND (
            strpos(COALESCE(p_subject, '') || ' ' || COALESCE(p_body_text, ''), d.vendor_external_ref) > 0
          )
        ORDER BY d.queued_at DESC
        LIMIT 1;
        IF v_dispatch.id IS NOT NULL THEN
          v_method := 'vendor_ref';
        END IF;
      END IF;

      IF v_dispatch.id IS NULL THEN
        FOR v_tpl IN
          SELECT t.*
          FROM public.vendor_email_inbound_templates t
          WHERE t.vendor_id = v_cand
          ORDER BY CASE t.event_type
            WHEN 'completed' THEN 1
            WHEN 'assigned_technician' THEN 2
            WHEN 'rejected' THEN 3
            ELSE 4
          END
        LOOP
          IF v_tpl.subject_pattern IS NOT NULL AND btrim(v_tpl.subject_pattern) <> '' THEN
            v_match := private.vendor_email_match_template(v_tpl.subject_pattern, COALESCE(p_subject, ''));
            IF COALESCE((v_match->>'matched')::boolean, false) IS NOT TRUE THEN
              CONTINUE;
            END IF;
          END IF;
          v_match := private.vendor_email_match_template(v_tpl.body_pattern, COALESCE(p_body_text, ''));
          IF COALESCE((v_match->>'matched')::boolean, false) THEN
            SELECT d.* INTO v_dispatch
            FROM public.issue_email_dispatches d
            WHERE d.vendor_id = v_cand
              AND d.status IN ('queued', 'sent', 'failed')
            ORDER BY d.queued_at DESC
            LIMIT 1;
            v_event := v_tpl.event_type;
            v_extracted := COALESCE(v_match->'extracted', '{}'::jsonb) || v_extracted;
            v_method := 'template';
            EXIT;
          END IF;
        END LOOP;
      END IF;

      EXIT WHEN v_dispatch.id IS NOT NULL;
    END LOOP;
  END IF;

  IF v_dispatch.id IS NOT NULL
     AND v_event NOT IN ('accepted', 'assigned_technician', 'completed', 'rejected') THEN
    IF v_event = '' THEN
      FOR v_tpl IN
        SELECT t.*
        FROM public.vendor_email_inbound_templates t
        WHERE t.vendor_id = v_dispatch.vendor_id
        ORDER BY CASE t.event_type
          WHEN 'completed' THEN 1
          WHEN 'assigned_technician' THEN 2
          WHEN 'rejected' THEN 3
          ELSE 4
        END
      LOOP
        IF v_tpl.subject_pattern IS NOT NULL AND btrim(v_tpl.subject_pattern) <> '' THEN
          v_match := private.vendor_email_match_template(v_tpl.subject_pattern, COALESCE(p_subject, ''));
          IF COALESCE((v_match->>'matched')::boolean, false) IS NOT TRUE THEN
            CONTINUE;
          END IF;
        END IF;
        v_match := private.vendor_email_match_template(v_tpl.body_pattern, COALESCE(p_body_text, ''));
        IF COALESCE((v_match->>'matched')::boolean, false) THEN
          v_event := v_tpl.event_type;
          v_extracted := COALESCE(v_match->'extracted', '{}'::jsonb) || v_extracted;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_dispatch.id IS NOT NULL
     AND v_event NOT IN ('accepted', 'assigned_technician', 'completed', 'rejected') THEN
    v_guess := private.vendor_email_guess_event(p_subject, p_body_text);
    v_event := COALESCE(v_guess, 'accepted');
  END IF;

  IF v_method NOT IN ('token', 'vendor_ref', 'template', 'thread', 'manual', 'unmatched') THEN
    v_method := CASE WHEN v_dispatch.id IS NULL THEN 'unmatched' ELSE COALESCE(NULLIF(v_method, ''), 'token') END;
  END IF;

  IF v_dispatch.id IS NOT NULL THEN
    SELECT * INTO v_channel
    FROM public.vendor_email_channels
    WHERE vendor_id = v_dispatch.vendor_id;

    v_from_ok := private.vendor_email_from_allowed(
      p_from_address,
      COALESCE(v_channel.inbound_from_allowlist, '{}'::text[])
    );

    IF NOT v_from_ok AND v_method NOT IN ('token', 'thread') THEN
      UPDATE public.vendor_email_inbound_events
      SET
        org_id = v_dispatch.org_id,
        vendor_id = v_dispatch.vendor_id,
        issue_id = v_dispatch.issue_id,
        dispatch_id = v_dispatch.id,
        matched_event_type = NULL,
        extracted = v_extracted,
        match_method = 'unmatched',
        status = 'rejected',
        error_detail = 'sender_not_allowed'
      WHERE id = v_ingest_id;

      RETURN jsonb_build_object(
        'ingest_id', v_ingest_id,
        'issue_id', v_dispatch.issue_id,
        'status', 'rejected',
        'match_method', 'unmatched',
        'notify_partner', false
      );
    END IF;
  END IF;

  IF v_dispatch.id IS NULL
     OR v_event NOT IN ('accepted', 'assigned_technician', 'completed', 'rejected') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.vendor_email_channels c
      WHERE c.is_enabled = true
        AND COALESCE(cardinality(c.inbound_from_allowlist), 0) > 0
        AND private.vendor_email_from_allowed(p_from_address, c.inbound_from_allowlist)
        AND NOT private.inbound_is_noreply(p_from_address)
    ) INTO v_notify;

    UPDATE public.vendor_email_inbound_events
    SET
      org_id = v_dispatch.org_id,
      vendor_id = v_dispatch.vendor_id,
      issue_id = v_dispatch.issue_id,
      dispatch_id = v_dispatch.id,
      matched_event_type = NULLIF(v_event, ''),
      extracted = v_extracted,
      match_method = 'unmatched',
      status = 'unmatched',
      error_detail = CASE
        WHEN v_dispatch.id IS NULL THEN 'dispatch_not_found'
        ELSE 'event_type_unknown'
      END
    WHERE id = v_ingest_id;

    IF v_dispatch.issue_id IS NOT NULL THEN
      PERFORM private.vendor_email_append_lifecycle(
        v_dispatch.org_id,
        v_dispatch.issue_id,
        'email_unmatched',
        jsonb_build_object('ingest_id', v_ingest_id)
      );
    END IF;

    RETURN jsonb_build_object(
      'ingest_id', v_ingest_id,
      'issue_id', v_dispatch.issue_id,
      'status', 'unmatched',
      'match_method', 'unmatched',
      'notify_partner', v_notify
    );
  END IF;

  PERFORM private.vendor_email_apply_matched(v_dispatch, v_event, v_extracted);

  UPDATE public.vendor_email_inbound_events
  SET
    org_id = v_dispatch.org_id,
    vendor_id = v_dispatch.vendor_id,
    issue_id = v_dispatch.issue_id,
    dispatch_id = v_dispatch.id,
    matched_event_type = v_event,
    extracted = v_extracted,
    match_method = v_method,
    status = 'applied',
    error_detail = NULL
  WHERE id = v_ingest_id;

  RETURN jsonb_build_object(
    'ingest_id', v_ingest_id,
    'issue_id', v_dispatch.issue_id,
    'dispatch_id', v_dispatch.id,
    'status', 'applied',
    'match_method', v_method,
    'event_type', v_event,
    'notify_partner', false
  );
END;
$$;
