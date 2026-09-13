-- =====================================================================
-- ITERACJA 7 - W4 (zapis FOR ALL bez roli) + W5 (cleaner issue org spoof)
--
-- W4: polityki ALL oparte o samo czlonkostwo / location_access dawaly
--     sprzataczce i mieszkancowi INSERT/UPDATE/DELETE na wspolnotach,
--     e-tablicy, tablicy ogloszen, konfiguracji mieszkanca i przegladach.
--     Odczyt zostaje jak byl. Zapis wymaga zespolu administracyjnego
--     (TEAM_ADMIN_ROLES + aliasy PL), NIE is_management_role - zeby
--     asystent i ksiegiowa w Administracji nadal zapisywali przeglady
--     i wspolnoty.
--
-- W5: insert/update sprzataczki nie wiazal org_id z budynkiem, a
--     tg_fill_location_continuity NIE nadpisuje org_id na property_issues.
--     Frontend zawsze wysyla location_id (IssueReportSection).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_org_admin_team(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = (SELECT auth.uid())
      AND COALESCE(m.is_active, true) = true
      AND lower(btrim(COALESCE(m.role, ''))) IN (
        'owner', 'admin', 'administrator', 'manager',
        'coordinator', 'koordynator',
        'wlasciciel', 'właściciel',
        'assistant', 'accountant'
      )
  );
$fn$;

REVOKE ALL ON FUNCTION public.is_org_admin_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin_team(uuid) TO authenticated, service_role;

-- ---- communities ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage their communities" ON public.communities;
DROP POLICY IF EXISTS "communities_select_member" ON public.communities;
DROP POLICY IF EXISTS "communities_write_admin_team" ON public.communities;

CREATE POLICY "communities_select_member"
  ON public.communities FOR SELECT TO authenticated
  USING (org_id IN (SELECT m.org_id FROM public.memberships m WHERE m.user_id = (SELECT auth.uid())));

CREATE POLICY "communities_write_admin_team"
  ON public.communities FOR ALL TO authenticated
  USING (public.is_org_admin_team(org_id))
  WITH CHECK (public.is_org_admin_team(org_id));

-- ---- e_board_messages ----------------------------------------------
DROP POLICY IF EXISTS "Admins can manage e-board" ON public.e_board_messages;
DROP POLICY IF EXISTS "e_board_select_member" ON public.e_board_messages;
DROP POLICY IF EXISTS "e_board_write_admin_team" ON public.e_board_messages;

CREATE POLICY "e_board_select_member"
  ON public.e_board_messages FOR SELECT TO authenticated
  USING (org_id IN (SELECT m.org_id FROM public.memberships m WHERE m.user_id = (SELECT auth.uid())));

CREATE POLICY "e_board_write_admin_team"
  ON public.e_board_messages FOR ALL TO authenticated
  USING (public.is_org_admin_team(org_id))
  WITH CHECK (public.is_org_admin_team(org_id));

-- ---- community_board -----------------------------------------------
DROP POLICY IF EXISTS "community_board_org_all" ON public.community_board;
DROP POLICY IF EXISTS "community_board_select_member" ON public.community_board;
DROP POLICY IF EXISTS "community_board_write_admin_team" ON public.community_board;

CREATE POLICY "community_board_select_member"
  ON public.community_board FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "community_board_write_admin_team"
  ON public.community_board FOR ALL TO authenticated
  USING (public.is_org_admin_team(org_id))
  WITH CHECK (public.is_org_admin_team(org_id));

-- ---- resident_configs ----------------------------------------------
DROP POLICY IF EXISTS "resident_configs_org_all" ON public.resident_configs;
DROP POLICY IF EXISTS "resident_configs_select_member" ON public.resident_configs;
DROP POLICY IF EXISTS "resident_configs_write_admin_team" ON public.resident_configs;

CREATE POLICY "resident_configs_select_member"
  ON public.resident_configs FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "resident_configs_write_admin_team"
  ON public.resident_configs FOR ALL TO authenticated
  USING (public.is_org_admin_team(org_id))
  WITH CHECK (public.is_org_admin_team(org_id));

-- ---- property_inspections ------------------------------------------
DROP POLICY IF EXISTS "Users can access inspections for their locations" ON public.property_inspections;
DROP POLICY IF EXISTS "property_inspections_select_resident" ON public.property_inspections;
DROP POLICY IF EXISTS "property_inspections_write_admin_team" ON public.property_inspections;

CREATE POLICY "property_inspections_select_resident"
  ON public.property_inspections FOR SELECT TO authenticated
  USING (
    location_id IN (
      SELECT la.location_id FROM public.location_access la
      WHERE la.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "property_inspections_write_admin_team"
  ON public.property_inspections FOR ALL TO authenticated
  USING (public.is_org_admin_team(org_id))
  WITH CHECK (
    public.is_org_admin_team(org_id)
    AND org_id = (SELECT cl.org_id FROM public.cleaning_locations cl WHERE cl.id = location_id)
  );

-- ---- W5 property_issues cleaner insert/update ----------------------
DROP POLICY IF EXISTS "property_issues_insert_for_cleaners" ON public.property_issues;
CREATE POLICY "property_issues_insert_for_cleaners"
  ON public.property_issues FOR INSERT TO authenticated
  WITH CHECK (
    source = 'cleaning'::issue_source_enum
    AND reporter_id = (SELECT auth.uid())
    AND location_id IS NOT NULL
    AND public.cleaner_assigned_to_issue_location(location_id)
    AND org_id IS NOT NULL
    AND org_id = (SELECT cl.org_id FROM public.cleaning_locations cl WHERE cl.id = location_id)
  );

DROP POLICY IF EXISTS "property_issues_update_for_cleaners" ON public.property_issues;
CREATE POLICY "property_issues_update_for_cleaners"
  ON public.property_issues FOR UPDATE TO authenticated
  USING (
    public.issue_is_in_cleaning_queue(source, released_from_cleaning_at, reporter_type)
    AND reporter_id = (SELECT auth.uid())
  )
  WITH CHECK (
    source = 'cleaning'::issue_source_enum
    AND reporter_id = (SELECT auth.uid())
    AND released_from_cleaning_at IS NULL
    AND location_id IS NOT NULL
    AND public.cleaner_assigned_to_issue_location(location_id)
    AND org_id IS NOT NULL
    AND org_id = (SELECT cl.org_id FROM public.cleaning_locations cl WHERE cl.id = location_id)
  );
