-- Layer 3: hand off a Cleaning-queue ticket to Administracja / Serwis.

CREATE OR REPLACE FUNCTION public.release_cleaning_property_issue(p_issue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_issue public.property_issues%ROWTYPE;
  v_skip boolean := false;
  v_next public.issue_status_enum;
  v_updated integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_issue
  FROM public.property_issues
  WHERE id = p_issue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;

  IF NOT public.issue_is_in_cleaning_queue(
    v_issue.source,
    v_issue.released_from_cleaning_at,
    v_issue.reporter_type
  ) THEN
    RAISE EXCEPTION 'ISSUE_CLEANING_RELEASE_FORBIDDEN';
  END IF;

  IF NOT (
    public.is_management_role(v_issue.org_id)
    OR (
      v_issue.reporter_id IS NOT DISTINCT FROM v_actor
      AND EXISTS (
        SELECT 1
        FROM public.cleaning_locations loc
        WHERE loc.id = v_issue.location_id
          AND loc.auto_notify_issues IS TRUE
      )
    )
  ) THEN
    RAISE EXCEPTION 'ISSUE_CLEANING_RELEASE_FORBIDDEN';
  END IF;

  SELECT COALESCE(loc.skip_cleaning_issue_approval, false)
  INTO v_skip
  FROM public.cleaning_locations loc
  WHERE loc.id = v_issue.location_id;

  IF COALESCE(v_skip, false) THEN
    v_next := 'open'::public.issue_status_enum;
  ELSE
    v_next := 'pending_admin_approval'::public.issue_status_enum;
  END IF;

  UPDATE public.property_issues
  SET
    released_from_cleaning_at = now(),
    notification_status = 'sent',
    status = v_next
  WHERE id = p_issue_id
    AND released_from_cleaning_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'ISSUE_CLEANING_RELEASE_FORBIDDEN';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.release_cleaning_property_issue(uuid) IS
  'Hands a Cleaning-queue ticket to Administracja (pending_admin_approval) or Serwis (open) when skip_cleaning_issue_approval is set.';

REVOKE ALL ON FUNCTION public.release_cleaning_property_issue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_cleaning_property_issue(uuid) TO authenticated;
