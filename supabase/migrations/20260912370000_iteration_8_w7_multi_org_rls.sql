-- =====================================================================
-- ITERACJA 8 - W7 multi-org
--
-- get_my_org_id_safe() zwraca jedna org (LIMIT 1 bez ORDER BY) - sygnatura
-- uuid jest uzywana w Administracji, Flocie i RPC marketplace, wiec NIE
-- zmieniamy typu. Dodajemy is_active + stabilny ORDER BY (najpierw kadra).
--
-- Polityki, ktore porownuja org_id = get_my_org_id_safe(), widzialy tylko
-- jedna losowa org. Cleaning RoleContext pobiera WSZYSTKIE memberships
-- uzytkownika pod wybor roli - przy dwoch org RLS ucinalo liste.
-- Dziwnych uzytkownikow multi-org jeszcze nie ma (0 w bazie), wiec zmiana
-- nie przestawia nikomu widoku, ale odblokowuje sukcesje/mandaty.
--
-- locations_final: is_manager_safe() jest GLOBALNE (manager w org A widzial
-- lokalizacje org B, jesli LIMIT 1 trafil na B). Zastepujemy org-scoped
-- is_org_management. Odczyt czlonkow zostaje na cleaning_locations_select_org_member.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(array_agg(DISTINCT m.org_id), '{}'::uuid[])
  FROM public.memberships m
  WHERE m.user_id = (SELECT auth.uid())
    AND COALESCE(m.is_active, true) = true;
$fn$;

REVOKE ALL ON FUNCTION public.current_user_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_org_id_safe()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT m.org_id
  FROM public.memberships m
  WHERE m.user_id = (SELECT auth.uid())
    AND COALESCE(m.is_active, true) = true
  ORDER BY
    CASE
      WHEN lower(btrim(COALESCE(m.role, ''))) IN (
        'owner', 'admin', 'administrator', 'wlasciciel', 'właściciel',
        'coordinator', 'koordynator', 'manager'
      ) THEN 0
      ELSE 1
    END,
    m.created_at ASC NULLS LAST,
    m.id ASC
  LIMIT 1;
$fn$;

-- ---- memberships SELECT: wszystkie org uzytkownika + wlasne wiersze
DROP POLICY IF EXISTS "memberships_final" ON public.memberships;
DROP POLICY IF EXISTS "memberships_select_own_orgs" ON public.memberships;
CREATE POLICY "memberships_select_own_orgs"
  ON public.memberships FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR org_id = ANY (public.current_user_org_ids())
  );

-- ---- cleaning_locations leftover policy
DROP POLICY IF EXISTS "locations_final" ON public.cleaning_locations;
DROP POLICY IF EXISTS "cleaning_locations_select_assigned_or_mgmt" ON public.cleaning_locations;
CREATE POLICY "cleaning_locations_select_assigned_or_mgmt"
  ON public.cleaning_locations FOR SELECT TO authenticated
  USING (
    public.is_org_management(org_id)
    OR id IN (
      SELECT t.location_id FROM public.cleaning_tasks t
      WHERE t.assigned_staff_id = (SELECT auth.uid())
    )
  );

-- ---- vendor delegated issues: wszystkie org aktora, nie LIMIT 1
DROP POLICY IF EXISTS "Vendors can view delegated issues" ON public.property_issues;
CREATE POLICY "property_issues_select_delegated_vendor"
  ON public.property_issues FOR SELECT TO authenticated
  USING (
    delegated_vendor_id IN (
      SELECT vp.id FROM public.vendor_partners vp
      WHERE vp.org_id = ANY (public.current_user_org_ids())
    )
  );

DROP POLICY IF EXISTS "Vendors can update delegated issues" ON public.property_issues;
CREATE POLICY "property_issues_update_delegated_vendor"
  ON public.property_issues FOR UPDATE TO authenticated
  USING (
    delegated_vendor_id IN (
      SELECT vp.id FROM public.vendor_partners vp
      WHERE vp.org_id = ANY (public.current_user_org_ids())
    )
  )
  WITH CHECK (
    delegated_vendor_id IN (
      SELECT vp.id FROM public.vendor_partners vp
      WHERE vp.org_id = ANY (public.current_user_org_ids())
    )
  );
