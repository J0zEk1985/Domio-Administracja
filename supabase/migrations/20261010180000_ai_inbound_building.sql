BEGIN;

-- AI parses may name a building. Accept that id only when the building belongs
-- to the mailbox organization and is enrolled in the mailbox module.
-- A single exact address still wins. Template and manual parses stay on address text.

CREATE OR REPLACE FUNCTION private.inbound_served_location_id(
  p_org_id uuid,
  p_module text,
  p_location_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT cl.id
  FROM public.cleaning_locations cl
  WHERE cl.id = p_location_id
    AND cl.org_id = p_org_id
    AND private.inbound_location_serves_module(
      p_module,
      cl.status,
      cl.is_admin_active,
      cl.is_maintenance_active,
      cl.is_active_in_serwis,
      cl.is_cleaning_active
    );
$$;

CREATE OR REPLACE FUNCTION public.ingest_email_issue(
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
  v_alias text := private.inbound_normalize_alias(p_to_address);
  v_message_id text := btrim(COALESCE(p_message_id, ''));
  v_box public.org_inbound_mailboxes%ROWTYPE;
  v_ingest_id uuid;
  v_existing public.inbound_email_ingest%ROWTYPE;
  v_parsed jsonb := COALESCE(p_parsed, '{}'::jsonb);
  v_method text;
  v_confidence numeric;
  v_description text;
  v_fallback text;
  v_resolved jsonb;
  v_outcome text;
  v_location uuid;
  v_ai_location uuid;
  v_candidates jsonb := '[]'::jsonb;
  v_reported text;
  v_category text;
  v_priority public.issue_priority_enum;
  v_name text;
  v_phone text;
  v_email text;
  v_photos text[];
  v_prompt bigint;
  v_output bigint;
  v_consumed boolean := false;
  v_status text;
  v_issue_id uuid;
  v_source public.issue_source_enum;
  v_issue_status public.issue_status_enum;
  v_released timestamptz;
  v_is_draft boolean;
  v_error text;
BEGIN
  IF v_message_id = '' OR length(v_message_id) > 998 THEN
    RAISE EXCEPTION 'Brak lub nieprawidłowy Message-ID';
  END IF;

  INSERT INTO public.inbound_email_ingest (
    message_id, from_address, to_address, subject, body_text, raw_payload, status
  )
  VALUES (
    v_message_id,
    NULLIF(btrim(COALESCE(p_from_address, '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(p_to_address, '')), ''), '(unknown)'),
    NULLIF(left(btrim(COALESCE(p_subject, '')), 500), ''),
    NULLIF(left(COALESCE(p_body_text, ''), 20000), ''),
    COALESCE(p_raw_payload, '{}'::jsonb),
    'received'
  )
  ON CONFLICT (message_id) DO NOTHING
  RETURNING id INTO v_ingest_id;

  IF v_ingest_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.inbound_email_ingest
    WHERE message_id = v_message_id;

    RETURN jsonb_build_object(
      'ingest_id', v_existing.id,
      'issue_id', v_existing.issue_id,
      'status', 'duplicate',
      'ai_consumed', false
    );
  END IF;

  IF v_alias IS NULL THEN
    UPDATE public.inbound_email_ingest
    SET status = 'rejected', error_detail = 'unrecognized_recipient'
    WHERE id = v_ingest_id;
    RETURN jsonb_build_object(
      'ingest_id', v_ingest_id,
      'issue_id', NULL,
      'status', 'rejected',
      'ai_consumed', false
    );
  END IF;

  SELECT * INTO v_box
  FROM public.org_inbound_mailboxes
  WHERE alias_local_part = v_alias
  LIMIT 1;

  IF v_box.id IS NULL OR v_box.is_enabled = false THEN
    UPDATE public.inbound_email_ingest
    SET status = 'rejected',
        error_detail = CASE WHEN v_box.id IS NULL THEN 'unknown_alias' ELSE 'mailbox_disabled' END
    WHERE id = v_ingest_id;
    RETURN jsonb_build_object(
      'ingest_id', v_ingest_id,
      'issue_id', NULL,
      'status', 'rejected',
      'ai_consumed', false
    );
  END IF;

  v_method := lower(btrim(COALESCE(v_parsed->>'parse_method', 'template')));
  IF v_method NOT IN ('template', 'ai', 'manual') THEN
    v_method := 'template';
  END IF;

  v_confidence := COALESCE((v_parsed->>'confidence')::numeric, CASE WHEN v_method = 'template' THEN 1 ELSE 0 END);
  IF v_confidence < 0 THEN v_confidence := 0; END IF;
  IF v_confidence > 1 THEN v_confidence := 1; END IF;

  v_name := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_name', '')), 120), '');
  v_phone := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_phone', '')), 40), '');
  v_email := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_email', COALESCE(p_from_address, ''))), 254), '');
  v_prompt := GREATEST(COALESCE((v_parsed->>'prompt_tokens')::bigint, 0), 0);
  v_output := GREATEST(COALESCE((v_parsed->>'output_tokens')::bigint, 0), 0);
  v_reported := NULLIF(left(btrim(COALESCE(v_parsed->>'address_text', '')), 300), '');

  v_description := btrim(COALESCE(v_parsed->>'description', ''));
  IF length(v_description) < 10 THEN
    v_fallback := btrim(left(
      btrim(COALESCE(p_subject, '')) || E'\n' || COALESCE(p_body_text, ''),
      2000
    ));
    IF length(v_fallback) >= 10 THEN
      v_description := v_fallback;
    ELSE
      v_description := left(
        'Zgłoszenie e-mail bez treści od ' || COALESCE(v_email, 'nieznany nadawca'),
        2000
      );
    END IF;
  END IF;

  IF jsonb_typeof(v_parsed->'photos') = 'array' THEN
    SELECT COALESCE(array_agg(elem), '{}'::text[])
      INTO v_photos
    FROM (
      SELECT left(btrim(value), 500) AS elem
      FROM jsonb_array_elements_text(v_parsed->'photos') AS t(value)
      WHERE btrim(value) <> ''
      LIMIT 12
    ) s;
  END IF;

  v_category := NULLIF(btrim(COALESCE(v_parsed->>'category', '')), '');
  IF v_category IS NOT NULL AND v_category NOT IN (
    'Hydrauliczna', 'Elektryczna', 'Ślusarska', 'Ogólnobudowlana', 'Inna'
  ) THEN
    v_category := 'Inna';
  END IF;

  v_priority := CASE lower(btrim(COALESCE(v_parsed->>'priority', 'medium')))
    WHEN 'critical' THEN 'critical'::public.issue_priority_enum
    WHEN 'high' THEN 'critical'::public.issue_priority_enum
    WHEN 'low' THEN 'low'::public.issue_priority_enum
    ELSE 'medium'::public.issue_priority_enum
  END;

  v_resolved := private.inbound_resolve_served_address(
    v_box.org_id,
    v_box.module,
    v_reported
  );
  v_outcome := COALESCE(v_resolved->>'outcome', 'reject');
  v_candidates := COALESCE(v_resolved->'candidates', '[]'::jsonb);
  BEGIN
    v_location := NULLIF(v_resolved->>'location_id', '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_location := NULL;
      v_outcome := 'reject';
  END;

  v_ai_location := NULL;
  IF v_method = 'ai' THEN
    BEGIN
      v_ai_location := NULLIF(btrim(COALESCE(v_parsed->>'location_id', '')), '')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_ai_location := NULL;
    END;
    IF v_ai_location IS NOT NULL THEN
      v_ai_location := private.inbound_served_location_id(
        v_box.org_id,
        v_box.module,
        v_ai_location
      );
    END IF;
  END IF;

  -- One exact enrolled address wins, even when AI named a different building.
  IF v_outcome = 'exact' AND v_location IS NOT NULL THEN
    v_ai_location := NULL;
  END IF;

  IF v_method = 'ai' AND (v_outcome IS DISTINCT FROM 'reject' OR v_ai_location IS NOT NULL) THEN
    v_consumed := private.inbound_try_consume_ai_parse(v_box.org_id, v_prompt, v_output);
    IF NOT v_consumed THEN
      v_error := 'ai_quota_exceeded';
      v_confidence := 0;
      v_ai_location := NULL;
    END IF;
  END IF;

  IF v_ai_location IS NOT NULL AND v_location IS NULL THEN
    v_location := v_ai_location;
    v_outcome := 'ai';
  END IF;

  IF v_outcome = 'reject' THEN
    UPDATE public.inbound_email_ingest
    SET org_id = v_box.org_id,
        mailbox_id = v_box.id,
        parse_method = v_method,
        ai_confidence = v_confidence,
        matched_location_id = NULL,
        prompt_tokens = v_prompt,
        output_tokens = v_output,
        status = 'rejected',
        error_detail = 'address_not_served'
    WHERE id = v_ingest_id;

    RETURN jsonb_build_object(
      'ingest_id', v_ingest_id,
      'issue_id', NULL,
      'status', 'address_not_served',
      'ai_consumed', v_consumed,
      'is_ai_draft', false,
      'intake_module', v_box.module
    );
  END IF;

  v_is_draft := (
    v_outcome = 'review'
    OR v_location IS NULL
    OR v_confidence < v_box.auto_create_threshold
    OR (v_method = 'ai' AND NOT v_consumed)
  );

  CASE v_box.module
    WHEN 'cleaning' THEN
      v_source := 'cleaning'::public.issue_source_enum;
      v_issue_status := 'pending_cleaning_review'::public.issue_status_enum;
      v_released := NULL;
    WHEN 'administracja' THEN
      v_source := 'email_ai'::public.issue_source_enum;
      v_issue_status := 'new'::public.issue_status_enum;
      v_released := NULL;
    ELSE
      v_source := 'email_ai'::public.issue_source_enum;
      v_issue_status := 'open'::public.issue_status_enum;
      v_released := NULL;
  END CASE;

  IF v_outcome = 'review' AND v_box.module IS DISTINCT FROM 'cleaning' THEN
    v_issue_status := 'new'::public.issue_status_enum;
    v_location := NULL;
  END IF;

  INSERT INTO public.property_issues (
    org_id,
    location_id,
    description,
    reporter_name,
    reporter_phone,
    reporter_email,
    reporter_type,
    priority,
    category,
    status,
    source,
    is_ai_draft,
    ai_confidence_score,
    photos_before,
    released_from_cleaning_at,
    intake_module,
    reported_address,
    address_candidates
  )
  VALUES (
    v_box.org_id,
    v_location,
    left(
      CASE
        WHEN v_outcome = 'review' AND v_reported IS NOT NULL
          THEN v_description || E'\n\nPodany adres: ' || v_reported
        ELSE v_description
      END,
      2000
    ),
    COALESCE(v_name, 'Zgłoszenie e-mail'),
    COALESCE(v_phone, 'brak'),
    v_email,
    'tenant',
    v_priority,
    v_category,
    v_issue_status,
    v_source,
    v_is_draft,
    v_confidence,
    CASE WHEN v_photos IS NOT NULL AND cardinality(v_photos) > 0 THEN v_photos ELSE NULL END,
    v_released,
    v_box.module,
    v_reported,
    CASE WHEN v_outcome = 'review' AND jsonb_array_length(v_candidates) > 0 THEN v_candidates ELSE NULL END
  )
  RETURNING id INTO v_issue_id;

  v_status := CASE WHEN v_is_draft THEN 'needs_review' ELSE 'created' END;

  UPDATE public.inbound_email_ingest
  SET org_id = v_box.org_id,
      mailbox_id = v_box.id,
      parse_method = v_method,
      ai_confidence = v_confidence,
      matched_location_id = v_location,
      issue_id = v_issue_id,
      prompt_tokens = v_prompt,
      output_tokens = v_output,
      status = v_status,
      error_detail = v_error
  WHERE id = v_ingest_id;

  RETURN jsonb_build_object(
    'ingest_id', v_ingest_id,
    'issue_id', v_issue_id,
    'status', v_status,
    'ai_consumed', v_consumed,
    'is_ai_draft', v_is_draft,
    'intake_module', v_box.module,
    'match_outcome', v_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION private.inbound_served_location_id(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_email_issue(text, text, text, text, text, jsonb, jsonb) TO service_role;

-- Open AI tickets that already named a served building, including the
-- Pienista 51 door report, get that building. Closed tickets stay untouched.
WITH picked AS (
  SELECT
    i.id AS ingest_id,
    pi.id AS issue_id,
    CASE
      WHEN i.raw_payload #>> '{jevDecision,building_id}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN private.inbound_served_location_id(
          pi.org_id,
          COALESCE(m.module, pi.intake_module),
          (i.raw_payload #>> '{jevDecision,building_id}')::uuid
        )
      ELSE NULL
    END AS location_id
  FROM public.inbound_email_ingest i
  JOIN public.property_issues pi ON pi.id = i.issue_id
  LEFT JOIN public.org_inbound_mailboxes m ON m.id = i.mailbox_id
  WHERE pi.location_id IS NULL
    AND i.parse_method = 'ai'
    AND pi.status IN (
      'new'::public.issue_status_enum,
      'pending_admin_approval'::public.issue_status_enum,
      'pending_cleaning_review'::public.issue_status_enum
    )
),
updated_issues AS (
  UPDATE public.property_issues pi
  SET location_id = picked.location_id
  FROM picked
  WHERE pi.id = picked.issue_id
    AND picked.location_id IS NOT NULL
    AND pi.location_id IS NULL
  RETURNING pi.id, pi.location_id
)
UPDATE public.inbound_email_ingest i
SET matched_location_id = u.location_id
FROM updated_issues u
JOIN picked ON picked.issue_id = u.id
WHERE i.id = picked.ingest_id
  AND i.matched_location_id IS NULL;

COMMIT;
