-- Zero-loss inbound mail and non-expiring AI prepaid credits.
-- File only: do not apply on the VPS until explicitly confirmed.

-- ---------------------------------------------------------------------------
-- Prepaid balance (does not reset with the calendar month)
-- ---------------------------------------------------------------------------

CREATE TABLE public.org_ai_prepaid_credits (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_ai_prepaid_credits_balance_chk CHECK (balance >= 0)
);

COMMENT ON TABLE public.org_ai_prepaid_credits IS
  'Purchased AI parse credits. Unused balance does not expire at month end.';

CREATE TABLE public.org_ai_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_ai_credit_ledger_delta_chk CHECK (delta <> 0),
  CONSTRAINT org_ai_credit_ledger_reason_chk CHECK (reason IN ('grant', 'parse'))
);

COMMENT ON TABLE public.org_ai_credit_ledger IS
  'Append-only prepaid credit grants and consumptions.';

CREATE INDEX org_ai_credit_ledger_org_created_idx
  ON public.org_ai_credit_ledger (org_id, created_at DESC);

DROP TRIGGER IF EXISTS org_ai_prepaid_credits_set_updated_at ON public.org_ai_prepaid_credits;
CREATE TRIGGER org_ai_prepaid_credits_set_updated_at
  BEFORE UPDATE ON public.org_ai_prepaid_credits
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.org_ai_prepaid_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_credit_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.org_ai_prepaid_credits FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.org_ai_credit_ledger FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.org_ai_prepaid_credits TO authenticated;
GRANT SELECT ON TABLE public.org_ai_credit_ledger TO authenticated;
GRANT ALL ON TABLE public.org_ai_prepaid_credits TO service_role;
GRANT ALL ON TABLE public.org_ai_credit_ledger TO service_role;

DROP POLICY IF EXISTS org_ai_prepaid_credits_select ON public.org_ai_prepaid_credits;
CREATE POLICY org_ai_prepaid_credits_select
  ON public.org_ai_prepaid_credits
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS org_ai_credit_ledger_select ON public.org_ai_credit_ledger;
CREATE POLICY org_ai_credit_ledger_select
  ON public.org_ai_credit_ledger
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_member(org_id))
  );

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.inbound_normalize_place(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(lower(btrim(COALESCE(p_text, ''))), '[[:punct:]]+', ' ', 'g'),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_ai_prepaid_balance(p_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT c.balance FROM public.org_ai_prepaid_credits c WHERE c.org_id = p_org_id),
    0
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_ai_monthly_used(p_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT u.parse_count
      FROM public.org_ai_usage_monthly u
      WHERE u.org_id = p_org_id
        AND u.year_month = private.inbound_month_start()
    ),
    0
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_ai_credit_available(p_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT GREATEST(private.inbound_ai_monthly_limit(p_org_id) - private.inbound_ai_monthly_used(p_org_id), 0)
       + private.inbound_ai_prepaid_balance(p_org_id);
$$;

CREATE OR REPLACE FUNCTION private.inbound_match_location(
  p_org_id uuid,
  p_location_id uuid,
  p_address_text text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_id uuid;
  v_count integer;
  v_norm text := private.inbound_normalize_place(p_address_text);
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

  IF v_norm IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)::integer, MIN(norm.id)
    INTO v_count, v_id
  FROM (
    SELECT
      cl.id,
      private.inbound_normalize_place(cl.address) AS addr,
      private.inbound_normalize_place(cl.name) AS name
    FROM public.cleaning_locations cl
    WHERE cl.org_id = p_org_id
      AND (cl.status IS NULL OR cl.status = 'active')
  ) norm
  WHERE norm.addr IS NOT DISTINCT FROM v_norm
     OR norm.name IS NOT DISTINCT FROM v_norm;

  IF v_count = 1 THEN
    RETURN v_id;
  END IF;
  IF v_count > 1 OR length(v_norm) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)::integer, MIN(norm.id)
    INTO v_count, v_id
  FROM (
    SELECT
      cl.id,
      private.inbound_normalize_place(cl.address) AS addr,
      private.inbound_normalize_place(cl.name) AS name
    FROM public.cleaning_locations cl
    WHERE cl.org_id = p_org_id
      AND (cl.status IS NULL OR cl.status = 'active')
  ) norm
  WHERE (
      norm.addr IS NOT NULL
      AND length(norm.addr) >= 8
      AND (position(v_norm IN norm.addr) > 0 OR position(norm.addr IN v_norm) > 0)
    )
    OR (
      norm.name IS NOT NULL
      AND length(norm.name) >= 8
      AND (position(v_norm IN norm.name) > 0 OR position(norm.name IN v_norm) > 0)
    );

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
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_month date := private.inbound_month_start();
  v_limit integer := private.inbound_ai_monthly_limit(p_org_id);
  v_used integer;
  v_balance integer;
  v_in bigint := GREATEST(COALESCE(p_prompt_tokens, 0), 0);
  v_out bigint := GREATEST(COALESCE(p_output_tokens, 0), 0);
BEGIN
  INSERT INTO public.org_ai_usage_monthly (org_id, year_month)
  VALUES (p_org_id, v_month)
  ON CONFLICT (org_id, year_month) DO NOTHING;

  SELECT u.parse_count
    INTO v_used
  FROM public.org_ai_usage_monthly u
  WHERE u.org_id = p_org_id
    AND u.year_month = v_month
  FOR UPDATE;

  v_used := COALESCE(v_used, 0);

  IF v_limit > 0 AND v_used < v_limit THEN
    UPDATE public.org_ai_usage_monthly
    SET parse_count = parse_count + 1,
        prompt_tokens = prompt_tokens + v_in,
        output_tokens = output_tokens + v_out
    WHERE org_id = p_org_id
      AND year_month = v_month;
    RETURN true;
  END IF;

  INSERT INTO public.org_ai_prepaid_credits (org_id, balance)
  VALUES (p_org_id, 0)
  ON CONFLICT (org_id) DO NOTHING;

  SELECT c.balance
    INTO v_balance
  FROM public.org_ai_prepaid_credits c
  WHERE c.org_id = p_org_id
  FOR UPDATE;

  IF COALESCE(v_balance, 0) < 1 THEN
    RETURN false;
  END IF;

  UPDATE public.org_ai_prepaid_credits
  SET balance = balance - 1
  WHERE org_id = p_org_id;

  INSERT INTO public.org_ai_credit_ledger (org_id, delta, reason)
  VALUES (p_org_id, -1, 'parse');

  UPDATE public.org_ai_usage_monthly
  SET prompt_tokens = prompt_tokens + v_in,
      output_tokens = output_tokens + v_out
  WHERE org_id = p_org_id
    AND year_month = v_month;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.inbound_normalize_place(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_ai_prepaid_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_ai_monthly_used(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_ai_credit_available(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_match_location(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_try_consume_ai_parse(uuid, bigint, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- resolve_inbound_mailbox — remaining = monthly leftover + prepaid
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
  v_prepaid integer;
  v_remaining integer;
  v_looks boolean;
BEGIN
  v_looks := private.inbound_looks_like_org_alias(v_alias);

  IF v_alias IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'looks_like_org_alias', false,
      'reject_reason', 'unrecognized_recipient'
    );
  END IF;

  SELECT * INTO v_box
  FROM public.org_inbound_mailboxes
  WHERE alias_local_part = v_alias
  LIMIT 1;

  IF v_box.id IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'alias_local_part', v_alias,
      'looks_like_org_alias', v_looks,
      'reject_reason', CASE WHEN v_looks THEN 'unknown_alias' ELSE 'unrecognized_recipient' END
    );
  END IF;

  v_limit := private.inbound_ai_monthly_limit(v_box.org_id);
  v_used := private.inbound_ai_monthly_used(v_box.org_id);
  v_prepaid := private.inbound_ai_prepaid_balance(v_box.org_id);
  v_remaining := GREATEST(v_limit - v_used, 0) + v_prepaid;

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
    'ai_prepaid_balance', v_prepaid,
    'ai_parses_remaining', v_remaining,
    'allow_ai_parse', (v_box.is_enabled AND v_remaining > 0),
    'looks_like_org_alias', v_looks,
    'reject_reason', CASE WHEN v_box.is_enabled THEN NULL ELSE 'mailbox_disabled' END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ingest_email_issue — known alias always becomes a property issue
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
  v_fallback text;
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

  v_name := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_name', '')), 120), '');
  v_phone := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_phone', '')), 40), '');
  v_email := NULLIF(left(btrim(COALESCE(v_parsed->>'reporter_email', COALESCE(p_from_address, ''))), 254), '');
  v_prompt := GREATEST(COALESCE((v_parsed->>'prompt_tokens')::bigint, 0), 0);
  v_output := GREATEST(COALESCE((v_parsed->>'output_tokens')::bigint, 0), 0);

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
-- Quota, grant, location choices, manual building assign
-- ---------------------------------------------------------------------------

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
  v_prepaid integer;
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
  v_used := private.inbound_ai_monthly_used(p_org_id);
  v_prepaid := private.inbound_ai_prepaid_balance(p_org_id);

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'year_month', v_month,
    'ai_parses_limit', v_limit,
    'ai_parses_used', v_used,
    'ai_prepaid_balance', v_prepaid,
    'ai_parses_remaining', GREATEST(v_limit - v_used, 0) + v_prepaid,
    'has_ai_auto', private.inbound_has_ai_auto(p_org_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_ai_prepaid_credits(
  p_org_id uuid,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Brak organizacji.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Nieprawidłowa liczba analiz.';
  END IF;
  IF NOT private.vendor_email_is_service_role()
     AND NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Brak uprawnień.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_org_id) THEN
    RAISE EXCEPTION 'Nie znaleziono organizacji.';
  END IF;

  INSERT INTO public.org_ai_prepaid_credits (org_id, balance)
  VALUES (p_org_id, 0)
  ON CONFLICT (org_id) DO NOTHING;

  UPDATE public.org_ai_prepaid_credits
  SET balance = balance + p_amount
  WHERE org_id = p_org_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.org_ai_credit_ledger (org_id, delta, reason)
  VALUES (p_org_id, p_amount, 'grant');

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'granted', p_amount,
    'ai_prepaid_balance', v_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_inbound_location_choices(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NOT private.vendor_email_is_service_role() THEN
    RAISE EXCEPTION 'Brak uprawnień.';
  END IF;
  IF p_org_id IS NULL THEN
    RETURN jsonb_build_object('choices', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'choices',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('id', picked.id, 'label', picked.label)
          ORDER BY picked.sort_key
        )
        FROM (
          SELECT
            cl.id,
            left(
              btrim(
                CASE
                  WHEN btrim(COALESCE(cl.name, '')) <> '' AND btrim(COALESCE(cl.address, '')) <> ''
                    THEN btrim(cl.name) || ' — ' || btrim(cl.address)
                  ELSE COALESCE(NULLIF(btrim(COALESCE(cl.name, '')), ''), NULLIF(btrim(COALESCE(cl.address, '')), ''), 'Budynek')
                END
              ),
              160
            ) AS label,
            lower(btrim(COALESCE(cl.name, cl.address, ''))) AS sort_key
          FROM public.cleaning_locations cl
          WHERE cl.org_id = p_org_id
            AND (cl.status IS NULL OR cl.status = 'active')
          ORDER BY lower(btrim(COALESCE(cl.name, cl.address, '')))
          LIMIT 40
        ) picked
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_issue_location(
  p_issue_id uuid,
  p_location_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_org uuid;
  v_loc public.cleaning_locations%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Wymagane logowanie.';
  END IF;
  IF p_issue_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'Wybierz zgłoszenie i budynek.';
  END IF;

  SELECT * INTO v_issue
  FROM public.property_issues
  WHERE id = p_issue_id;

  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  v_org := COALESCE(v_issue.origin_org_id, v_issue.org_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Zgłoszenie nie ma organizacji.';
  END IF;

  IF NOT (SELECT public.is_platform_admin())
     AND NOT (SELECT public.is_org_management(v_org)) THEN
    RAISE EXCEPTION 'Brak uprawnień do przypisania budynku.';
  END IF;

  IF v_issue.location_id IS NOT NULL THEN
    RAISE EXCEPTION 'Zgłoszenie ma już przypisany budynek.';
  END IF;

  SELECT * INTO v_loc
  FROM public.cleaning_locations
  WHERE id = p_location_id;

  IF v_loc.id IS NULL OR v_loc.org_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Budynek nie należy do tej organizacji.';
  END IF;
  IF v_loc.status IS NOT NULL AND v_loc.status <> 'active' THEN
    RAISE EXCEPTION 'Budynek nie jest aktywny.';
  END IF;
  IF v_loc.is_admin_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Budynek nie jest aktywny w module Administracja.';
  END IF;

  UPDATE public.property_issues
  SET location_id = v_loc.id,
      is_ai_draft = false
  WHERE id = v_issue.id;

  RETURN jsonb_build_object(
    'issue_id', v_issue.id,
    'location_id', v_loc.id,
    'is_ai_draft', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_inbound_mailbox(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_email_issue(text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_ai_quota(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_ai_prepaid_credits(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_inbound_location_choices(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_issue_location(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.resolve_inbound_mailbox(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_email_issue(text, text, text, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_org_ai_quota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_ai_prepaid_credits(uuid, integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.list_inbound_location_choices(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_issue_location(uuid, uuid) TO authenticated;
