-- Warstwa 2: SELECT via denormalized ACL (no JOINs to grants/mandates).
-- Own-org access stays on existing policies. This only adds origin + share-array.

CREATE OR REPLACE FUNCTION public.current_user_has_share_or_origin(
  p_origin_org_id uuid,
  p_shared_with_org_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(p_origin_org_id = ANY (orgs), false)
    OR COALESCE(orgs && COALESCE(p_shared_with_org_ids, '{}'::uuid[]), false)
  FROM (SELECT public.current_user_org_ids() AS orgs) s;
$$;

COMMENT ON FUNCTION public.current_user_has_share_or_origin(uuid, uuid[]) IS
  'True when the current user''s orgs include origin_org_id or overlap shared_with_org_ids. Wrap in SELECT in RLS.';

REVOKE ALL ON FUNCTION public.current_user_has_share_or_origin(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_has_share_or_origin(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_share_or_origin(uuid, uuid[]) TO authenticated;

DROP POLICY IF EXISTS property_issues_select_origin_or_share ON public.property_issues;
CREATE POLICY property_issues_select_origin_or_share
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.current_user_has_share_or_origin(origin_org_id, shared_with_org_ids))
  );

DROP POLICY IF EXISTS property_inspections_select_origin_or_share ON public.property_inspections;
CREATE POLICY property_inspections_select_origin_or_share
  ON public.property_inspections
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.current_user_has_share_or_origin(origin_org_id, shared_with_org_ids))
  );

DROP POLICY IF EXISTS inspection_campaigns_select_origin_or_share ON public.inspection_campaigns;
CREATE POLICY inspection_campaigns_select_origin_or_share
  ON public.inspection_campaigns
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.current_user_has_share_or_origin(origin_org_id, shared_with_org_ids))
  );

DROP POLICY IF EXISTS property_contracts_select_origin_or_share ON public.property_contracts;
CREATE POLICY property_contracts_select_origin_or_share
  ON public.property_contracts
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.current_user_has_share_or_origin(origin_org_id, shared_with_org_ids))
  );
