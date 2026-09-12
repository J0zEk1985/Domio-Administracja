-- Email vendor bridge Layer 2: RLS + dispatch / inbound-status RPCs.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Table privileges (ingest/dispatch writes only via DEFINER / service_role)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.vendor_email_channels FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.vendor_email_inbound_templates FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.issue_email_dispatches FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.vendor_email_inbound_events FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_email_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_email_inbound_templates TO authenticated;
GRANT SELECT ON TABLE public.issue_email_dispatches TO authenticated;
GRANT SELECT ON TABLE public.vendor_email_inbound_events TO authenticated;

GRANT ALL ON TABLE public.vendor_email_channels TO service_role;
GRANT ALL ON TABLE public.vendor_email_inbound_templates TO service_role;
GRANT ALL ON TABLE public.issue_email_dispatches TO service_role;
GRANT ALL ON TABLE public.vendor_email_inbound_events TO service_role;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS vendor_email_channels_select ON public.vendor_email_channels;
CREATE POLICY vendor_email_channels_select
  ON public.vendor_email_channels
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS vendor_email_channels_write ON public.vendor_email_channels;
CREATE POLICY vendor_email_channels_write
  ON public.vendor_email_channels
  FOR ALL
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
  )
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
  );

DROP POLICY IF EXISTS vendor_email_inbound_templates_select ON public.vendor_email_inbound_templates;
CREATE POLICY vendor_email_inbound_templates_select
  ON public.vendor_email_inbound_templates
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS vendor_email_inbound_templates_write ON public.vendor_email_inbound_templates;
CREATE POLICY vendor_email_inbound_templates_write
  ON public.vendor_email_inbound_templates
  FOR ALL
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
  )
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
  );

DROP POLICY IF EXISTS issue_email_dispatches_select ON public.issue_email_dispatches;
CREATE POLICY issue_email_dispatches_select
  ON public.issue_email_dispatches
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS vendor_email_inbound_events_select ON public.vendor_email_inbound_events;
CREATE POLICY vendor_email_inbound_events_select
  ON public.vendor_email_inbound_events
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (org_id IS NOT NULL AND (SELECT public.is_org_member(org_id)))
  );

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.vendor_email_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT (SELECT auth.role()) IS NOT DISTINCT FROM 'service_role';
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_require_management(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Brak organizacji.';
  END IF;
  IF private.vendor_email_is_service_role() THEN
    RETURN p_org_id;
  END IF;
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF NOT (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(p_org_id))
    OR (SELECT public.is_management_role(p_org_id))
  ) THEN
    RAISE EXCEPTION 'ISSUE_DELEGATE_FORBIDDEN';
  END IF;
  RETURN p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_new_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO 'public'
AS $$
  SELECT encode(extensions.gen_random_bytes(6), 'hex');
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_normalize_address(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text := lower(btrim(COALESCE(p_raw, '')));
  v_email text;
BEGIN
  IF v = '' THEN
    RETURN NULL;
  END IF;
  v_email := substring(v from '<([^>]+)>');
  IF v_email IS NOT NULL AND v_email <> '' THEN
    v := lower(btrim(v_email));
  END IF;
  v := regexp_replace(v, '[<>"]', '', 'g');
  v := btrim(v);
  IF v = '' OR position('@' IN v) < 2 THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_extract_token(
  p_to text,
  p_subject text,
  p_body text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_local text;
  v_token text;
  v_blob text;
BEGIN
  v_local := private.inbound_normalize_alias(p_to);
  IF v_local IS NOT NULL THEN
    v_token := substring(v_local from '\+t_([a-z0-9]{12})');
    IF v_token IS NOT NULL THEN
      RETURN v_token;
    END IF;
  END IF;

  v_blob := COALESCE(p_subject, '') || E'\n' || COALESCE(p_body, '');
  v_token := substring(v_blob from '\[DOMIO[[:space:]]+([a-z0-9]{12})\]');
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  v_token := substring(v_blob from '(?i)Ref:[[:space:]]*([a-z0-9]{12})');
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_from_allowed(
  p_from text,
  p_allowlist text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_from text := private.vendor_email_normalize_address(p_from);
  v_item text;
  v_domain text;
BEGIN
  IF v_from IS NULL THEN
    RETURN false;
  END IF;
  IF p_allowlist IS NULL OR cardinality(p_allowlist) = 0 THEN
    RETURN true;
  END IF;

  FOREACH v_item IN ARRAY p_allowlist LOOP
    v_item := lower(btrim(COALESCE(v_item, '')));
    IF v_item = '' THEN
      CONTINUE;
    END IF;
    IF v_item = v_from THEN
      RETURN true;
    END IF;
    IF left(v_item, 1) = '@' THEN
      v_domain := substr(v_item, 2);
    ELSIF position('@' IN v_item) = 0 THEN
      v_domain := v_item;
    ELSE
      v_domain := NULL;
    END IF;
    IF v_domain IS NOT NULL AND v_domain <> ''
       AND v_from LIKE '%@' || v_domain THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_escape_regex(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text := COALESCE(p_text, '');
  ch text;
  i integer;
  out_text text := '';
BEGIN
  FOR i IN 1..char_length(v) LOOP
    ch := substr(v, i, 1);
    IF ch IN ('[', ']', '(', ')', '{', '}', '.', '^', '$', '|', '*', '+', '?') THEN
      out_text := out_text || chr(92) || ch;
    ELSE
      out_text := out_text || ch;
    END IF;
  END LOOP;
  RETURN out_text;
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_match_template(p_pattern text, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_pat text := regexp_replace(btrim(COALESCE(p_pattern, '')), '\s+', ' ', 'g');
  v_txt text := regexp_replace(btrim(COALESCE(p_text, '')), '\s+', ' ', 'g');
  v_names text[] := '{}';
  v_regex text := '';
  v_rest text;
  v_m text[];
  v_open integer;
  v_close integer;
  v_token text;
  v_i integer;
  v_obj jsonb := '{}'::jsonb;
BEGIN
  IF v_pat = '' OR v_txt = '' THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  v_rest := v_pat;
  LOOP
    v_open := position('{{' IN v_rest);
    IF v_open = 0 THEN
      v_regex := v_regex || private.vendor_email_escape_regex(v_rest);
      EXIT;
    END IF;
    v_regex := v_regex || private.vendor_email_escape_regex(left(v_rest, v_open - 1));
    v_rest := substr(v_rest, v_open + 2);
    v_close := position('}}' IN v_rest);
    IF v_close = 0 THEN
      RETURN jsonb_build_object('matched', false);
    END IF;
    v_token := btrim(left(v_rest, v_close - 1));
    v_rest := substr(v_rest, v_close + 2);
    IF v_token = '' OR v_token !~ '^[a-z][a-z0-9_]*$' THEN
      RETURN jsonb_build_object('matched', false);
    END IF;
    v_names := array_append(v_names, v_token);
    v_regex := v_regex || '(.+?)';
  END LOOP;

  v_m := regexp_match(v_txt, '^' || v_regex || '$');
  IF v_m IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  FOR v_i IN 1..COALESCE(array_length(v_names, 1), 0) LOOP
    v_obj := v_obj || jsonb_build_object(v_names[v_i], COALESCE(v_m[v_i], ''));
  END LOOP;

  RETURN jsonb_build_object('matched', true, 'extracted', v_obj);
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_append_lifecycle(
  p_org_id uuid,
  p_issue_id uuid,
  p_event_type text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.issue_lifecycle_events (
    org_id, issue_id, event_type, actor_user_id, payload
  )
  VALUES (
    p_org_id,
    p_issue_id,
    p_event_type,
    (SELECT auth.uid()),
    COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_build_payload(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_dispatch public.issue_email_dispatches%ROWTYPE;
  v_channel public.vendor_email_channels%ROWTYPE;
  v_vendor public.vendor_partners%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_loc public.cleaning_locations%ROWTYPE;
  v_to text;
  v_domain text;
  v_reply text;
BEGIN
  SELECT * INTO v_issue FROM public.property_issues WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.issue_email_dispatches
  WHERE issue_id = p_issue_id;

  IF v_dispatch.id IS NULL THEN
    RAISE EXCEPTION 'Brak wątku wysyłki e-mail dla zgłoszenia.';
  END IF;

  SELECT * INTO v_channel
  FROM public.vendor_email_channels
  WHERE vendor_id = v_dispatch.vendor_id;

  SELECT * INTO v_vendor FROM public.vendor_partners WHERE id = v_dispatch.vendor_id;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_issue.org_id;
  SELECT * INTO v_loc FROM public.cleaning_locations WHERE id = v_issue.location_id;

  v_to := COALESCE(
    NULLIF(btrim(COALESCE(v_channel.outbound_to_email, '')), ''),
    NULLIF(btrim(COALESCE(v_vendor.contact_email, '')), '')
  );

  SELECT substring(COALESCE(b.display_address, ''), '@([^>]+)$')
    INTO v_domain
  FROM public.org_inbound_mailboxes b
  WHERE b.org_id = v_issue.org_id
    AND b.module = 'serwis'
    AND b.display_address IS NOT NULL
  LIMIT 1;

  IF v_domain IS NULL OR btrim(v_domain) = '' THEN
    v_domain := substring(COALESCE(v_org.support_email, ''), '@([^>]+)$');
  END IF;
  v_domain := lower(btrim(COALESCE(v_domain, '')));

  v_reply := 'vendor-status+t_' || v_dispatch.correlation_token;
  IF v_domain <> '' THEN
    v_reply := v_reply || '@' || v_domain;
  END IF;

  RETURN jsonb_build_object(
    'dispatchId', v_dispatch.id,
    'issueId', v_issue.id,
    'toEmail', COALESCE(v_to, ''),
    'toName', COALESCE(v_vendor.name, ''),
    'cc', to_jsonb(COALESCE(v_channel.outbound_cc, '{}'::text[])),
    'replyTo', v_reply,
    'subjectTemplate', COALESCE(
      v_channel.outbound_subject_template,
      private.vendor_email_default_subject()
    ),
    'bodyTemplate', COALESCE(
      v_channel.outbound_body_template,
      private.vendor_email_default_body()
    ),
    'variables', jsonb_build_object(
      'issue.id', v_issue.id::text,
      'issue.token', v_dispatch.correlation_token,
      'issue.description', COALESCE(v_issue.description, ''),
      'issue.category', COALESCE(v_issue.category, ''),
      'issue.priority', COALESCE(v_issue.priority::text, ''),
      'building.name', COALESCE(v_loc.name, ''),
      'building.address', COALESCE(v_loc.address, ''),
      'org.name', COALESCE(v_org.name, ''),
      'reporter.name', COALESCE(v_issue.reporter_name, ''),
      'reporter.phone', COALESCE(v_issue.reporter_phone, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_queue_for_issue(
  p_issue_id uuid,
  p_vendor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_vendor public.vendor_partners%ROWTYPE;
  v_channel public.vendor_email_channels%ROWTYPE;
  v_dispatch public.issue_email_dispatches%ROWTYPE;
  v_token text;
  v_to text;
  v_tries integer := 0;
BEGIN
  SELECT * INTO v_issue
  FROM public.property_issues
  WHERE id = p_issue_id
  FOR UPDATE;

  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  PERFORM private.vendor_email_require_management(v_issue.org_id);

  SELECT * INTO v_vendor FROM public.vendor_partners WHERE id = p_vendor_id;
  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono partnera.';
  END IF;
  IF v_vendor.org_id IS DISTINCT FROM v_issue.org_id THEN
    RAISE EXCEPTION 'Partner nie należy do organizacji zgłoszenia.';
  END IF;
  IF COALESCE(v_vendor.dispatch_channel, 'in_app') IS DISTINCT FROM 'email' THEN
    RAISE EXCEPTION 'Partner nie obsługuje kanału e-mail.';
  END IF;

  SELECT * INTO v_channel
  FROM public.vendor_email_channels
  WHERE vendor_id = p_vendor_id;

  IF v_channel.vendor_id IS NULL OR v_channel.is_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Kanał e-mail partnera jest wyłączony albo nieustawiony.';
  END IF;

  v_to := COALESCE(
    NULLIF(btrim(COALESCE(v_channel.outbound_to_email, '')), ''),
    NULLIF(btrim(COALESCE(v_vendor.contact_email, '')), '')
  );
  IF v_to IS NULL OR position('@' IN v_to) < 2 THEN
    RAISE EXCEPTION 'Partner nie ma adresu e-mail.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.issue_email_dispatches
  WHERE issue_id = p_issue_id
  FOR UPDATE;

  IF v_dispatch.id IS NULL THEN
    LOOP
      v_tries := v_tries + 1;
      v_token := private.vendor_email_new_token();
      BEGIN
        INSERT INTO public.issue_email_dispatches (
          org_id, issue_id, vendor_id, correlation_token, status, queued_at
        )
        VALUES (
          v_issue.org_id, p_issue_id, p_vendor_id, v_token, 'queued', now()
        )
        RETURNING * INTO v_dispatch;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_tries >= 8 THEN
            RAISE EXCEPTION 'Nie udało się wygenerować tokenu korelacji.';
          END IF;
      END;
    END LOOP;
  ELSE
    UPDATE public.issue_email_dispatches
    SET
      vendor_id = p_vendor_id,
      status = 'queued',
      dispatch_error = NULL,
      queued_at = now(),
      sent_at = NULL
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;
    v_token := v_dispatch.correlation_token;
  END IF;

  UPDATE public.property_issues
  SET
    email_dispatch_status = 'queued',
    email_correlation_token = v_token,
    delegated_vendor_id = p_vendor_id,
    status = 'delegated'
  WHERE id = p_issue_id;

  PERFORM private.vendor_email_append_lifecycle(
    v_issue.org_id,
    p_issue_id,
    'email_queued',
    jsonb_build_object(
      'dispatch_id', v_dispatch.id,
      'correlation_token', v_token,
      'vendor_id', p_vendor_id
    )
  );

  RETURN private.vendor_email_build_payload(p_issue_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_apply_matched(
  p_dispatch public.issue_email_dispatches,
  p_event_type text,
  p_extracted jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_extracted jsonb := COALESCE(p_extracted, '{}'::jsonb);
  v_ref text;
  v_tech text;
  v_life text;
BEGIN
  SELECT * INTO v_issue
  FROM public.property_issues
  WHERE id = p_dispatch.issue_id
  FOR UPDATE;

  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  v_ref := NULLIF(btrim(COALESCE(v_extracted->>'vendor_ticket', '')), '');
  v_tech := NULLIF(btrim(COALESCE(v_extracted->>'technician_name', '')), '');

  IF v_ref IS NOT NULL THEN
    UPDATE public.issue_email_dispatches
    SET vendor_external_ref = COALESCE(vendor_external_ref, v_ref)
    WHERE id = p_dispatch.id;

    UPDATE public.property_issues
    SET vendor_external_ref = COALESCE(vendor_external_ref, v_ref)
    WHERE id = v_issue.id;
  END IF;

  IF p_event_type = 'accepted' THEN
    v_life := 'email_accepted';
  ELSIF p_event_type = 'assigned_technician' THEN
    v_life := 'email_assigned';
    IF v_issue.status IS DISTINCT FROM 'resolved'
       AND v_issue.status IS DISTINCT FROM 'cancelled' THEN
      UPDATE public.property_issues
      SET
        status = 'in_progress',
        started_at = COALESCE(started_at, now())
      WHERE id = v_issue.id;
    END IF;
  ELSIF p_event_type = 'completed' THEN
    v_life := 'email_completed';
    IF v_issue.status IS DISTINCT FROM 'cancelled' THEN
      UPDATE public.property_issues
      SET
        status = 'resolved',
        resolved_at = COALESCE(resolved_at, now())
      WHERE id = v_issue.id;
    END IF;
  ELSIF p_event_type = 'rejected' THEN
    v_life := 'email_rejected';
  ELSE
    RAISE EXCEPTION 'Nieobsługiwany typ zdarzenia e-mail.';
  END IF;

  PERFORM private.vendor_email_append_lifecycle(
    v_issue.org_id,
    v_issue.id,
    v_life,
    jsonb_build_object(
      'dispatch_id', p_dispatch.id,
      'correlation_token', p_dispatch.correlation_token,
      'vendor_external_ref', COALESCE(v_ref, v_issue.vendor_external_ref),
      'technician_name', v_tech
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_issue_email_payload(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
BEGIN
  SELECT * INTO v_issue FROM public.property_issues WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;
  PERFORM private.vendor_email_require_management(v_issue.org_id);
  RETURN private.vendor_email_build_payload(p_issue_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_issue_email_dispatch(
  p_issue_id uuid,
  p_vendor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_vendor_id uuid;
BEGIN
  SELECT * INTO v_issue FROM public.property_issues WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  v_vendor_id := COALESCE(p_vendor_id, v_issue.delegated_vendor_id);
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'ISSUE_TRANSFER_FIELDS_REQUIRED';
  END IF;

  RETURN private.vendor_email_queue_for_issue(p_issue_id, v_vendor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_issue_email_dispatched(
  p_issue_id uuid,
  p_outbound_message_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_dispatch public.issue_email_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.issue_email_dispatches
  WHERE issue_id = p_issue_id
  FOR UPDATE;

  IF v_dispatch.id IS NULL THEN
    RAISE EXCEPTION 'Brak wątku wysyłki e-mail dla zgłoszenia.';
  END IF;

  PERFORM private.vendor_email_require_management(v_dispatch.org_id);

  UPDATE public.issue_email_dispatches
  SET
    status = 'sent',
    sent_at = COALESCE(sent_at, now()),
    dispatch_error = NULL,
    outbound_message_id = COALESCE(
      NULLIF(btrim(COALESCE(p_outbound_message_id, '')), ''),
      outbound_message_id
    )
  WHERE id = v_dispatch.id;

  UPDATE public.property_issues
  SET email_dispatch_status = 'sent'
  WHERE id = p_issue_id;

  PERFORM private.vendor_email_append_lifecycle(
    v_dispatch.org_id,
    p_issue_id,
    'email_sent',
    jsonb_build_object(
      'dispatch_id', v_dispatch.id,
      'correlation_token', v_dispatch.correlation_token
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_issue_email_dispatch_failed(
  p_issue_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_dispatch public.issue_email_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.issue_email_dispatches
  WHERE issue_id = p_issue_id
  FOR UPDATE;

  IF v_dispatch.id IS NULL THEN
    RAISE EXCEPTION 'Brak wątku wysyłki e-mail dla zgłoszenia.';
  END IF;

  PERFORM private.vendor_email_require_management(v_dispatch.org_id);

  UPDATE public.issue_email_dispatches
  SET
    status = 'failed',
    dispatch_error = NULLIF(btrim(COALESCE(p_error, '')), '')
  WHERE id = v_dispatch.id;

  UPDATE public.property_issues
  SET email_dispatch_status = 'failed'
  WHERE id = p_issue_id;
END;
$$;

DROP FUNCTION IF EXISTS public.delegate_property_issue(uuid, uuid);

CREATE FUNCTION public.delegate_property_issue(p_issue_id uuid, p_vendor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_vendor public.vendor_partners%ROWTYPE;
  v_channel text;
BEGIN
  IF (SELECT auth.uid()) IS NULL AND NOT private.vendor_email_is_service_role() THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'ISSUE_TRANSFER_FIELDS_REQUIRED';
  END IF;

  SELECT * INTO v_issue FROM public.property_issues WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;

  PERFORM private.vendor_email_require_management(v_issue.org_id);

  SELECT * INTO v_vendor FROM public.vendor_partners WHERE id = p_vendor_id;
  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono partnera.';
  END IF;

  v_channel := COALESCE(v_vendor.dispatch_channel, 'in_app');

  IF v_channel = 'email' THEN
    RETURN private.vendor_email_queue_for_issue(p_issue_id, p_vendor_id)
      || jsonb_build_object('queued', true);
  END IF;

  UPDATE public.property_issues
  SET
    status = 'delegated',
    delegated_vendor_id = p_vendor_id
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'queued', false,
    'issueId', p_issue_id,
    'dispatchId', NULL
  );
END;
$$;

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
  v_dispatch public.issue_email_dispatches%ROWTYPE;
  v_channel public.vendor_email_channels%ROWTYPE;
  v_method text;
  v_event text;
  v_extracted jsonb := '{}'::jsonb;
  v_match jsonb;
  v_tpl public.vendor_email_inbound_templates%ROWTYPE;
  v_cand uuid;
  v_from_ok boolean;
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
      'match_method', v_existing.match_method
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
          IF v_method IS NULL OR v_method = '' OR v_method = 'token' THEN
            IF v_method IS DISTINCT FROM 'token' THEN
              v_method := 'template';
            END IF;
          END IF;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_method NOT IN ('token', 'vendor_ref', 'template', 'unmatched') THEN
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

    IF NOT v_from_ok AND v_method IS DISTINCT FROM 'token' THEN
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
        'match_method', 'unmatched'
      );
    END IF;
  END IF;

  IF v_dispatch.id IS NULL
     OR v_event NOT IN ('accepted', 'assigned_technician', 'completed', 'rejected') THEN
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
      'match_method', 'unmatched'
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
    'event_type', v_event
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_issue_email_payload(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_issue_email_dispatch(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_issue_email_dispatched(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_issue_email_dispatch_failed(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delegate_property_issue(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_vendor_email_event(text, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_issue_email_payload(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_issue_email_dispatch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_issue_email_dispatched(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_issue_email_dispatch_failed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delegate_property_issue(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_vendor_email_event(text, text, text, text, text, jsonb, jsonb) TO service_role;
