-- Warstwa 1 (cd.): sukcesja RPC, public wrappers, SELECT RLS na nowych tabelach.

CREATE OR REPLACE FUNCTION private.propose_succession(
  p_acting_org_id uuid,
  p_community_legal_entity_id uuid,
  p_location_master_id uuid,
  p_to_org_id uuid,
  p_to_legal_entity_id uuid,
  p_mode public.succession_mode DEFAULT 'share_read',
  p_resource_scope public.succession_resource[] DEFAULT ARRAY['all'::public.succession_resource],
  p_notes text DEFAULT NULL
)
RETURNS public.succession_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_row public.succession_events;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'SUCCESSION_FORBIDDEN';
  END IF;

  IF NOT private.has_active_admin_mandate(
    p_acting_org_id,
    p_community_legal_entity_id,
    p_location_master_id
  ) THEN
    RAISE EXCEPTION 'MANDATE_ADMIN_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.legal_entities WHERE id = p_to_legal_entity_id) THEN
    RAISE EXCEPTION 'SUCCESSION_PARTNER_NOT_FOUND';
  END IF;

  INSERT INTO public.succession_events (
    community_legal_entity_id,
    location_master_id,
    from_org_id,
    to_org_id,
    to_legal_entity_id,
    mode,
    status,
    resource_scope,
    notes
  )
  VALUES (
    p_community_legal_entity_id,
    p_location_master_id,
    p_acting_org_id,
    p_to_org_id,
    p_to_legal_entity_id,
    COALESCE(p_mode, 'share_read'),
    'proposed',
    COALESCE(p_resource_scope, ARRAY['all'::public.succession_resource]),
    p_notes
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.accept_succession(
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
  v_from timestamptz;
  v_to timestamptz;
  v_next public.succession_status;
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
  IF v_row.status <> 'proposed' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;

  IF p_acting_org_id = v_row.from_org_id THEN
    v_from := now();
    v_to := v_row.accepted_by_to_org_at;
  ELSIF v_row.to_org_id IS NOT NULL AND p_acting_org_id = v_row.to_org_id THEN
    v_from := v_row.accepted_by_from_org_at;
    v_to := now();
  ELSIF public.is_platform_admin() THEN
    v_from := COALESCE(v_row.accepted_by_from_org_at, now());
    v_to := CASE WHEN v_row.to_org_id IS NULL THEN v_row.accepted_by_to_org_at ELSE COALESCE(v_row.accepted_by_to_org_at, now()) END;
  ELSE
    RAISE EXCEPTION 'SUCCESSION_FORBIDDEN';
  END IF;

  IF v_row.to_org_id IS NULL THEN
    v_next := 'accepted';
  ELSIF v_from IS NOT NULL AND v_to IS NOT NULL THEN
    v_next := 'accepted';
  ELSE
    v_next := 'proposed';
  END IF;

  UPDATE public.succession_events
  SET
    accepted_by_from_org_at = v_from,
    accepted_by_to_org_at = v_to,
    status = v_next
  WHERE id = p_succession_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.reject_succession(
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
  IF v_row.status <> 'proposed' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;
  IF p_acting_org_id IS DISTINCT FROM v_row.from_org_id
     AND p_acting_org_id IS DISTINCT FROM v_row.to_org_id
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'SUCCESSION_FORBIDDEN';
  END IF;

  UPDATE public.succession_events
  SET status = 'rejected'
  WHERE id = p_succession_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.cancel_succession(
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
  IF v_row.status NOT IN ('proposed', 'accepted') THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;
  IF p_acting_org_id IS DISTINCT FROM v_row.from_org_id
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'SUCCESSION_FORBIDDEN';
  END IF;

  UPDATE public.succession_events
  SET status = 'cancelled'
  WHERE id = p_succession_id
  RETURNING * INTO v_row;

  RETURN v_row;
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
  v_resource public.succession_resource;
  v_access public.succession_grant_access;
  v_grant_org uuid;
  r public.succession_resource;
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
      FOREACH r IN ARRAY v_row.resource_scope
      LOOP
        v_resource := r;
        INSERT INTO public.succession_share_grants (
          succession_id,
          grantee_org_id,
          resource_type,
          location_master_id,
          access,
          expires_at
        )
        VALUES (
          v_row.id,
          v_grant_org,
          v_resource,
          v_master,
          v_access,
          now() + interval '3 months'
        );
      END LOOP;

      IF v_row.mode = 'transfer_custody' THEN
        IF 'issues' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.property_issues
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id
            AND location_master_id = v_master;
        END IF;
        IF 'inspections' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.property_inspections
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id
            AND location_master_id = v_master;
        END IF;
        IF 'unit_inspections' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.inspection_campaigns
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id
            AND location_master_id = v_master;
        END IF;
        IF 'contracts' = ANY (v_row.resource_scope) OR 'all' = ANY (v_row.resource_scope) THEN
          UPDATE public.property_contracts
          SET org_id = v_grant_org
          WHERE org_id = v_row.from_org_id
            AND location_master_id = v_master;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.service_mandates
  SET
    role = 'legacy_operator'
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
        community_legal_entity_id,
        location_master_id,
        org_id,
        partner_legal_entity_id,
        module,
        role,
        status,
        appointed_by_org_id,
        accepted_by_org_id,
        accepted_at
      )
      VALUES (
        v_row.community_legal_entity_id,
        v_row.location_master_id,
        v_row.to_org_id,
        v_row.to_legal_entity_id,
        'admin',
        'primary_operator',
        'active',
        v_row.from_org_id,
        v_row.to_org_id,
        now()
      );
    END IF;
  END IF;

  IF v_row.to_org_id IS NULL THEN
    INSERT INTO public.service_mandates (
      community_legal_entity_id,
      location_master_id,
      org_id,
      partner_legal_entity_id,
      module,
      role,
      status,
      appointed_by_org_id,
      accepted_by_org_id,
      accepted_at
    )
    VALUES (
      v_row.community_legal_entity_id,
      v_row.location_master_id,
      NULL,
      v_row.to_legal_entity_id,
      'admin',
      'external_designee',
      'active',
      v_row.from_org_id,
      v_row.from_org_id,
      now()
    );
  END IF;

  UPDATE public.succession_events
  SET
    status = 'completed',
    completed_at = now()
  WHERE id = p_succession_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invite_service_mandate(
  p_acting_org_id uuid,
  p_community_legal_entity_id uuid,
  p_location_master_id uuid,
  p_partner_org_id uuid,
  p_partner_legal_entity_id uuid,
  p_module public.domio_module,
  p_role public.mandate_role,
  p_valid_from timestamptz DEFAULT now(),
  p_valid_until timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.invite_service_mandate(
    p_acting_org_id,
    p_community_legal_entity_id,
    p_location_master_id,
    p_partner_org_id,
    p_partner_legal_entity_id,
    p_module,
    p_role,
    p_valid_from,
    p_valid_until,
    p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_service_mandate(p_acting_org_id uuid, p_mandate_id uuid)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.accept_service_mandate(p_acting_org_id, p_mandate_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_service_mandate(p_acting_org_id uuid, p_mandate_id uuid)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.decline_service_mandate(p_acting_org_id, p_mandate_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_service_mandate(p_acting_org_id uuid, p_mandate_id uuid)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.pause_service_mandate(p_acting_org_id, p_mandate_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_service_mandate(p_acting_org_id uuid, p_mandate_id uuid)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.resume_service_mandate(p_acting_org_id, p_mandate_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_service_mandate(p_acting_org_id uuid, p_mandate_id uuid)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.revoke_service_mandate(p_acting_org_id, p_mandate_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_building_cooperation_link(
  p_acting_org_id uuid,
  p_location_master_id uuid,
  p_community_legal_entity_id uuid,
  p_cleaning_org_id uuid,
  p_maintenance_org_id uuid,
  p_cleaning_issues_to_serwis boolean DEFAULT true,
  p_skip_admin_triage boolean DEFAULT false
)
RETURNS public.building_cooperation_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.upsert_building_cooperation_link(
    p_acting_org_id,
    p_location_master_id,
    p_community_legal_entity_id,
    p_cleaning_org_id,
    p_maintenance_org_id,
    p_cleaning_issues_to_serwis,
    p_skip_admin_triage
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_succession(
  p_acting_org_id uuid,
  p_community_legal_entity_id uuid,
  p_location_master_id uuid,
  p_to_org_id uuid,
  p_to_legal_entity_id uuid,
  p_mode public.succession_mode DEFAULT 'share_read',
  p_resource_scope public.succession_resource[] DEFAULT ARRAY['all'::public.succession_resource],
  p_notes text DEFAULT NULL
)
RETURNS public.succession_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.propose_succession(
    p_acting_org_id,
    p_community_legal_entity_id,
    p_location_master_id,
    p_to_org_id,
    p_to_legal_entity_id,
    p_mode,
    p_resource_scope,
    p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_succession(p_acting_org_id uuid, p_succession_id uuid)
RETURNS public.succession_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.accept_succession(p_acting_org_id, p_succession_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_succession(p_acting_org_id uuid, p_succession_id uuid)
RETURNS public.succession_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.reject_succession(p_acting_org_id, p_succession_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_succession(p_acting_org_id uuid, p_succession_id uuid)
RETURNS public.succession_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.cancel_succession(p_acting_org_id, p_succession_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_succession(p_acting_org_id uuid, p_succession_id uuid)
RETURNS public.succession_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.complete_succession(p_acting_org_id, p_succession_id);
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'invite_service_mandate',
        'accept_service_mandate',
        'decline_service_mandate',
        'pause_service_mandate',
        'resume_service_mandate',
        'revoke_service_mandate',
        'upsert_building_cooperation_link',
        'propose_succession',
        'accept_succession',
        'reject_succession',
        'cancel_succession',
        'complete_succession',
        'current_user_org_ids'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS: SELECT for involved orgs; writes only via SECURITY DEFINER RPC
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_cooperation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.succession_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.succession_share_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_mandates_select ON public.service_mandates;
CREATE POLICY service_mandates_select
  ON public.service_mandates
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (org_id IS NOT NULL AND (SELECT public.is_active_org_member(org_id)))
    OR (appointed_by_org_id IS NOT NULL AND (SELECT public.is_active_org_member(appointed_by_org_id)))
  );

DROP POLICY IF EXISTS building_cooperation_links_select ON public.building_cooperation_links;
CREATE POLICY building_cooperation_links_select
  ON public.building_cooperation_links
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_active_org_member(admin_org_id))
    OR (cleaning_org_id IS NOT NULL AND (SELECT public.is_active_org_member(cleaning_org_id)))
    OR (maintenance_org_id IS NOT NULL AND (SELECT public.is_active_org_member(maintenance_org_id)))
  );

DROP POLICY IF EXISTS succession_events_select ON public.succession_events;
CREATE POLICY succession_events_select
  ON public.succession_events
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_active_org_member(from_org_id))
    OR (to_org_id IS NOT NULL AND (SELECT public.is_active_org_member(to_org_id)))
  );

DROP POLICY IF EXISTS succession_share_grants_select ON public.succession_share_grants;
CREATE POLICY succession_share_grants_select
  ON public.succession_share_grants
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_active_org_member(grantee_org_id))
    OR EXISTS (
      SELECT 1
      FROM public.succession_events se
      WHERE se.id = succession_id
        AND (SELECT public.is_active_org_member(se.from_org_id))
    )
  );

GRANT SELECT ON public.service_mandates TO authenticated;
GRANT SELECT ON public.building_cooperation_links TO authenticated;
GRANT SELECT ON public.succession_events TO authenticated;
GRANT SELECT ON public.succession_share_grants TO authenticated;

GRANT ALL ON public.service_mandates TO service_role;
GRANT ALL ON public.building_cooperation_links TO service_role;
GRANT ALL ON public.succession_events TO service_role;
GRANT ALL ON public.succession_share_grants TO service_role;

COMMENT ON FUNCTION public.complete_succession(uuid, uuid) IS
  'share_read: 3-month grants. transfer_custody: grants + org_id move. clone_to_successor: grants in W1 (row copies in W3).';
