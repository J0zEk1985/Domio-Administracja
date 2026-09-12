-- Warstwa 3: clone_to_successor copies + list enrolled orgs at a physical address.

CREATE OR REPLACE FUNCTION private.clone_issues_to_successor(
  p_from_org uuid,
  p_to_org uuid,
  p_master uuid,
  p_target_location_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.property_issues (
    org_id,
    location_id,
    location_master_id,
    origin_org_id,
    description,
    photo_url,
    status,
    priority,
    category,
    source,
    reporter_name,
    reporter_phone,
    reporter_email,
    photos_before,
    photos_after,
    created_at
  )
  SELECT
    p_to_org,
    p_target_location_id,
    pi.location_master_id,
    COALESCE(pi.origin_org_id, pi.org_id),
    pi.description,
    pi.photo_url,
    pi.status,
    pi.priority,
    pi.category,
    pi.source,
    pi.reporter_name,
    pi.reporter_phone,
    pi.reporter_email,
    pi.photos_before,
    pi.photos_after,
    pi.created_at
  FROM public.property_issues pi
  WHERE pi.org_id = p_from_org
    AND pi.location_master_id = p_master;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION private.clone_inspections_to_successor(
  p_from_org uuid,
  p_to_org uuid,
  p_master uuid,
  p_target_location_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.property_inspections (
    location_id,
    location_master_id,
    org_id,
    origin_org_id,
    company_id,
    type,
    status,
    execution_date,
    valid_until,
    protocol_number,
    inspector_name,
    notes,
    document_url
  )
  SELECT
    p_target_location_id,
    pin.location_master_id,
    p_to_org,
    COALESCE(pin.origin_org_id, pin.org_id),
    COALESCE(
      (
        SELECT c2.id
        FROM public.companies c_from
        INNER JOIN public.companies c2
          ON c2.org_id = p_to_org
         AND c2.legal_entity_id IS NOT NULL
         AND c2.legal_entity_id = c_from.legal_entity_id
        WHERE c_from.id = pin.company_id
        LIMIT 1
      ),
      pin.company_id
    ),
    pin.type,
    pin.status,
    pin.execution_date,
    pin.valid_until,
    pin.protocol_number,
    pin.inspector_name,
    pin.notes,
    pin.document_url
  FROM public.property_inspections pin
  WHERE pin.org_id = p_from_org
    AND pin.location_master_id = p_master
    AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = pin.company_id);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION private.complete_succession(
  p_acting_org_id uuid,
  p_succession_id uuid
)
RETURNS public.succession_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_row public.succession_events;
  v_master uuid;
  v_access public.succession_grant_access;
  v_grant_org uuid;
  r public.succession_resource;
  v_target uuid;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'SUCCESSION_FORBIDDEN';
  END IF;

  SELECT * INTO v_row FROM public.succession_events WHERE id = p_succession_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUCCESSION_NOT_FOUND';
  END IF;
  IF v_row.status <> 'accepted' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;
  IF p_acting_org_id IS DISTINCT FROM v_row.from_org_id
     AND p_acting_org_id IS DISTINCT FROM v_row.to_org_id
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'SUCCESSION_FORBIDDEN';
  END IF;

  v_grant_org := v_row.to_org_id;
  v_access := CASE WHEN v_row.mode = 'transfer_custody' THEN 'write'::public.succession_grant_access
                   ELSE 'read'::public.succession_grant_access END;

  IF v_grant_org IS NOT NULL THEN
    FOR v_master IN
      SELECT private.succession_location_masters(
        v_row.community_legal_entity_id,
        v_row.location_master_id
      )
    LOOP
      FOREACH r IN ARRAY v_row.resource_scope LOOP
        INSERT INTO public.succession_share_grants (
          succession_id, grantee_org_id, resource_type, location_master_id, access, expires_at
        )
        VALUES (
          v_row.id, v_grant_org, r, v_master, v_access, now() + interval '3 months'
        );
      END LOOP;

      SELECT cl.id INTO v_target
      FROM public.cleaning_locations cl
      WHERE cl.org_id = v_grant_org
        AND cl.location_master_id = v_master
      LIMIT 1;

      IF v_row.mode = 'clone_to_successor' AND v_target IS NOT NULL THEN
        IF 'issues' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          PERFORM private.clone_issues_to_successor(v_row.from_org_id, v_grant_org, v_master, v_target);
        END IF;
        IF 'inspections' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          PERFORM private.clone_inspections_to_successor(v_row.from_org_id, v_grant_org, v_master, v_target);
        END IF;
      END IF;

      IF v_row.mode = 'transfer_custody' THEN
        IF 'issues' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.property_issues
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id AND location_master_id = v_master;
        END IF;
        IF 'inspections' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.property_inspections
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id AND location_master_id = v_master;
        END IF;
        IF 'unit_inspections' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.inspection_campaigns
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id AND location_master_id = v_master;
        END IF;
        IF 'contracts' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.property_contracts
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id AND location_master_id = v_master;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.service_mandates
  SET role = 'legacy_operator'
  WHERE org_id = v_row.from_org_id
    AND community_legal_entity_id = v_row.community_legal_entity_id
    AND module = 'admin'
    AND status = 'active'
    AND role = 'primary_operator'
    AND (
      v_row.location_master_id IS NULL
      OR location_master_id IS NOT DISTINCT FROM v_row.location_master_id
    );

  IF v_row.to_org_id IS NOT NULL THEN
    UPDATE public.service_mandates
    SET
      role = 'primary_operator',
      status = 'active',
      accepted_by_org_id = COALESCE(accepted_by_org_id, v_row.to_org_id),
      accepted_at = COALESCE(accepted_at, now())
    WHERE org_id = v_row.to_org_id
      AND community_legal_entity_id = v_row.community_legal_entity_id
      AND module = 'admin'
      AND status IN ('invited', 'active')
      AND (
        v_row.location_master_id IS NULL
        OR location_master_id IS NOT DISTINCT FROM v_row.location_master_id
      );

    IF NOT FOUND THEN
      INSERT INTO public.service_mandates (
        community_legal_entity_id, location_master_id, org_id, partner_legal_entity_id,
        module, role, status, appointed_by_org_id, accepted_by_org_id, accepted_at
      )
      VALUES (
        v_row.community_legal_entity_id, v_row.location_master_id, v_row.to_org_id,
        v_row.to_legal_entity_id, 'admin', 'primary_operator', 'active',
        v_row.from_org_id, v_row.to_org_id, now()
      );
    END IF;
  ELSE
    INSERT INTO public.service_mandates (
      community_legal_entity_id, location_master_id, org_id, partner_legal_entity_id,
      module, role, status, appointed_by_org_id, accepted_by_org_id, accepted_at
    )
    VALUES (
      v_row.community_legal_entity_id, v_row.location_master_id, NULL,
      v_row.to_legal_entity_id, 'admin', 'external_designee', 'active',
      v_row.from_org_id, v_row.from_org_id, now()
    );
  END IF;

  UPDATE public.succession_events
  SET status = 'completed', completed_at = now()
  WHERE id = p_succession_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_location_module_presence(p_location_master_id uuid)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  partner_legal_entity_id uuid,
  is_cleaning boolean,
  is_maintenance boolean,
  is_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_orgs uuid[];
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'MANDATE_AUTH_REQUIRED';
  END IF;

  IF p_location_master_id IS NULL THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  v_orgs := public.current_user_org_ids();

  IF NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.cleaning_locations cl
       WHERE cl.location_master_id = p_location_master_id
         AND cl.org_id = ANY (v_orgs)
     ) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT
    cl.org_id,
    COALESCE(o.name, cl.org_id::text) AS org_name,
    (
      SELECT e.legal_entity_id
      FROM public.org_legal_entity_enrollments e
      WHERE e.org_id = cl.org_id
      ORDER BY e.created_at
      LIMIT 1
    ) AS partner_legal_entity_id,
    COALESCE(cl.is_cleaning_active, false),
    COALESCE(cl.is_maintenance_active, false),
    COALESCE(cl.is_admin_active, false)
  FROM public.cleaning_locations cl
  LEFT JOIN public.organizations o ON o.id = cl.org_id
  WHERE cl.location_master_id = p_location_master_id
    AND cl.status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.list_location_module_presence(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_location_module_presence(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_location_module_presence(uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_succession(uuid, uuid) IS
  'share_read: grants. clone_to_successor: grants + copies issues/inspections into successor location. transfer_custody: grants + org_id move.';
