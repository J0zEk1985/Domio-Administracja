-- Wave B+C: org policies on empty modules, token-scoped public QR RPCs,
-- scoped e-board kiosk, storage write tightening, definer hygiene.
-- Isolation remains memberships.org_id / location_access (no per-subscriber DBs).
-- Anon does not get table-wide SELECT on cleaning_locations or e_board_messages.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_management(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
      AND COALESCE(m.is_active, true) = true
      AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_location_access(target_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_access la
    WHERE la.location_id = target_location_id
      AND la.user_id = auth.uid()
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_management(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_location_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_management(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_location_access(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public QR: token lookup + issue insert (SECURITY DEFINER, no table GRANT to anon)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_location_by_public_qr_token(p_token text)
RETURNS TABLE(id uuid, org_id uuid, address text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := trim(COALESCE(p_token, ''));
  v_uuid uuid;
BEGIN
  IF length(v_token) < 16 THEN
    RETURN;
  END IF;

  BEGIN
    v_uuid := v_token::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_uuid := NULL;
  END;

  RETURN QUERY
  SELECT cl.id, cl.org_id, cl.address
  FROM public.cleaning_locations cl
  WHERE COALESCE(cl.is_maintenance_active, true) = true
    AND (cl.status IS NULL OR cl.status IN ('active', 'archived'))
    AND (
      (v_uuid IS NOT NULL AND (cl.issue_qr_token = v_uuid OR cl.public_report_token = v_uuid))
      OR (cl.qr_code_token IS NOT NULL AND cl.qr_code_token = v_token)
    )
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_public_qr_issue(
  p_token text,
  p_description text,
  p_reporter_name text,
  p_reporter_phone text,
  p_photos_before text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location public.cleaning_locations%ROWTYPE;
  v_issue_id uuid;
  v_description text := trim(COALESCE(p_description, ''));
  v_name text := trim(COALESCE(p_reporter_name, ''));
  v_phone text := trim(COALESCE(p_reporter_phone, ''));
BEGIN
  IF length(v_description) < 1 OR length(v_description) > 500 THEN
    RAISE EXCEPTION 'Nieprawidłowy opis zgłoszenia';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Nieprawidłowe imię zgłaszającego';
  END IF;
  IF length(v_phone) < 1 OR length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Nieprawidłowy numer telefonu';
  END IF;

  SELECT cl.*
  INTO v_location
  FROM public.lookup_location_by_public_qr_token(p_token) loc
  JOIN public.cleaning_locations cl ON cl.id = loc.id
  LIMIT 1;

  IF v_location.id IS NULL THEN
    RAISE EXCEPTION 'Nieprawidłowy lub nieaktywny token QR';
  END IF;

  INSERT INTO public.property_issues (
    location_id,
    org_id,
    description,
    reporter_name,
    reporter_phone,
    reporter_type,
    priority,
    status,
    photos_before,
    source
  )
  VALUES (
    v_location.id,
    v_location.org_id,
    v_description,
    v_name,
    v_phone,
    'tenant',
    'medium',
    'pending_admin_approval',
    CASE WHEN p_photos_before IS NOT NULL AND cardinality(p_photos_before) > 0 THEN p_photos_before ELSE NULL END,
    'public_qr'
  )
  RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_published_eboard_messages(p_community_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  msg_type public.eboard_msg_type,
  valid_until timestamptz,
  display_from timestamptz,
  display_until timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.title,
    m.content,
    m.msg_type,
    m.valid_until,
    m.display_from,
    m.display_until,
    m.created_at
  FROM public.e_board_messages m
  WHERE m.community_id = p_community_id
    AND m.status = 'published'
    AND COALESCE(m.is_active, true) = true
    AND (m.valid_until IS NULL OR m.valid_until >= CURRENT_DATE)
  ORDER BY m.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.lookup_location_by_public_qr_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_public_qr_issue(text, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_published_eboard_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_location_by_public_qr_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_public_qr_issue(text, text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_eboard_messages(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- cleaning_locations: org / resident SELECT + management write (keep locations_final)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cleaning_locations_select_org_member ON public.cleaning_locations;
DROP POLICY IF EXISTS cleaning_locations_select_resident ON public.cleaning_locations;
DROP POLICY IF EXISTS cleaning_locations_write_management ON public.cleaning_locations;

CREATE POLICY cleaning_locations_select_org_member
  ON public.cleaning_locations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY cleaning_locations_select_resident
  ON public.cleaning_locations
  FOR SELECT
  TO authenticated
  USING (public.has_active_location_access(id));

CREATE POLICY cleaning_locations_write_management
  ON public.cleaning_locations
  FOR ALL
  TO authenticated
  USING (public.is_org_management(org_id))
  WITH CHECK (public.is_org_management(org_id));

REVOKE ALL ON TABLE public.cleaning_locations FROM anon;

-- ---------------------------------------------------------------------------
-- property_issues: no anon table INSERT (public QR goes through RPC)
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.property_issues FROM anon;

-- ---------------------------------------------------------------------------
-- e_board: drop global anon SELECT; residents keep published rows for their buildings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Publiczna widoczność aktywnych ogłoszeń" ON public.e_board_messages;
DROP POLICY IF EXISTS e_board_select_resident_published ON public.e_board_messages;

CREATE POLICY e_board_select_resident_published
  ON public.e_board_messages
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND (
      public.is_org_member(org_id)
      OR (location_id IS NOT NULL AND public.has_active_location_access(location_id))
      OR (
        location_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.location_access la
          JOIN public.cleaning_locations cl ON cl.id = la.location_id
          WHERE la.user_id = auth.uid()
            AND cl.org_id = e_board_messages.org_id
            AND (la.expires_at IS NULL OR la.expires_at > now())
        )
      )
    )
  );

REVOKE ALL ON TABLE public.e_board_messages FROM anon;

-- ---------------------------------------------------------------------------
-- Empty modules: org-scoped policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_partners_org_all ON public.vendor_partners;
CREATE POLICY vendor_partners_org_all
  ON public.vendor_partners
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
REVOKE ALL ON TABLE public.vendor_partners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_partners TO authenticated;

DROP POLICY IF EXISTS partner_offers_org_all ON public.partner_offers;
DROP POLICY IF EXISTS partner_offers_select_resident ON public.partner_offers;
CREATE POLICY partner_offers_org_all
  ON public.partner_offers
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY partner_offers_select_resident
  ON public.partner_offers
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_active, true) = true
    AND (
      (location_id IS NOT NULL AND public.has_active_location_access(location_id))
      OR (
        location_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.location_access la
          JOIN public.cleaning_locations cl ON cl.id = la.location_id
          WHERE la.user_id = auth.uid()
            AND cl.org_id = partner_offers.org_id
            AND (la.expires_at IS NULL OR la.expires_at > now())
        )
      )
    )
  );
REVOKE ALL ON TABLE public.partner_offers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_offers TO authenticated;

DROP POLICY IF EXISTS resident_configs_org_all ON public.resident_configs;
DROP POLICY IF EXISTS resident_configs_select_resident ON public.resident_configs;
CREATE POLICY resident_configs_org_all
  ON public.resident_configs
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY resident_configs_select_resident
  ON public.resident_configs
  FOR SELECT
  TO authenticated
  USING (public.has_active_location_access(location_id));
REVOKE ALL ON TABLE public.resident_configs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_configs TO authenticated;

DROP POLICY IF EXISTS org_subscriptions_org_all ON public.org_subscriptions;
CREATE POLICY org_subscriptions_org_all
  ON public.org_subscriptions
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
REVOKE ALL ON TABLE public.org_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.org_subscriptions TO authenticated;

DROP POLICY IF EXISTS community_board_org_all ON public.community_board;
DROP POLICY IF EXISTS community_board_select_resident ON public.community_board;
DROP POLICY IF EXISTS community_board_insert_resident ON public.community_board;
CREATE POLICY community_board_org_all
  ON public.community_board
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY community_board_select_resident
  ON public.community_board
  FOR SELECT
  TO authenticated
  USING (public.has_active_location_access(location_id));
CREATE POLICY community_board_insert_resident
  ON public.community_board
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.has_active_location_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.id = community_board.location_id
        AND cl.org_id = community_board.org_id
    )
  );
REVOKE ALL ON TABLE public.community_board FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_board TO authenticated;

DROP POLICY IF EXISTS internal_tasks_org_all ON public.internal_tasks;
CREATE POLICY internal_tasks_org_all
  ON public.internal_tasks
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
REVOKE ALL ON TABLE public.internal_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.internal_tasks TO authenticated;

DROP POLICY IF EXISTS material_requests_org_all ON public.material_requests;
CREATE POLICY material_requests_org_all
  ON public.material_requests
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
REVOKE ALL ON TABLE public.material_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.material_requests TO authenticated;

DROP POLICY IF EXISTS inspections_hybrid_org_all ON public.inspections_hybrid;
CREATE POLICY inspections_hybrid_org_all
  ON public.inspections_hybrid
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
REVOKE ALL ON TABLE public.inspections_hybrid FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspections_hybrid TO authenticated;

DROP POLICY IF EXISTS inspections_org_via_location ON public.inspections;
CREATE POLICY inspections_org_via_location
  ON public.inspections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.id = inspections.location_id
        AND public.is_org_member(cl.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.id = inspections.location_id
        AND public.is_org_member(cl.org_id)
    )
  );
REVOKE ALL ON TABLE public.inspections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspections TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: keep public_qr anon upload; stop anon writes on other buckets
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "DOMIO Cleaning 10b10vm_0" ON storage.objects;
DROP POLICY IF EXISTS property_issues_bucket_insert_authenticated ON storage.objects;
CREATE POLICY property_issues_bucket_insert_authenticated
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'property-issues');

DROP POLICY IF EXISTS "DOMIO Cleaning 10b10vm_2" ON storage.objects;
DROP POLICY IF EXISTS property_issues_bucket_update_authenticated ON storage.objects;
CREATE POLICY property_issues_bucket_update_authenticated
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'property-issues')
  WITH CHECK (bucket_id = 'property-issues');

DROP POLICY IF EXISTS "zadania 1kp2d3p_1" ON storage.objects;
DROP POLICY IF EXISTS cleaning_photos_insert_authenticated ON storage.objects;
CREATE POLICY cleaning_photos_insert_authenticated
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cleaning-photos');

DROP POLICY IF EXISTS "zadania 1kp2d3p_2" ON storage.objects;
DROP POLICY IF EXISTS cleaning_photos_update_authenticated ON storage.objects;
CREATE POLICY cleaning_photos_update_authenticated
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'cleaning-photos')
  WITH CHECK (bucket_id = 'cleaning-photos');

-- ---------------------------------------------------------------------------
-- Hygiene: search_path + revoke anon EXECUTE on unused definers
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.check_location_proximity(uuid, double precision, double precision)
  SET search_path = public;
ALTER FUNCTION public.check_org_access(uuid) SET search_path = public;
ALTER FUNCTION public.get_auth_org_ids() SET search_path = public;
ALTER FUNCTION public.get_user_highest_role(uuid) SET search_path = public;
ALTER FUNCTION public.is_admin_safe(uuid) SET search_path = public;
ALTER FUNCTION public.is_management_role(uuid) SET search_path = public;
ALTER FUNCTION public.is_manager() SET search_path = public;
ALTER FUNCTION public.is_platform_admin() SET search_path = public;
ALTER FUNCTION public.log_rate_changes() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_ckob_api_key(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ckob_api_key(uuid) TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT LIKE 'st_%'
      AND p.proname NOT IN (
        'lookup_location_by_public_qr_token',
        'insert_public_qr_issue',
        'get_published_eboard_messages'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      r.proname,
      r.args
    );
  END LOOP;
END
$$;
