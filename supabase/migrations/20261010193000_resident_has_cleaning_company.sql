BEGIN;

-- Residents cannot read cooperation links or mandates. This returns only a boolean
-- for a building the caller can already open in Domio Home.
CREATE OR REPLACE FUNCTION public.resident_has_cleaning_company(p_location_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location_master_id uuid;
  v_org_id uuid;
  v_community_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_location_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT cl.location_master_id, cl.org_id, cl.community_id
  INTO v_location_master_id, v_org_id, v_community_id
  FROM public.location_access la
  JOIN public.cleaning_locations cl ON cl.id = la.location_id
  WHERE la.user_id = auth.uid()
    AND la.location_id = p_location_id
    AND (la.expires_at IS NULL OR la.expires_at > now())
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_location_master_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.building_cooperation_links bcl
    WHERE bcl.location_master_id = v_location_master_id
      AND bcl.admin_org_id = v_org_id
      AND bcl.status = 'active'
      AND bcl.cleaning_org_id IS NOT NULL
  ) THEN
    RETURN true;
  END IF;

  IF v_community_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.communities c
    JOIN public.service_mandates sm
      ON sm.community_legal_entity_id = c.legal_entity_id
    WHERE c.id = v_community_id
      AND sm.module = 'cleaning'
      AND sm.status = 'active'
      AND sm.org_id IS NOT NULL
      AND (sm.valid_until IS NULL OR sm.valid_until > now())
      AND (
        sm.location_master_id IS NULL
        OR sm.location_master_id = v_location_master_id
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resident_has_cleaning_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resident_has_cleaning_company(uuid) TO authenticated;

COMMENT ON FUNCTION public.resident_has_cleaning_company(uuid) IS
  'True when the resident building has an active cleaning company on the community mandate or the building cooperation link.';

NOTIFY pgrst, 'reload schema';

COMMIT;
