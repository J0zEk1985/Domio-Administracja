BEGIN;

-- Copy Cleaning↔Serwis ecosystem settings onto another building.
-- The source building may belong to a different community. Mandates required by
-- the copied pairing are created only for the target address, reusing an
-- already accepted mandate from a building this admin org manages.

CREATE OR REPLACE FUNCTION private.ensure_ecosystem_copy_mandate(
  p_acting_org_id uuid,
  p_org_id uuid,
  p_module public.domio_module,
  p_source_location_master_id uuid,
  p_source_community_legal_entity_id uuid,
  p_target_location_master_id uuid,
  p_target_community_legal_entity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_src public.service_mandates;
  v_valid_until timestamptz;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_mandates sm
    WHERE sm.org_id = p_org_id
      AND sm.community_legal_entity_id = p_target_community_legal_entity_id
      AND sm.module = p_module
      AND sm.status = 'active'
      AND (
        sm.location_master_id IS NULL
        OR sm.location_master_id = p_target_location_master_id
      )
  ) THEN
    RETURN;
  END IF;

  SELECT sm.*
    INTO v_src
  FROM public.service_mandates sm
  WHERE sm.org_id = p_org_id
    AND sm.module = p_module
    AND sm.status = 'active'
    AND sm.community_legal_entity_id = p_source_community_legal_entity_id
    AND (
      sm.location_master_id IS NULL
      OR sm.location_master_id = p_source_location_master_id
    )
  ORDER BY
    CASE WHEN sm.location_master_id = p_source_location_master_id THEN 0 ELSE 1 END,
    CASE WHEN sm.role = 'primary_operator' THEN 0 ELSE 1 END,
    sm.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_SOURCE_MANDATE_MISSING';
  END IF;

  IF v_src.role = 'primary_operator' AND EXISTS (
    SELECT 1
    FROM public.service_mandates sm
    WHERE sm.community_legal_entity_id = p_target_community_legal_entity_id
      AND sm.location_master_id IS NOT DISTINCT FROM p_target_location_master_id
      AND sm.module = p_module
      AND sm.status = 'active'
      AND sm.role = 'primary_operator'
      AND sm.org_id IS DISTINCT FROM p_org_id
  ) THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_PRIMARY_EXISTS';
  END IF;

  v_valid_until := v_src.valid_until;
  IF v_valid_until IS NOT NULL AND v_valid_until < now() THEN
    v_valid_until := NULL;
  END IF;

  INSERT INTO public.service_mandates (
    community_legal_entity_id,
    location_master_id,
    org_id,
    partner_legal_entity_id,
    module,
    role,
    status,
    valid_from,
    valid_until,
    appointed_by_org_id,
    accepted_by_org_id,
    accepted_at,
    notes
  )
  VALUES (
    p_target_community_legal_entity_id,
    p_target_location_master_id,
    v_src.org_id,
    v_src.partner_legal_entity_id,
    v_src.module,
    v_src.role,
    'active',
    now(),
    v_valid_until,
    p_acting_org_id,
    COALESCE(v_src.accepted_by_org_id, v_src.org_id, p_acting_org_id),
    COALESCE(v_src.accepted_at, now()),
    'Skopiowano z ustawień innego budynku.'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_PRIMARY_EXISTS';
END;
$$;

CREATE OR REPLACE FUNCTION private.copy_building_ecosystem_settings(
  p_acting_org_id uuid,
  p_source_location_master_id uuid,
  p_target_location_master_id uuid,
  p_target_community_legal_entity_id uuid
)
RETURNS public.building_cooperation_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_source_entity uuid;
  v_target_entity uuid;
  v_link public.building_cooperation_links;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  IF p_source_location_master_id IS NULL OR p_target_location_master_id IS NULL THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_BUILDING_REQUIRED';
  END IF;

  IF p_source_location_master_id = p_target_location_master_id THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_SAME_BUILDING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cleaning_locations cl
    WHERE cl.org_id = p_acting_org_id
      AND cl.location_master_id = p_source_location_master_id
      AND cl.is_admin_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_SOURCE_FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cleaning_locations cl
    WHERE cl.org_id = p_acting_org_id
      AND cl.location_master_id = p_target_location_master_id
      AND cl.is_admin_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_TARGET_FORBIDDEN';
  END IF;

  SELECT c.legal_entity_id
    INTO v_source_entity
  FROM public.cleaning_locations cl
  JOIN public.communities c ON c.id = cl.community_id
  WHERE cl.org_id = p_acting_org_id
    AND cl.location_master_id = p_source_location_master_id
    AND cl.is_admin_active IS TRUE
    AND c.legal_entity_id IS NOT NULL
  LIMIT 1;

  SELECT c.legal_entity_id
    INTO v_target_entity
  FROM public.cleaning_locations cl
  JOIN public.communities c ON c.id = cl.community_id
  WHERE cl.org_id = p_acting_org_id
    AND cl.location_master_id = p_target_location_master_id
    AND cl.is_admin_active IS TRUE
    AND c.legal_entity_id IS NOT NULL
  LIMIT 1;

  IF v_target_entity IS NULL OR v_target_entity IS DISTINCT FROM p_target_community_legal_entity_id THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_TARGET_COMMUNITY';
  END IF;

  SELECT *
    INTO v_link
  FROM public.building_cooperation_links
  WHERE location_master_id = p_source_location_master_id
    AND admin_org_id = p_acting_org_id
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ECOSYSTEM_COPY_SOURCE_EMPTY';
  END IF;

  IF v_link.cleaning_org_id IS NOT NULL OR v_link.maintenance_org_id IS NOT NULL THEN
    IF v_source_entity IS NULL THEN
      RAISE EXCEPTION 'ECOSYSTEM_COPY_SOURCE_COMMUNITY';
    END IF;
  END IF;

  PERFORM private.ensure_ecosystem_copy_mandate(
    p_acting_org_id,
    v_link.cleaning_org_id,
    'cleaning',
    p_source_location_master_id,
    v_source_entity,
    p_target_location_master_id,
    v_target_entity
  );

  PERFORM private.ensure_ecosystem_copy_mandate(
    p_acting_org_id,
    v_link.maintenance_org_id,
    'maintenance',
    p_source_location_master_id,
    v_source_entity,
    p_target_location_master_id,
    v_target_entity
  );

  RETURN private.upsert_building_cooperation_link(
    p_acting_org_id,
    p_target_location_master_id,
    v_target_entity,
    v_link.cleaning_org_id,
    v_link.maintenance_org_id,
    v_link.cleaning_issues_to_serwis,
    v_link.skip_admin_triage
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.copy_building_ecosystem_settings(
  p_acting_org_id uuid,
  p_source_location_master_id uuid,
  p_target_location_master_id uuid,
  p_target_community_legal_entity_id uuid
)
RETURNS public.building_cooperation_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.copy_building_ecosystem_settings(
    p_acting_org_id,
    p_source_location_master_id,
    p_target_location_master_id,
    p_target_community_legal_entity_id
  );
END;
$$;

COMMENT ON FUNCTION public.copy_building_ecosystem_settings(uuid, uuid, uuid, uuid) IS
  'Copy active Cleaning-Serwis cooperation from one administered building to another, including a building in a different community.';

REVOKE ALL ON FUNCTION private.ensure_ecosystem_copy_mandate(uuid, uuid, public.domio_module, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.copy_building_ecosystem_settings(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.copy_building_ecosystem_settings(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.copy_building_ecosystem_settings(uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.copy_building_ecosystem_settings(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_building_ecosystem_settings(uuid, uuid, uuid, uuid) TO service_role;

COMMIT;
