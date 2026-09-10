-- Warstwa 1: maszyny stanów, denormalizacja ACL, RPC-only writes, SELECT RLS.
-- Pełne polityki SELECT na property_issues (org_id OR origin OR shared_with) = Warstwa 2.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    array_agg(m.org_id),
    '{}'::uuid[]
  )
  FROM public.memberships m
  WHERE m.user_id = (SELECT auth.uid())
    AND COALESCE(m.is_active, true) = true;
$$;

COMMENT ON FUNCTION public.current_user_org_ids() IS
  'Orgs of the current user. Wrap in SELECT in RLS. Used by W2 issue policies.';

REVOKE ALL ON FUNCTION public.current_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_org_ids() TO authenticated;

CREATE OR REPLACE FUNCTION private.mandate_set_rpc_flag()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.mandate_rpc', '1', true);
END;
$$;

CREATE OR REPLACE FUNCTION private.mandate_require_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'MANDATE_AUTH_REQUIRED';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION private.uuid_array_add(p_arr uuid[], p_id uuid)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_id IS NULL THEN COALESCE(p_arr, '{}'::uuid[])
    WHEN p_id = ANY (COALESCE(p_arr, '{}'::uuid[])) THEN COALESCE(p_arr, '{}'::uuid[])
    ELSE COALESCE(p_arr, '{}'::uuid[]) || p_id
  END;
$$;

CREATE OR REPLACE FUNCTION private.has_active_admin_mandate(
  p_org_id uuid,
  p_community_id uuid,
  p_location_master_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_mandates sm
    WHERE sm.org_id = p_org_id
      AND sm.community_legal_entity_id = p_community_id
      AND sm.module = 'admin'
      AND sm.status = 'active'
      AND sm.role IN ('primary_operator', 'co_operator')
      AND (
        sm.location_master_id IS NULL
        OR sm.location_master_id IS NOT DISTINCT FROM p_location_master_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.mandate_transition_ok(
  p_old public.mandate_status,
  p_new public.mandate_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_old IS NOT DISTINCT FROM p_new
    OR (p_old = 'invited' AND p_new IN ('active', 'declined'))
    OR (p_old = 'active' AND p_new IN ('paused', 'superseded'))
    OR (p_old = 'paused' AND p_new IN ('active', 'superseded'));
$$;

CREATE OR REPLACE FUNCTION private.succession_transition_ok(
  p_old public.succession_status,
  p_new public.succession_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_old IS NOT DISTINCT FROM p_new
    OR (p_old = 'proposed' AND p_new IN ('accepted', 'rejected', 'cancelled'))
    OR (p_old = 'accepted' AND p_new IN ('completed', 'cancelled'));
$$;

-- ---------------------------------------------------------------------------
-- State-machine + RPC-only write guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.tg_service_mandates_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.mandate_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'MANDATE_VIA_RPC';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT private.mandate_transition_ok(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
    END IF;
    IF OLD.status = 'invited' AND NEW.status = 'active' THEN
      IF NEW.accepted_at IS NULL OR NEW.accepted_by_org_id IS NULL THEN
        RAISE EXCEPTION 'MANDATE_ACCEPTANCE_REQUIRED';
      END IF;
    END IF;
    IF NEW.status = 'superseded' THEN
      IF NEW.revoked_at IS NULL OR NEW.revoked_by_org_id IS NULL THEN
        RAISE EXCEPTION 'MANDATE_REVOKE_AUDIT_REQUIRED';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'active' AND NEW.accepted_at IS NULL THEN
    RAISE EXCEPTION 'MANDATE_ACCEPTANCE_REQUIRED';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION private.tg_succession_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.mandate_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'SUCCESSION_VIA_RPC';
  END IF;

  IF TG_OP = 'UPDATE' AND NOT private.succession_transition_ok(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status <> 'proposed' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION private.tg_mandate_tables_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.mandate_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'MANDATE_VIA_RPC';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_service_mandates_guard ON public.service_mandates;
CREATE TRIGGER trg_service_mandates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.service_mandates
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_service_mandates_guard();

DROP TRIGGER IF EXISTS trg_succession_events_guard ON public.succession_events;
CREATE TRIGGER trg_succession_events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.succession_events
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_succession_events_guard();

DROP TRIGGER IF EXISTS trg_coop_links_via_rpc ON public.building_cooperation_links;
CREATE TRIGGER trg_coop_links_via_rpc
  BEFORE INSERT OR UPDATE OR DELETE ON public.building_cooperation_links
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_mandate_tables_via_rpc();

DROP TRIGGER IF EXISTS trg_succession_grants_via_rpc ON public.succession_share_grants;
CREATE TRIGGER trg_succession_grants_via_rpc
  BEFORE INSERT OR UPDATE OR DELETE ON public.succession_share_grants
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_mandate_tables_via_rpc();

-- ---------------------------------------------------------------------------
-- ACL denormalization
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.acl_apply_org(
  p_location_master_id uuid,
  p_org_id uuid,
  p_resource public.succession_resource,
  p_add boolean
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF p_location_master_id IS NULL OR p_org_id IS NULL THEN
    RETURN;
  END IF;

  IF p_resource IN ('issues', 'all') THEN
    IF p_add THEN
      UPDATE public.property_issues
      SET shared_with_org_ids = private.uuid_array_add(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    ELSE
      UPDATE public.property_issues
      SET shared_with_org_ids = array_remove(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    END IF;
  END IF;

  IF p_resource IN ('inspections', 'all') THEN
    IF p_add THEN
      UPDATE public.property_inspections
      SET shared_with_org_ids = private.uuid_array_add(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    ELSE
      UPDATE public.property_inspections
      SET shared_with_org_ids = array_remove(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    END IF;
  END IF;

  IF p_resource IN ('unit_inspections', 'all') THEN
    IF p_add THEN
      UPDATE public.inspection_campaigns
      SET shared_with_org_ids = private.uuid_array_add(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    ELSE
      UPDATE public.inspection_campaigns
      SET shared_with_org_ids = array_remove(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    END IF;
  END IF;

  IF p_resource IN ('contracts', 'all') THEN
    IF p_add THEN
      UPDATE public.property_contracts
      SET shared_with_org_ids = private.uuid_array_add(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    ELSE
      UPDATE public.property_contracts
      SET shared_with_org_ids = array_remove(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    END IF;
  END IF;

  IF p_resource IN ('residents', 'all') THEN
    IF p_add THEN
      UPDATE public.location_access
      SET shared_with_org_ids = private.uuid_array_add(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    ELSE
      UPDATE public.location_access
      SET shared_with_org_ids = array_remove(shared_with_org_ids, p_org_id)
      WHERE location_master_id = p_location_master_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.tg_succession_grants_acl()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_live_old boolean := false;
  v_live_new boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revoked_at IS NULL AND NEW.expires_at > now() THEN
      PERFORM private.acl_apply_org(NEW.location_master_id, NEW.grantee_org_id, NEW.resource_type, true);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_live_old := OLD.revoked_at IS NULL AND OLD.expires_at > now();
    v_live_new := NEW.revoked_at IS NULL AND NEW.expires_at > now();
    IF v_live_old AND NOT v_live_new THEN
      PERFORM private.acl_apply_org(OLD.location_master_id, OLD.grantee_org_id, OLD.resource_type, false);
    ELSIF (NOT v_live_old) AND v_live_new THEN
      PERFORM private.acl_apply_org(NEW.location_master_id, NEW.grantee_org_id, NEW.resource_type, true);
    ELSIF v_live_old AND v_live_new AND (
      OLD.grantee_org_id IS DISTINCT FROM NEW.grantee_org_id
      OR OLD.location_master_id IS DISTINCT FROM NEW.location_master_id
      OR OLD.resource_type IS DISTINCT FROM NEW.resource_type
    ) THEN
      PERFORM private.acl_apply_org(OLD.location_master_id, OLD.grantee_org_id, OLD.resource_type, false);
      PERFORM private.acl_apply_org(NEW.location_master_id, NEW.grantee_org_id, NEW.resource_type, true);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.revoked_at IS NULL AND OLD.expires_at > now() THEN
      PERFORM private.acl_apply_org(OLD.location_master_id, OLD.grantee_org_id, OLD.resource_type, false);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_succession_grants_acl ON public.succession_share_grants;
CREATE TRIGGER trg_succession_grants_acl
  AFTER INSERT OR UPDATE OR DELETE ON public.succession_share_grants
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_succession_grants_acl();

CREATE OR REPLACE FUNCTION private.tg_fill_shared_orgs_from_live_grants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_resource public.succession_resource;
  v_orgs uuid[];
BEGIN
  IF NEW.location_master_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_resource := CASE TG_TABLE_NAME
    WHEN 'property_issues' THEN 'issues'::public.succession_resource
    WHEN 'property_inspections' THEN 'inspections'::public.succession_resource
    WHEN 'inspection_campaigns' THEN 'unit_inspections'::public.succession_resource
    WHEN 'unit_inspection_records' THEN 'unit_inspections'::public.succession_resource
    WHEN 'property_contracts' THEN 'contracts'::public.succession_resource
    WHEN 'location_access' THEN 'residents'::public.succession_resource
    ELSE NULL
  END;

  SELECT COALESCE(array_agg(DISTINCT g.grantee_org_id), '{}'::uuid[])
    INTO v_orgs
  FROM public.succession_share_grants g
  WHERE g.location_master_id = NEW.location_master_id
    AND g.revoked_at IS NULL
    AND g.expires_at > now()
    AND (g.resource_type = v_resource OR g.resource_type = 'all');

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(NEW.shared_with_org_ids, '{}'::uuid[]) || v_orgs) AS x)
    INTO NEW.shared_with_org_ids;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_issues_shared_orgs ON public.property_issues;
CREATE TRIGGER trg_property_issues_shared_orgs
  BEFORE INSERT ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_fill_shared_orgs_from_live_grants();

DROP TRIGGER IF EXISTS trg_property_inspections_shared_orgs ON public.property_inspections;
CREATE TRIGGER trg_property_inspections_shared_orgs
  BEFORE INSERT ON public.property_inspections
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_fill_shared_orgs_from_live_grants();

DROP TRIGGER IF EXISTS trg_inspection_campaigns_shared_orgs ON public.inspection_campaigns;
CREATE TRIGGER trg_inspection_campaigns_shared_orgs
  BEFORE INSERT ON public.inspection_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_fill_shared_orgs_from_live_grants();

DROP TRIGGER IF EXISTS trg_property_contracts_shared_orgs ON public.property_contracts;
CREATE TRIGGER trg_property_contracts_shared_orgs
  BEFORE INSERT ON public.property_contracts
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_fill_shared_orgs_from_live_grants();

DROP TRIGGER IF EXISTS trg_location_access_shared_orgs ON public.location_access;
CREATE TRIGGER trg_location_access_shared_orgs
  BEFORE INSERT ON public.location_access
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_fill_shared_orgs_from_live_grants();

CREATE OR REPLACE FUNCTION private.prune_expired_succession_grants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  r public.succession_share_grants%ROWTYPE;
  n integer := 0;
BEGIN
  PERFORM private.mandate_set_rpc_flag();
  FOR r IN
    SELECT *
    FROM public.succession_share_grants
    WHERE revoked_at IS NULL
      AND expires_at <= now()
  LOOP
    PERFORM private.acl_apply_org(r.location_master_id, r.grantee_org_id, r.resource_type, false);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION private.prune_expired_succession_grants() FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule('prune-expired-succession-grants');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'prune-expired-succession-grants',
    '15 * * * *',
    'SELECT private.prune_expired_succession_grants()'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- Location masters for a community (optionally one building)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.succession_location_masters(
  p_community_id uuid,
  p_location_master_id uuid
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT master_id
  FROM (
    SELECT p_location_master_id AS master_id
    WHERE p_location_master_id IS NOT NULL
    UNION
    SELECT loc.id
    FROM public.locations loc
    WHERE p_location_master_id IS NULL
      AND loc.legal_entity_id = p_community_id
    UNION
    SELECT cl.location_master_id
    FROM public.cleaning_locations cl
    INNER JOIN public.communities c ON c.id = cl.community_id
    WHERE p_location_master_id IS NULL
      AND c.legal_entity_id = p_community_id
      AND cl.location_master_id IS NOT NULL
  ) s
  WHERE master_id IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- Core RPCs (private)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.invite_service_mandate(
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
DECLARE
  v_row public.service_mandates;
  v_bootstrap boolean := false;
  v_status public.mandate_status := 'invited';
  v_accepted_at timestamptz := NULL;
  v_accepted_by uuid := NULL;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.legal_entities WHERE id = p_community_legal_entity_id) THEN
    RAISE EXCEPTION 'MANDATE_COMMUNITY_NOT_FOUND';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.legal_entities WHERE id = p_partner_legal_entity_id) THEN
    RAISE EXCEPTION 'MANDATE_PARTNER_NOT_FOUND';
  END IF;

  IF p_role = 'external_designee' THEN
    IF p_partner_org_id IS NOT NULL THEN
      RAISE EXCEPTION 'MANDATE_EXTERNAL_HAS_NO_ORG';
    END IF;
    v_status := 'active';
    v_accepted_at := now();
    v_accepted_by := p_acting_org_id;
  ELSIF p_role <> 'external_designee' AND p_partner_org_id IS NULL THEN
    RAISE EXCEPTION 'MANDATE_ORG_REQUIRED';
  END IF;

  IF p_module = 'admin' AND p_role = 'primary_operator' AND p_partner_org_id = p_acting_org_id THEN
    v_bootstrap := NOT EXISTS (
      SELECT 1
      FROM public.service_mandates sm
      WHERE sm.community_legal_entity_id = p_community_legal_entity_id
        AND sm.module = 'admin'
        AND sm.status = 'active'
        AND sm.role = 'primary_operator'
        AND sm.location_master_id IS NOT DISTINCT FROM p_location_master_id
    );
    IF v_bootstrap THEN
      v_status := 'active';
      v_accepted_at := now();
      v_accepted_by := p_acting_org_id;
    ELSE
      RAISE EXCEPTION 'MANDATE_PRIMARY_EXISTS';
    END IF;
  ELSIF p_role = 'external_designee' THEN
    NULL;
  ELSIF p_module = 'admin' AND p_role = 'co_operator' AND p_partner_org_id = p_acting_org_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.service_mandates sm
      WHERE sm.community_legal_entity_id = p_community_legal_entity_id
        AND sm.module = 'admin'
        AND sm.status = 'active'
        AND sm.role = 'primary_operator'
        AND (
          sm.location_master_id IS NULL
          OR sm.location_master_id IS NOT DISTINCT FROM p_location_master_id
        )
    ) THEN
      RAISE EXCEPTION 'MANDATE_NO_PRIMARY_ADMIN';
    END IF;
    v_status := 'invited';
  ELSE
    IF NOT private.has_active_admin_mandate(
      p_acting_org_id,
      p_community_legal_entity_id,
      p_location_master_id
    ) THEN
      RAISE EXCEPTION 'MANDATE_ADMIN_REQUIRED';
    END IF;
    v_status := 'invited';
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
    p_community_legal_entity_id,
    p_location_master_id,
    p_partner_org_id,
    p_partner_legal_entity_id,
    p_module,
    p_role,
    v_status,
    COALESCE(p_valid_from, now()),
    p_valid_until,
    p_acting_org_id,
    v_accepted_by,
    v_accepted_at,
    p_notes
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.accept_service_mandate(
  p_acting_org_id uuid,
  p_mandate_id uuid
)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_row public.service_mandates;
  v_primary_org uuid;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  SELECT * INTO v_row FROM public.service_mandates WHERE id = p_mandate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANDATE_NOT_FOUND';
  END IF;
  IF v_row.status <> 'invited' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;

  SELECT sm.org_id
    INTO v_primary_org
  FROM public.service_mandates sm
  WHERE sm.community_legal_entity_id = v_row.community_legal_entity_id
    AND sm.module = 'admin'
    AND sm.status = 'active'
    AND sm.role = 'primary_operator'
    AND (
      sm.location_master_id IS NULL
      OR sm.location_master_id IS NOT DISTINCT FROM v_row.location_master_id
    )
  LIMIT 1;

  IF v_row.org_id = p_acting_org_id THEN
    NULL;
  ELSIF v_row.role = 'co_operator'
    AND v_row.module = 'admin'
    AND v_primary_org IS NOT NULL
    AND v_primary_org = p_acting_org_id THEN
    NULL;
  ELSIF public.is_platform_admin() THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  UPDATE public.service_mandates
  SET
    status = 'active',
    accepted_by_org_id = p_acting_org_id,
    accepted_at = now()
  WHERE id = p_mandate_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.decline_service_mandate(
  p_acting_org_id uuid,
  p_mandate_id uuid
)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_row public.service_mandates;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  SELECT * INTO v_row FROM public.service_mandates WHERE id = p_mandate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANDATE_NOT_FOUND';
  END IF;
  IF v_row.status <> 'invited' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;
  IF v_row.org_id IS DISTINCT FROM p_acting_org_id
     AND v_row.appointed_by_org_id IS DISTINCT FROM p_acting_org_id
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  UPDATE public.service_mandates
  SET status = 'declined'
  WHERE id = p_mandate_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.pause_service_mandate(
  p_acting_org_id uuid,
  p_mandate_id uuid
)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_row public.service_mandates;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  SELECT * INTO v_row FROM public.service_mandates WHERE id = p_mandate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANDATE_NOT_FOUND';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;
  IF v_row.org_id IS DISTINCT FROM p_acting_org_id
     AND v_row.appointed_by_org_id IS DISTINCT FROM p_acting_org_id
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  UPDATE public.service_mandates
  SET status = 'paused'
  WHERE id = p_mandate_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.resume_service_mandate(
  p_acting_org_id uuid,
  p_mandate_id uuid
)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_row public.service_mandates;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  SELECT * INTO v_row FROM public.service_mandates WHERE id = p_mandate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANDATE_NOT_FOUND';
  END IF;
  IF v_row.status <> 'paused' THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;
  IF v_row.org_id IS DISTINCT FROM p_acting_org_id
     AND v_row.appointed_by_org_id IS DISTINCT FROM p_acting_org_id
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  UPDATE public.service_mandates
  SET status = 'active'
  WHERE id = p_mandate_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.revoke_service_mandate(
  p_acting_org_id uuid,
  p_mandate_id uuid
)
RETURNS public.service_mandates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_row public.service_mandates;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  SELECT * INTO v_row FROM public.service_mandates WHERE id = p_mandate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANDATE_NOT_FOUND';
  END IF;
  IF v_row.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION';
  END IF;
  IF v_row.appointed_by_org_id IS DISTINCT FROM p_acting_org_id
     AND NOT public.is_platform_admin()
     AND NOT private.has_active_admin_mandate(
       p_acting_org_id,
       v_row.community_legal_entity_id,
       v_row.location_master_id
     ) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  UPDATE public.service_mandates
  SET
    status = 'superseded',
    revoked_by_org_id = p_acting_org_id,
    revoked_at = now()
  WHERE id = p_mandate_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.upsert_building_cooperation_link(
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
DECLARE
  v_row public.building_cooperation_links;
BEGIN
  PERFORM private.mandate_require_actor();
  PERFORM private.mandate_set_rpc_flag();

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'MANDATE_FORBIDDEN';
  END IF;

  IF NOT private.has_active_admin_mandate(
    p_acting_org_id,
    p_community_legal_entity_id,
    p_location_master_id
  ) THEN
    RAISE EXCEPTION 'MANDATE_ADMIN_REQUIRED';
  END IF;

  IF p_cleaning_org_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.service_mandates sm
      WHERE sm.org_id = p_cleaning_org_id
        AND sm.community_legal_entity_id = p_community_legal_entity_id
        AND sm.module = 'cleaning'
        AND sm.status = 'active'
        AND (
          sm.location_master_id IS NULL
          OR sm.location_master_id = p_location_master_id
        )
    ) THEN
      RAISE EXCEPTION 'COOP_CLEANING_MANDATE_INACTIVE';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.org_id = p_cleaning_org_id
        AND cl.location_master_id = p_location_master_id
        AND cl.is_cleaning_active
    ) THEN
      RAISE EXCEPTION 'COOP_CLEANING_NOT_ENROLLED';
    END IF;
  END IF;

  IF p_maintenance_org_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.service_mandates sm
      WHERE sm.org_id = p_maintenance_org_id
        AND sm.community_legal_entity_id = p_community_legal_entity_id
        AND sm.module = 'maintenance'
        AND sm.status = 'active'
        AND (
          sm.location_master_id IS NULL
          OR sm.location_master_id = p_location_master_id
        )
    ) THEN
      RAISE EXCEPTION 'COOP_MAINTENANCE_MANDATE_INACTIVE';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.org_id = p_maintenance_org_id
        AND cl.location_master_id = p_location_master_id
        AND cl.is_maintenance_active
    ) THEN
      RAISE EXCEPTION 'COOP_MAINTENANCE_NOT_ENROLLED';
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.building_cooperation_links
  WHERE location_master_id = p_location_master_id
    AND admin_org_id = p_acting_org_id
    AND status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.building_cooperation_links
    SET
      cleaning_org_id = p_cleaning_org_id,
      maintenance_org_id = p_maintenance_org_id,
      cleaning_issues_to_serwis = COALESCE(p_cleaning_issues_to_serwis, true),
      skip_admin_triage = COALESCE(p_skip_admin_triage, false)
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.building_cooperation_links (
      location_master_id,
      admin_org_id,
      cleaning_org_id,
      maintenance_org_id,
      cleaning_issues_to_serwis,
      skip_admin_triage,
      status
    )
    VALUES (
      p_location_master_id,
      p_acting_org_id,
      p_cleaning_org_id,
      p_maintenance_org_id,
      COALESCE(p_cleaning_issues_to_serwis, true),
      COALESCE(p_skip_admin_triage, false),
      'active'
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
