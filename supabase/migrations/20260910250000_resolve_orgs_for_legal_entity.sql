-- Warstwa 3: resolve DOMIO orgs enrolled on a legal entity (succession successor picker).
-- Enrollment SELECT is member-scoped; this RPC is authenticated read of public registry pairing.

CREATE OR REPLACE FUNCTION public.resolve_orgs_for_legal_entity(p_legal_entity_id uuid)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  is_admin boolean,
  is_cleaning boolean,
  is_maintenance boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'MANDATE_AUTH_REQUIRED';
  END IF;

  IF p_legal_entity_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.legal_entities le WHERE le.id = p_legal_entity_id) THEN
    RAISE EXCEPTION 'MANDATE_PARTNER_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT
    e.org_id,
    COALESCE(o.name, e.org_id::text) AS org_name,
    e.is_admin,
    e.is_cleaning,
    e.is_maintenance
  FROM public.org_legal_entity_enrollments e
  LEFT JOIN public.organizations o ON o.id = e.org_id
  WHERE e.legal_entity_id = p_legal_entity_id
    AND e.status = 'active'
  ORDER BY o.name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_orgs_for_legal_entity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_orgs_for_legal_entity(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_orgs_for_legal_entity(uuid) TO authenticated;

COMMENT ON FUNCTION public.resolve_orgs_for_legal_entity(uuid) IS
  'Lists tenant orgs enrolled on a legal entity. Used by Administracja to pick a succession successor without joining enrollments in RLS.';
