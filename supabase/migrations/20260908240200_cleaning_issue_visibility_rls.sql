-- Layer 2: isolate Cleaning vs Serwis at RLS for cleaners and technicians.
-- Management (owner/coordinator) keeps org-wide ALL — same JWT is used in all apps.

-- ---------------------------------------------------------------------------
-- Helpers (STABLE/IMMUTABLE; wrap auth.uid() in SELECT for initplan)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_is_cleaning_origin(
  p_source public.issue_source_enum,
  p_reporter_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_source = 'cleaning'::public.issue_source_enum
    OR lower(btrim(COALESCE(p_reporter_type, ''))) IN ('cleaner', 'sprzataczka');
$$;

COMMENT ON FUNCTION public.issue_is_cleaning_origin(public.issue_source_enum, text) IS
  'True when the ticket was created by DOMIO Cleaning personnel.';

CREATE OR REPLACE FUNCTION public.issue_is_in_cleaning_queue(
  p_source public.issue_source_enum,
  p_released_at timestamptz,
  p_reporter_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.issue_is_cleaning_origin(p_source, p_reporter_type)
    AND p_released_at IS NULL;
$$;

COMMENT ON FUNCTION public.issue_is_in_cleaning_queue(public.issue_source_enum, timestamptz, text) IS
  'True while a Cleaning-origin ticket has not been handed off.';

CREATE OR REPLACE FUNCTION public.issue_is_visible_to_serwis(
  p_source public.issue_source_enum,
  p_released_at timestamptz,
  p_status public.issue_status_enum,
  p_reporter_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IS DISTINCT FROM 'pending_cleaning_review'::public.issue_status_enum
    AND p_status IS DISTINCT FROM 'pending_admin_approval'::public.issue_status_enum
    AND NOT public.issue_is_in_cleaning_queue(p_source, p_released_at, p_reporter_type);
$$;

COMMENT ON FUNCTION public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text
) IS
  'False for Cleaning-internal or Administracja-pending tickets.';

CREATE OR REPLACE FUNCTION public.cleaner_assigned_to_issue_location(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_location_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.cleaning_tasks t
        WHERE t.assigned_staff_id = (SELECT auth.uid())
          AND t.location_id = p_location_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.property_sections s
        WHERE s.assigned_staff_id = (SELECT auth.uid())
          AND s.location_id = p_location_id
      )
    );
$$;

COMMENT ON FUNCTION public.cleaner_assigned_to_issue_location(uuid) IS
  'True when the current user is assigned to the building via cleaning_tasks or property_sections.';

REVOKE ALL ON FUNCTION public.issue_is_cleaning_origin(public.issue_source_enum, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_is_in_cleaning_queue(public.issue_source_enum, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleaner_assigned_to_issue_location(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_is_cleaning_origin(public.issue_source_enum, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_is_in_cleaning_queue(public.issue_source_enum, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleaner_assigned_to_issue_location(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cleaners: only Cleaning-origin tickets on assigned buildings
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS property_issues_select_for_cleaners ON public.property_issues;
CREATE POLICY property_issues_select_for_cleaners
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    public.issue_is_cleaning_origin(source, reporter_type)
    AND (
      reporter_id = (SELECT auth.uid())
      OR public.cleaner_assigned_to_issue_location(location_id)
    )
  );

DROP POLICY IF EXISTS property_issues_insert_for_cleaners ON public.property_issues;
CREATE POLICY property_issues_insert_for_cleaners
  ON public.property_issues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    source = 'cleaning'::public.issue_source_enum
    AND reporter_id = (SELECT auth.uid())
    AND (
      location_id IS NULL
      OR public.cleaner_assigned_to_issue_location(location_id)
    )
  );

DROP POLICY IF EXISTS property_issues_update_for_cleaners ON public.property_issues;
CREATE POLICY property_issues_update_for_cleaners
  ON public.property_issues
  FOR UPDATE
  TO authenticated
  USING (
    public.issue_is_in_cleaning_queue(source, released_from_cleaning_at, reporter_type)
    AND reporter_id = (SELECT auth.uid())
  )
  WITH CHECK (
    source = 'cleaning'::public.issue_source_enum
    AND reporter_id = (SELECT auth.uid())
    AND released_from_cleaning_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- Technicians: never see Cleaning queue or pending admin approval
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS property_issues_select_for_technicians ON public.property_issues;
CREATE POLICY property_issues_select_for_technicians
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.is_serwis_technician_role(org_id)
    AND public.issue_is_visible_to_serwis(
      source,
      released_from_cleaning_at,
      status,
      reporter_type
    )
    AND (
      assigned_staff_id = (SELECT auth.uid())
      OR (status = 'open'::public.issue_status_enum AND assigned_staff_id IS NULL)
    )
  );

DROP POLICY IF EXISTS property_issues_update_for_technicians ON public.property_issues;
CREATE POLICY property_issues_update_for_technicians
  ON public.property_issues
  FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.is_serwis_technician_role(org_id)
    AND public.issue_is_visible_to_serwis(
      source,
      released_from_cleaning_at,
      status,
      reporter_type
    )
    AND (
      assigned_staff_id = (SELECT auth.uid())
      OR (status = 'open'::public.issue_status_enum AND assigned_staff_id IS NULL)
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND public.is_serwis_technician_role(org_id)
    AND public.issue_is_visible_to_serwis(
      source,
      released_from_cleaning_at,
      status,
      reporter_type
    )
    AND assigned_staff_id = (SELECT auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Marketplace + claimed-org technician branch
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS property_issues_select_open_marketplace ON public.property_issues;
CREATE POLICY property_issues_select_open_marketplace
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    public.issue_is_visible_to_serwis(
      source,
      released_from_cleaning_at,
      status,
      reporter_type
    )
    AND public.actor_can_see_open_marketplace(
      is_public_broadcast,
      marketplace_scope,
      location_id,
      claimed_by_org_id,
      assigned_staff_id,
      status
    )
  );

DROP POLICY IF EXISTS property_issues_select_claimed_org ON public.property_issues;
CREATE POLICY property_issues_select_claimed_org
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    claimed_by_org_id IS NOT NULL
    AND (
      public.is_management_role(claimed_by_org_id)
      OR public.is_serwis_dispatcher_or_owner(claimed_by_org_id)
      OR (
        public.is_serwis_technician_role(claimed_by_org_id)
        AND public.issue_is_visible_to_serwis(
          source,
          released_from_cleaning_at,
          status,
          reporter_type
        )
        AND (
          assigned_staff_id = (SELECT auth.uid())
          OR assigned_staff_id IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS property_issues_update_claimed_org ON public.property_issues;
CREATE POLICY property_issues_update_claimed_org
  ON public.property_issues
  FOR UPDATE
  TO authenticated
  USING (
    claimed_by_org_id IS NOT NULL
    AND (
      public.is_management_role(claimed_by_org_id)
      OR public.is_serwis_dispatcher_or_owner(claimed_by_org_id)
      OR (
        public.is_serwis_technician_role(claimed_by_org_id)
        AND public.issue_is_visible_to_serwis(
          source,
          released_from_cleaning_at,
          status,
          reporter_type
        )
        AND (
          assigned_staff_id = (SELECT auth.uid())
          OR assigned_staff_id IS NULL
        )
      )
    )
  )
  WITH CHECK (
    claimed_by_org_id IS NOT NULL
    AND (
      public.is_management_role(claimed_by_org_id)
      OR public.is_serwis_dispatcher_or_owner(claimed_by_org_id)
      OR (
        public.is_serwis_technician_role(claimed_by_org_id)
        AND public.issue_is_visible_to_serwis(
          source,
          released_from_cleaning_at,
          status,
          reporter_type
        )
      )
    )
  );
