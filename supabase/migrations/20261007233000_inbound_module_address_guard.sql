BEGIN;

-- Inbound mail may attach a ticket only to a building enrolled in the mailbox
-- module. Exact folded text is accepted. A typo stays for an administrator.
-- An address that module does not serve is rejected and does not become a ticket.

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS intake_module text,
  ADD COLUMN IF NOT EXISTS reported_address text,
  ADD COLUMN IF NOT EXISTS address_candidates jsonb;

ALTER TABLE public.property_issues
  DROP CONSTRAINT IF EXISTS property_issues_intake_module_chk;

ALTER TABLE public.property_issues
  ADD CONSTRAINT property_issues_intake_module_chk
  CHECK (intake_module IS NULL OR intake_module IN ('serwis', 'cleaning', 'administracja'));

COMMENT ON COLUMN public.property_issues.intake_module IS
  'Mailbox module that created the email ticket. Serwis and Administracja stay independent.';

COMMENT ON COLUMN public.property_issues.reported_address IS
  'Address text from the inbound email, kept when it was not an exact module match.';

COMMENT ON COLUMN public.property_issues.address_candidates IS
  'Possible enrolled buildings for an administrator to confirm after a typo.';

CREATE OR REPLACE FUNCTION private.inbound_location_serves_module(
  p_module text,
  p_status text,
  p_admin boolean,
  p_maintenance boolean,
  p_active_in_serwis boolean,
  p_cleaning boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_status IS NULL OR p_status = 'active')
    AND CASE p_module
      WHEN 'administracja' THEN p_admin IS TRUE
      WHEN 'serwis' THEN p_maintenance IS TRUE AND COALESCE(p_active_in_serwis, true) IS TRUE
      WHEN 'cleaning' THEN p_cleaning IS TRUE
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION private.inbound_fold_place(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(
            translate(
              btrim(COALESCE(p_text, '')),
              'ĄĆĘŁŃÓŚŹŻąćęłńóśźż',
              'ACELNOSZZacelnoszz'
            )
          ),
          '[^[:alnum:]]+',
          ' ',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_levenshtein(p_a text, p_b text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_a text := left(COALESCE(p_a, ''), 180);
  v_b text := left(COALESCE(p_b, ''), 180);
  v_la integer := length(v_a);
  v_lb integer := length(v_b);
  v_prev integer[];
  v_curr integer[];
  i integer;
  j integer;
  v_cost integer;
BEGIN
  IF v_la = 0 THEN
    RETURN v_lb;
  END IF;
  IF v_lb = 0 THEN
    RETURN v_la;
  END IF;

  v_prev := ARRAY(SELECT g FROM generate_series(0, v_lb) AS g);
  FOR i IN 1..v_la LOOP
    v_curr := ARRAY[i];
    FOR j IN 1..v_lb LOOP
      v_cost := CASE WHEN substr(v_a, i, 1) = substr(v_b, j, 1) THEN 0 ELSE 1 END;
      v_curr := v_curr || LEAST(v_prev[j + 1] + 1, v_curr[j] + 1, v_prev[j] + v_cost);
    END LOOP;
    v_prev := v_curr;
  END LOOP;
  RETURN v_prev[v_lb + 1];
END;
$$;

CREATE OR REPLACE FUNCTION private.inbound_premise_number(p_folded text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_tokens text[];
  i integer := 1;
  v_token text;
  v_next text;
BEGIN
  IF p_folded IS NULL THEN
    RETURN NULL;
  END IF;
  v_tokens := string_to_array(p_folded, ' ');
  WHILE i <= cardinality(v_tokens) LOOP
    v_token := v_tokens[i];
    v_next := CASE WHEN i < cardinality(v_tokens) THEN v_tokens[i + 1] ELSE NULL END;
    IF v_token ~ '^\d{2}$' AND v_next ~ '^\d{3}$' THEN
      i := i + 2;
      CONTINUE;
    END IF;
    IF v_token ~ '^\d{1,4}$' THEN
      RETURN v_token;
    END IF;
    i := i + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.inbound_alpha_place(p_folded text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(regexp_replace(regexp_replace(COALESCE(p_folded, ''), '\m\d+\M', ' ', 'g'), '\s+', ' ', 'g')),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_place_is_near(p_left text, p_right text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_left text;
  v_right text;
  v_shorter text;
  v_longer text;
  v_core text;
  v_dist integer;
  v_max integer;
BEGIN
  IF p_left IS NULL OR p_right IS NULL THEN
    RETURN false;
  END IF;
  IF private.inbound_premise_number(p_left) IS DISTINCT FROM private.inbound_premise_number(p_right) THEN
    RETURN false;
  END IF;

  v_left := private.inbound_alpha_place(p_left);
  v_right := private.inbound_alpha_place(p_right);
  IF v_left IS NULL OR v_right IS NULL THEN
    RETURN false;
  END IF;

  IF length(v_left) <= length(v_right) THEN
    v_shorter := v_left;
    v_longer := v_right;
  ELSE
    v_shorter := v_right;
    v_longer := v_left;
  END IF;

  v_dist := private.inbound_levenshtein(v_left, v_right);
  v_max := greatest(length(v_left), length(v_right));
  IF v_dist <= 2 THEN
    RETURN true;
  END IF;
  IF v_dist <= 4 AND (1 - v_dist::numeric / v_max) >= 0.88 THEN
    RETURN true;
  END IF;
  IF length(v_shorter) >= 10 AND position(v_shorter IN v_longer) > 0 THEN
    RETURN true;
  END IF;

  v_core := NULLIF(btrim(regexp_replace(v_longer, '\s+\S+$', '')), '');
  IF v_core IS NULL OR length(v_core) < 10 OR length(v_shorter) < 10 THEN
    RETURN false;
  END IF;
  v_dist := private.inbound_levenshtein(v_shorter, v_core);
  v_max := greatest(length(v_shorter), length(v_core));
  IF v_dist <= 2 THEN
    RETURN true;
  END IF;
  IF v_dist <= 4 AND (1 - v_dist::numeric / v_max) >= 0.88 THEN
    RETURN true;
  END IF;
  RETURN position(v_shorter IN v_core) > 0 OR position(v_core IN v_shorter) > 0;
END;
$$;

CREATE OR REPLACE FUNCTION private.inbound_place_label(p_name text, p_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    btrim(
      CASE
        WHEN btrim(COALESCE(p_name, '')) <> '' AND btrim(COALESCE(p_address, '')) <> ''
          THEN btrim(p_name) || ' — ' || btrim(p_address)
        ELSE COALESCE(NULLIF(btrim(COALESCE(p_name, '')), ''), NULLIF(btrim(COALESCE(p_address, '')), ''), 'Budynek')
      END
    ),
    160
  );
$$;

CREATE OR REPLACE FUNCTION private.inbound_resolve_served_address(
  p_org_id uuid,
  p_module text,
  p_address_text text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_input text := private.inbound_fold_place(p_address_text);
  v_exact uuid[] := '{}'::uuid[];
  v_near jsonb := '[]'::jsonb;
  r record;
  v_addr text;
  v_name text;
BEGIN
  FOR r IN
    SELECT
      cl.id,
      cl.address,
      cl.name,
      cl.status,
      cl.is_admin_active,
      cl.is_maintenance_active,
      cl.is_active_in_serwis,
      cl.is_cleaning_active
    FROM public.cleaning_locations cl
    WHERE cl.org_id = p_org_id
  LOOP
    IF NOT private.inbound_location_serves_module(
      p_module,
      r.status,
      r.is_admin_active,
      r.is_maintenance_active,
      r.is_active_in_serwis,
      r.is_cleaning_active
    ) THEN
      CONTINUE;
    END IF;

    v_addr := private.inbound_fold_place(r.address);
    v_name := private.inbound_fold_place(r.name);

    IF v_input IS NOT NULL AND (v_addr IS NOT DISTINCT FROM v_input OR v_name IS NOT DISTINCT FROM v_input) THEN
      v_exact := v_exact || r.id;
    ELSIF v_input IS NOT NULL
      AND (
        private.inbound_place_is_near(v_input, v_addr)
        OR private.inbound_place_is_near(v_input, v_name)
      )
      AND jsonb_array_length(v_near) < 8
    THEN
      v_near := v_near || jsonb_build_array(
        jsonb_build_object(
          'id', r.id,
          'label', private.inbound_place_label(r.name, r.address)
        )
      );
    END IF;
  END LOOP;

  IF v_input IS NULL THEN
    RETURN jsonb_build_object('outcome', 'review', 'location_id', NULL, 'candidates', '[]'::jsonb);
  END IF;

  IF cardinality(v_exact) = 1 THEN
    RETURN jsonb_build_object('outcome', 'exact', 'location_id', v_exact[1], 'candidates', '[]'::jsonb);
  END IF;

  IF cardinality(v_exact) > 1 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('id', cl.id, 'label', private.inbound_place_label(cl.name, cl.address))
      ),
      '[]'::jsonb
    )
      INTO v_near
    FROM public.cleaning_locations cl
    WHERE cl.id = ANY (v_exact);
    RETURN jsonb_build_object('outcome', 'review', 'location_id', NULL, 'candidates', v_near);
  END IF;

  IF jsonb_array_length(v_near) > 0 THEN
    RETURN jsonb_build_object('outcome', 'review', 'location_id', NULL, 'candidates', v_near);
  END IF;

  RETURN jsonb_build_object('outcome', 'reject', 'location_id', NULL, 'candidates', '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.property_issues_block_unlocated_accept()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.intake_module IS NOT NULL
     AND NEW.location_id IS NULL
     AND NEW.status IN (
       'open',
       'in_progress',
       'waiting_for_parts',
       'delegated',
       'resolved'
     )
  THEN
    RAISE EXCEPTION 'Zgłoszenie bez budynku z modułu tej firmy nie może być przyjęte.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_issues_block_unlocated_accept ON public.property_issues;
CREATE TRIGGER property_issues_block_unlocated_accept
  BEFORE INSERT OR UPDATE OF status, location_id, intake_module
  ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION private.property_issues_block_unlocated_accept();

-- ---------------------------------------------------------------------------
-- ingest_email_issue — module-scoped address guard
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
  v_resolved jsonb;
  v_outcome text;
  v_location uuid;
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

  -- Parsed location_id is ignored. Only the address text may match a building
  -- enrolled in this mailbox module.
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
      'ai_consumed', false,
      'is_ai_draft', false,
      'intake_module', v_box.module
    );
  END IF;

  IF v_method = 'ai' THEN
    v_consumed := private.inbound_try_consume_ai_parse(v_box.org_id, v_prompt, v_output);
    IF NOT v_consumed THEN
      v_error := 'ai_quota_exceeded';
      v_confidence := 0;
    END IF;
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
      v_released := now();
    ELSE
      v_source := 'email_ai'::public.issue_source_enum;
      v_issue_status := 'open'::public.issue_status_enum;
      v_released := now();
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

CREATE OR REPLACE FUNCTION public.list_inbound_location_choices(p_org_id uuid, p_module text)
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
  IF p_org_id IS NULL OR p_module IS NULL THEN
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
            private.inbound_place_label(cl.name, cl.address) AS label,
            lower(btrim(COALESCE(cl.name, cl.address, ''))) AS sort_key
          FROM public.cleaning_locations cl
          WHERE cl.org_id = p_org_id
            AND private.inbound_location_serves_module(
              p_module,
              cl.status,
              cl.is_admin_active,
              cl.is_maintenance_active,
              cl.is_active_in_serwis,
              cl.is_cleaning_active
            )
          ORDER BY lower(btrim(COALESCE(cl.name, cl.address, '')))
          LIMIT 40
        ) picked
      ),
      '[]'::jsonb
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.list_inbound_location_choices(uuid);

CREATE OR REPLACE FUNCTION public.list_inbound_location_choices(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT public.list_inbound_location_choices(p_org_id, NULL);
$$;

CREATE OR REPLACE FUNCTION public.assign_issue_location(
  p_issue_id uuid,
  p_location_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_org uuid;
  v_loc public.cleaning_locations%ROWTYPE;
  v_module text;
  v_status public.issue_status_enum;
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

  v_module := COALESCE(v_issue.intake_module, 'administracja');
  IF NOT private.inbound_location_serves_module(
    v_module,
    v_loc.status,
    v_loc.is_admin_active,
    v_loc.is_maintenance_active,
    v_loc.is_active_in_serwis,
    v_loc.is_cleaning_active
  ) THEN
    RAISE EXCEPTION 'Ten budynek nie jest obsługiwany w module, z którego przyszło zgłoszenie.';
  END IF;

  v_status := v_issue.status;
  IF v_issue.intake_module = 'serwis' AND v_issue.status = 'new' THEN
    v_status := 'open'::public.issue_status_enum;
  END IF;

  UPDATE public.property_issues
  SET location_id = v_loc.id,
      is_ai_draft = false,
      status = v_status
  WHERE id = v_issue.id;

  RETURN jsonb_build_object(
    'issue_id', v_issue.id,
    'location_id', v_loc.id,
    'is_ai_draft', false,
    'status', v_status,
    'intake_module', v_issue.intake_module
  );
END;
$$;

REVOKE ALL ON FUNCTION private.inbound_location_serves_module(text, text, boolean, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_fold_place(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_levenshtein(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_premise_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_alpha_place(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_place_is_near(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_place_label(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.inbound_resolve_served_address(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.property_issues_block_unlocated_accept() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.list_inbound_location_choices(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_inbound_location_choices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_inbound_location_choices(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_inbound_location_choices(uuid) TO service_role;

COMMIT;
