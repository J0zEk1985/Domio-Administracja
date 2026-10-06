BEGIN;

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS released_to_serwis_at timestamptz;

COMMENT ON COLUMN public.property_issues.released_to_serwis_at IS
  'Set when Administracja deliberately hands the ticket to Serwis (accept, assign, broadcast, delegate).';

CREATE OR REPLACE FUNCTION public.stamp_released_to_serwis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.released_to_serwis_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.immediate_fulfillment IS TRUE OR NEW.emergency_mode IS TRUE THEN
      NEW.released_to_serwis_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_public_broadcast IS TRUE AND OLD.is_public_broadcast IS DISTINCT FROM TRUE THEN
    NEW.released_to_serwis_at := now();
    RETURN NEW;
  END IF;

  IF NEW.assigned_staff_id IS NOT NULL
     AND OLD.assigned_staff_id IS DISTINCT FROM NEW.assigned_staff_id THEN
    NEW.released_to_serwis_at := now();
    RETURN NEW;
  END IF;

  IF NEW.delegated_vendor_id IS NOT NULL
     AND OLD.delegated_vendor_id IS DISTINCT FROM NEW.delegated_vendor_id THEN
    NEW.released_to_serwis_at := now();
    RETURN NEW;
  END IF;

  IF OLD.status IN (
       'new'::public.issue_status_enum,
       'pending_admin_approval'::public.issue_status_enum
     )
     AND NEW.status = 'open'::public.issue_status_enum THEN
    NEW.released_to_serwis_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_released_to_serwis ON public.property_issues;
CREATE TRIGGER trg_stamp_released_to_serwis
  BEFORE INSERT OR UPDATE ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_released_to_serwis();

CREATE OR REPLACE FUNCTION public.issue_is_visible_to_serwis(
  p_source public.issue_source_enum,
  p_released_at timestamptz,
  p_status public.issue_status_enum,
  p_reporter_type text,
  p_released_to_serwis_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IS DISTINCT FROM 'pending_cleaning_review'::public.issue_status_enum
    AND p_status IS DISTINCT FROM 'pending_admin_approval'::public.issue_status_enum
    AND NOT public.issue_is_in_cleaning_queue(p_source, p_released_at, p_reporter_type)
    AND NOT (
      p_source = 'admin_ui'::public.issue_source_enum
      AND p_released_to_serwis_at IS NULL
    )
    AND NOT (
      p_status = 'new'::public.issue_status_enum
      AND p_source IS DISTINCT FROM 'dispatcher'::public.issue_source_enum
      AND p_source IS DISTINCT FROM 'serwis'::public.issue_source_enum
    );
$$;

COMMENT ON FUNCTION public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text, timestamptz
) IS
  'False for Cleaning-internal, Administracja-pending, and Admin tickets not handed off to Serwis.';

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
      reporter_type,
      released_to_serwis_at
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
      source, released_from_cleaning_at, status, reporter_type, released_to_serwis_at
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
      source, released_from_cleaning_at, status, reporter_type, released_to_serwis_at
    )
    AND assigned_staff_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS property_issues_select_open_marketplace ON public.property_issues;
CREATE POLICY property_issues_select_open_marketplace
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    public.issue_is_visible_to_serwis(
      source, released_from_cleaning_at, status, reporter_type, released_to_serwis_at
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
          source, released_from_cleaning_at, status, reporter_type, released_to_serwis_at
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
          source, released_from_cleaning_at, status, reporter_type, released_to_serwis_at
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
          source, released_from_cleaning_at, status, reporter_type, released_to_serwis_at
        )
      )
    )
  );

REVOKE ALL ON FUNCTION public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text, timestamptz
) TO authenticated;

DROP FUNCTION IF EXISTS public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text
);

COMMIT;
