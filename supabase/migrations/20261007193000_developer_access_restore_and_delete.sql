-- Restore is a plain UPDATE of deactivated_at (existing RLS UPDATE policy).
-- Permanent removal deletes only developer_accesses. Warranty issues stay on the community.

CREATE OR REPLACE FUNCTION public.delete_developer_access(p_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_community_id uuid;
  v_org_id uuid;
  v_issues_before integer;
  v_issues_after integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT community_id, org_id
  INTO v_community_id, v_org_id
  FROM public.developer_accesses
  WHERE id = p_access_id
  FOR UPDATE;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'access_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = v_org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'manager', 'admin')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT count(*)::integer
  INTO v_issues_before
  FROM public.developer_warranty_issues
  WHERE community_id = v_community_id;

  DELETE FROM public.developer_accesses
  WHERE id = p_access_id;

  SELECT count(*)::integer
  INTO v_issues_after
  FROM public.developer_warranty_issues
  WHERE community_id = v_community_id;

  -- Issues are not foreign-keyed to developer_accesses. Abort if that ever changes.
  IF v_issues_after IS DISTINCT FROM v_issues_before THEN
    RAISE EXCEPTION 'warranty_issues_must_be_preserved'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'preserved_issue_count', v_issues_after
  );
END;
$$;

COMMENT ON FUNCTION public.delete_developer_access(uuid) IS
  'Removes developer portal access for one community. Warranty issues, comments and events stay on the community.';

REVOKE ALL ON FUNCTION public.delete_developer_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_developer_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_developer_access(uuid) TO authenticated;
