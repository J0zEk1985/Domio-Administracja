-- Wave A P0: tenant isolation on the shared Domio database.
-- Isolation is memberships.org_id only (no per-subscriber databases).
-- Does not touch cleaning_locations / property_issues anon QR paths.

-- ---------------------------------------------------------------------------
-- 1. admin_contracts: enable RLS, org membership policies, revoke anon
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_contracts_org_select ON public.admin_contracts;
DROP POLICY IF EXISTS admin_contracts_org_insert ON public.admin_contracts;
DROP POLICY IF EXISTS admin_contracts_org_update ON public.admin_contracts;
DROP POLICY IF EXISTS admin_contracts_org_delete ON public.admin_contracts;

CREATE POLICY admin_contracts_org_select
  ON public.admin_contracts
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY admin_contracts_org_insert
  ON public.admin_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY admin_contracts_org_update
  ON public.admin_contracts
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY admin_contracts_org_delete
  ON public.admin_contracts
  FOR DELETE
  TO authenticated
  USING (public.is_org_member(org_id));

REVOKE ALL ON TABLE public.admin_contracts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_contracts TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. vehicles: companion policies so security_invoker views are not empty
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vehicles_select_org_member ON public.vehicles;
DROP POLICY IF EXISTS vehicles_select_assigned_driver ON public.vehicles;
DROP POLICY IF EXISTS vehicles_write_management ON public.vehicles;

CREATE POLICY vehicles_select_org_member
  ON public.vehicles
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY vehicles_select_assigned_driver
  ON public.vehicles
  FOR SELECT
  TO authenticated
  USING (assigned_driver_id = auth.uid());

CREATE POLICY vehicles_write_management
  ON public.vehicles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.org_id = vehicles.org_id
        AND m.user_id = auth.uid()
        AND COALESCE(m.is_active, true) = true
        AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.org_id = vehicles.org_id
        AND m.user_id = auth.uid()
        AND COALESCE(m.is_active, true) = true
        AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
    )
  );

REVOKE ALL ON TABLE public.vehicles FROM anon;

-- ---------------------------------------------------------------------------
-- 3. Fleet views: respect RLS of underlying tables; revoke anon
-- ---------------------------------------------------------------------------
ALTER VIEW public.v_upcoming_deadlines SET (security_invoker = true);
ALTER VIEW public.v_active_notifications SET (security_invoker = true);

REVOKE ALL ON TABLE public.v_upcoming_deadlines FROM anon;
REVOKE ALL ON TABLE public.v_active_notifications FROM anon;
GRANT SELECT ON TABLE public.v_upcoming_deadlines TO authenticated;
GRANT SELECT ON TABLE public.v_active_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. locations: drop global authenticated read (keep org-scoped policies)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Locations_Master_Read_All" ON public.locations;
DROP POLICY IF EXISTS "Read_All_Locations_Authenticated" ON public.locations;

-- ---------------------------------------------------------------------------
-- 5. RPCs: keep EXECUTE for authenticated (invite flows), revoke anon
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profile_by_email(target_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND COALESCE(m.is_active, true) = true
      AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT json_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'source', 'profile'
  ) INTO result
  FROM public.profiles p
  WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(target_email))
  LIMIT 1;

  IF result IS NULL THEN
    SELECT json_build_object(
      'id', u.id,
      'full_name', '',
      'email', u.email,
      'source', 'auth'
    ) INTO result
    FROM auth.users u
    WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(target_email))
    LIMIT 1;
  END IF;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_user_to_org(
  target_user_id uuid,
  target_org_id uuid,
  target_role text,
  target_full_name text,
  target_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.org_id = target_org_id
      AND COALESCE(m.is_active, true) = true
      AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, updated_at, accepted_terms_at, account_type)
  VALUES (target_user_id, target_full_name, target_email, now(), now(), 'hub')
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
      account_type = 'hub';

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = target_user_id AND org_id = target_org_id
  ) THEN
    INSERT INTO public.memberships (user_id, org_id, role)
    VALUES (target_user_id, target_org_id, target_role);
  END IF;

  INSERT INTO public.cleaning_staff (id, org_id, full_name, contact_email, status, employment_type)
  VALUES (target_user_id, target_org_id, target_full_name, target_email, 'active', 'b2b')
  ON CONFLICT (id) DO UPDATE
  SET org_id = EXCLUDED.org_id,
      contact_email = EXCLUDED.contact_email,
      full_name = EXCLUDED.full_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profile_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_email(text) TO authenticated;

REVOKE ALL ON FUNCTION public.link_user_to_org(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_user_to_org(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_user_to_org(uuid, uuid, text, text, text) TO authenticated;
