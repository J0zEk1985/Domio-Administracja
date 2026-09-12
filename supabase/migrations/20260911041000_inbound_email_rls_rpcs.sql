-- Inbound email: RLS + service_role ingest RPCs. Writes to ingest/quota only via DEFINER.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_inbound_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email_ingest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_usage_monthly ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.org_inbound_mailboxes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.inbound_email_ingest FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.org_ai_usage_monthly FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.org_inbound_mailboxes TO authenticated;
GRANT SELECT ON TABLE public.inbound_email_ingest TO authenticated;
GRANT SELECT ON TABLE public.org_ai_usage_monthly TO authenticated;

GRANT ALL ON TABLE public.org_inbound_mailboxes TO service_role;
GRANT ALL ON TABLE public.inbound_email_ingest TO service_role;
GRANT ALL ON TABLE public.org_ai_usage_monthly TO service_role;

DROP POLICY IF EXISTS org_inbound_mailboxes_select ON public.org_inbound_mailboxes;
CREATE POLICY org_inbound_mailboxes_select
  ON public.org_inbound_mailboxes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS inbound_email_ingest_select ON public.inbound_email_ingest;
CREATE POLICY inbound_email_ingest_select
  ON public.inbound_email_ingest
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (org_id IS NOT NULL AND (SELECT public.is_org_member(org_id)))
  );

DROP POLICY IF EXISTS org_ai_usage_monthly_select ON public.org_ai_usage_monthly;
CREATE POLICY org_ai_usage_monthly_select
  ON public.org_ai_usage_monthly
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_member(org_id))
  );

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.inbound_normalize_alias(p_to text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text := lower(btrim(COALESCE(p_to, '')));
  v_email text;
  v_at integer;
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
  v_at := position('@' IN v);
  IF v_at > 1 THEN
    v := left(v, v_at - 1);
  END IF;

  v := btrim(v);
  IF v = '' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION private.inbound_month_start()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT date_trunc('month', timezone('utc', now()))::date;
$$;

CREATE OR REPLACE FUNCTION private.inbound_ai_monthly_limit(p_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT MAX(pp.ai_monthly_parse_limit)
      FROM public.org_subscriptions os
      JOIN public.pricing_plans pp ON pp.id = os.plan_id
      WHERE os.org_id = p_org_id
        AND os.status = 'active'
        AND (os.expires_at IS NULL OR os.expires_at > now())
        AND pp.ai_monthly_parse_limit IS NOT NULL
    ),
    20
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_has_ai_auto(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_subscriptions os
    JOIN public.pricing_plans pp ON pp.id = os.plan_id
    WHERE os.org_id = p_org_id
      AND os.status = 'active'
      AND (os.expires_at IS NULL OR os.expires_at > now())
      AND COALESCE(pp.has_ai_features, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_match_location(
  p_org_id uuid,
  p_location_id uuid,
  p_address_text text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_count integer;
  v_addr text := lower(btrim(COALESCE(p_address_text, '')));
BEGIN
  IF p_location_id IS NOT NULL THEN
    SELECT cl.id INTO v_id
    FROM public.cleaning_locations cl
    WHERE cl.id = p_location_id
      AND cl.org_id = p_org_id
      AND (cl.status IS NULL OR cl.status IN ('active', 'archived'))
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF v_addr = '' THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)::integer, MIN(cl.id)
    INTO v_count, v_id
  FROM public.cleaning_locations cl
  WHERE cl.org_id = p_org_id
    AND (cl.status IS NULL OR cl.status = 'active')
    AND lower(btrim(cl.address)) = v_addr;

  IF v_count = 1 THEN
    RETURN v_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.inbound_try_consume_ai_parse(
  p_org_id uuid,
  p_prompt_tokens bigint,
  p_output_tokens bigint
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_month date := private.inbound_month_start();
  v_limit integer := private.inbound_ai_monthly_limit(p_org_id);
  v_used integer;
  v_in bigint := GREATEST(COALESCE(p_prompt_tokens, 0), 0);
  v_out bigint := GREATEST(COALESCE(p_output_tokens, 0), 0);
BEGIN
  IF v_limit <= 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.org_ai_usage_monthly (org_id, year_month)
  VALUES (p_org_id, v_month)
  ON CONFLICT (org_id, year_month) DO NOTHING;

  SELECT u.parse_count
    INTO v_used
  FROM public.org_ai_usage_monthly u
  WHERE u.org_id = p_org_id
    AND u.year_month = v_month
  FOR UPDATE;

  IF COALESCE(v_used, 0) >= v_limit THEN
    RETURN false;
  END IF;

  UPDATE public.org_ai_usage_monthly
  SET parse_count = parse_count + 1,
      prompt_tokens = prompt_tokens + v_in,
      output_tokens = output_tokens + v_out
  WHERE org_id = p_org_id
    AND year_month = v_month;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.inbound_normalize_alias(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_month_start() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_ai_monthly_limit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_has_ai_auto(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_match_location(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_try_consume_ai_parse(uuid, bigint, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- resolve_inbound_mailbox — n8n calls this BEFORE Gemini
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_inbound_mailbox(p_to_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_alias text := private.inbound_normalize_alias(p_to_address);
  v_box public.org_inbound_mailboxes%ROWTYPE;
  v_limit integer;
  v_used integer;
  v_month date := private.inbound_month_start();
BEGIN
  IF v_alias IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_box
  FROM public.org_inbound_mailboxes
  WHERE alias_local_part = v_alias
  LIMIT 1;

  IF v_box.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'alias_local_part', v_alias);
  END IF;

  v_limit := private.inbound_ai_monthly_limit(v_box.org_id);

  SELECT COALESCE(u.parse_count, 0)
    INTO v_used
  FROM public.org_ai_usage_monthly u
  WHERE u.org_id = v_box.org_id
    AND u.year_month = v_month;

  v_used := COALESCE(v_used, 0);

  RETURN jsonb_build_object(
    'found', true,
    'mailbox_id', v_box.id,
    'org_id', v_box.org_id,
    'module', v_box.module,
    'alias_local_part', v_box.alias_local_part,
    'ingest_mode', v_box.ingest_mode,
    'is_enabled', v_box.is_enabled,
    'auto_create_threshold', v_box.auto_create_threshold,
    'has_ai_auto', private.inbound_has_ai_auto(v_box.org_id),
    'ai_parses_limit', v_limit,
    'ai_parses_used', v_used,
    'ai_parses_remaining', GREATEST(v_limit - v_used, 0),
    'allow_ai_parse', (v_box.is_enabled AND GREATEST(v_limit - v_used, 0) > 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ingest_email_issue — n8n after parse (template and/or Gemini)
-- ---------------------------------------------------------------------------

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
  v_location uuid;
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
    message_id,
    from_address,
    to_address,
    subject,
    body_text,
    raw_payload,
    status
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

  v_description := btrim(COALESCE(v_parsed->>'description', ''));
  v_name := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_name', '')), 120), '');
  v_phone := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_phone', '')), 40), '');
  v_email := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_email', COALESCE(p_from_address, ''))), 254), '');
  v_prompt := GREATEST(COALESCE((v_parsed->>'prompt_tokens')::bigint, 0), 0);
  v_output := GREATEST(COALESCE((v_parsed->>'output_tokens')::bigint, 0), 0);

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

  BEGIN
    v_location := private.inbound_match_location(
      v_box.org_id,
      NULLIF(btrim(COALESCE(v_parsed->>'location_id', '')), '')::uuid,
      v_parsed->>'address_text'
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_location := private.inbound_match_location(v_box.org_id, NULL, v_parsed->>'address_text');
  END;

  IF v_method = 'ai' THEN
    v_consumed := private.inbound_try_consume_ai_parse(v_box.org_id, v_prompt, v_output);
    IF NOT v_consumed THEN
      v_error := 'ai_quota_exceeded';
      v_confidence := 0;
    END IF;
  END IF;

  IF length(v_description) < 10 THEN
    UPDATE public.inbound_email_ingest
    SET org_id = v_box.org_id,
        mailbox_id = v_box.id,
        parse_method = v_method,
        ai_confidence = v_confidence,
        matched_location_id = v_location,
        prompt_tokens = v_prompt,
        output_tokens = v_output,
        status = 'rejected',
        error_detail = COALESCE(v_error, 'description_too_short')
    WHERE id = v_ingest_id;

    RETURN jsonb_build_object(
      'ingest_id', v_ingest_id,
      'issue_id', NULL,
      'status', 'rejected',
      'ai_consumed', v_consumed
    );
  END IF;

  v_is_draft := (
    v_location IS NULL
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
      v_released := now();
    ELSE
      v_source := 'email_ai'::public.issue_source_enum;
      v_issue_status := 'open'::public.issue_status_enum;
      v_released := now();
  END CASE;

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
    released_from_cleaning_at
  )
  VALUES (
    v_box.org_id,
    v_location,
    left(v_description, 2000),
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
    v_released
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
    'is_ai_draft', v_is_draft
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Org management RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_org_inbound_mailboxes(p_org_id uuid)
RETURNS SETOF public.org_inbound_mailboxes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_slug text;
  v_mod text;
  v_alias text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Brak organizacji.';
  END IF;

  IF NOT (SELECT public.is_platform_admin())
     AND NOT (SELECT public.is_org_management(p_org_id)) THEN
    RAISE EXCEPTION 'Brak uprawnień do konfiguracji skrzynek.';
  END IF;

  SELECT lower(regexp_replace(COALESCE(o.slug, ''), '[^a-z0-9]+', '', 'g'))
    INTO v_slug
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono organizacji.';
  END IF;

  IF v_slug = '' OR length(v_slug) < 2 THEN
    v_slug := substr(replace(p_org_id::text, '-', ''), 1, 12);
  END IF;

  FOREACH v_mod IN ARRAY ARRAY['serwis', 'cleaning', 'administracja'] LOOP
    v_alias := v_mod || '+' || v_slug;
    BEGIN
      INSERT INTO public.org_inbound_mailboxes (org_id, module, alias_local_part)
      VALUES (p_org_id, v_mod, v_alias)
      ON CONFLICT (org_id, module) DO NOTHING;
    EXCEPTION
      WHEN unique_violation THEN
        INSERT INTO public.org_inbound_mailboxes (org_id, module, alias_local_part)
        VALUES (
          p_org_id,
          v_mod,
          v_mod || '+' || v_slug || substr(replace(p_org_id::text, '-', ''), 1, 6)
        )
        ON CONFLICT (org_id, module) DO NOTHING;
    END;
  END LOOP;

  RETURN QUERY
  SELECT *
  FROM public.org_inbound_mailboxes
  WHERE org_id = p_org_id
  ORDER BY module;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_org_inbound_mailbox(
  p_id uuid,
  p_display_address text DEFAULT NULL,
  p_is_enabled boolean DEFAULT NULL,
  p_ingest_mode text DEFAULT NULL,
  p_auto_create_threshold numeric DEFAULT NULL
)
RETURNS public.org_inbound_mailboxes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_box public.org_inbound_mailboxes%ROWTYPE;
  v_mode text;
BEGIN
  SELECT * INTO v_box
  FROM public.org_inbound_mailboxes
  WHERE id = p_id;

  IF v_box.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono skrzynki.';
  END IF;

  IF NOT (SELECT public.is_platform_admin())
     AND NOT (SELECT public.is_org_management(v_box.org_id)) THEN
    RAISE EXCEPTION 'Brak uprawnień do edycji skrzynki.';
  END IF;

  v_mode := COALESCE(p_ingest_mode, v_box.ingest_mode);
  IF v_mode = 'ai_auto' AND NOT private.inbound_has_ai_auto(v_box.org_id) THEN
    RAISE EXCEPTION 'Tryb automatycznej analizy wymaga planu z funkcjami AI.';
  END IF;

  UPDATE public.org_inbound_mailboxes
  SET display_address = CASE
        WHEN p_display_address IS NULL THEN display_address
        ELSE NULLIF(btrim(p_display_address), '')
      END,
      is_enabled = COALESCE(p_is_enabled, is_enabled),
      ingest_mode = v_mode,
      auto_create_threshold = COALESCE(p_auto_create_threshold, auto_create_threshold)
  WHERE id = p_id
  RETURNING * INTO v_box;

  RETURN v_box;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_ai_quota(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_limit integer;
  v_used integer;
  v_month date := private.inbound_month_start();
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Brak organizacji.';
  END IF;

  IF NOT (SELECT public.is_platform_admin())
     AND NOT (SELECT public.is_org_member(p_org_id)) THEN
    RAISE EXCEPTION 'Brak dostępu do limitu AI.';
  END IF;

  v_limit := private.inbound_ai_monthly_limit(p_org_id);

  SELECT COALESCE(u.parse_count, 0)
    INTO v_used
  FROM public.org_ai_usage_monthly u
  WHERE u.org_id = p_org_id
    AND u.year_month = v_month;

  v_used := COALESCE(v_used, 0);

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'year_month', v_month,
    'ai_parses_limit', v_limit,
    'ai_parses_used', v_used,
    'ai_parses_remaining', GREATEST(v_limit - v_used, 0),
    'has_ai_auto', private.inbound_has_ai_auto(p_org_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_inbound_mailbox(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_email_issue(text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_org_inbound_mailboxes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_org_inbound_mailbox(uuid, text, boolean, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_ai_quota(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.resolve_inbound_mailbox(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_email_issue(text, text, text, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_org_inbound_mailboxes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_org_inbound_mailbox(uuid, text, boolean, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_ai_quota(uuid) TO authenticated;
