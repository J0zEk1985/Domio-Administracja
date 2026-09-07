-- Technicians must see the internal marketplace (open + unassigned) and their own jobs.
-- Previously only management (is_management_role) and cleaners (reporter / cleaning_tasks) had SELECT.

CREATE OR REPLACE FUNCTION public.is_serwis_technician_role(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE org_id = target_org_id
      AND user_id = auth.uid()
      AND role IN ('technik', 'technician')
  );
$$;

COMMENT ON FUNCTION public.is_serwis_technician_role(uuid) IS
  'True when the current user is a Serwis technician in the given org.';

REVOKE ALL ON FUNCTION public.is_serwis_technician_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_serwis_technician_role(uuid) TO authenticated;

DROP POLICY IF EXISTS property_issues_select_for_technicians ON public.property_issues;
CREATE POLICY property_issues_select_for_technicians
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.is_serwis_technician_role(org_id)
    AND status IS DISTINCT FROM 'pending_admin_approval'
    AND (
      assigned_staff_id = auth.uid()
      OR (status = 'open' AND assigned_staff_id IS NULL)
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
    AND status IS DISTINCT FROM 'pending_admin_approval'
    AND (
      assigned_staff_id = auth.uid()
      OR (status = 'open' AND assigned_staff_id IS NULL)
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND public.is_serwis_technician_role(org_id)
    AND assigned_staff_id = auth.uid()
  );
