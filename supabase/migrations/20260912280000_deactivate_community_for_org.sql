-- Soft-deactivate a community overlay for one organisation.
-- Keeps history. Releases admin primary mandate so another DOMIO org can take over.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

UPDATE public.communities
SET status = 'inactive'
WHERE lower(btrim(COALESCE(status, ''))) IN ('inactive', 'archived');

UPDATE public.communities
SET status = 'active'
WHERE lower(btrim(COALESCE(status, ''))) IS DISTINCT FROM 'inactive';

ALTER TABLE public.communities
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_status_chk;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_status_chk
  CHECK (status IN ('active', 'inactive'));

COMMENT ON COLUMN public.communities.deactivated_at IS
  'When this org overlay was deactivated. History rows stay.';

CREATE INDEX IF NOT EXISTS idx_communities_org_status
  ON public.communities (org_id, status);

-- ---------------------------------------------------------------------------
-- RPC flag: status / deactivated_* may change only via community RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.community_set_rpc_flag()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.community_rpc', '1', true);
END;
$$;

CREATE OR REPLACE FUNCTION private.tg_communities_status_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
       OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
     )
     AND current_setting('app.community_rpc', true) IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION 'COMMUNITY_STATUS_VIA_RPC';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communities_status_via_rpc ON public.communities;
CREATE TRIGGER trg_communities_status_via_rpc
  BEFORE UPDATE ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_communities_status_via_rpc();

CREATE OR REPLACE FUNCTION private.tg_cleaning_locations_active_community()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.community_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.community_id IS NOT DISTINCT FROM OLD.community_id
     AND NEW.is_admin_active IS NOT TRUE
  THEN
    RETURN NEW;
  END IF;

  SELECT c.status INTO v_status
  FROM public.communities c
  WHERE c.id = NEW.community_id;

  IF v_status = 'inactive'
     AND (
       TG_OP = 'INSERT'
       OR NEW.community_id IS DISTINCT FROM OLD.community_id
       OR (NEW.is_admin_active IS TRUE AND OLD.is_admin_active IS DISTINCT FROM TRUE)
     )
  THEN
    RAISE EXCEPTION 'COMMUNITY_INACTIVE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleaning_locations_active_community ON public.cleaning_locations;
CREATE TRIGGER trg_cleaning_locations_active_community
  BEFORE INSERT OR UPDATE OF community_id, is_admin_active ON public.cleaning_locations
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_cleaning_locations_active_community();

-- ---------------------------------------------------------------------------
-- Re-enroll of the same org reactivates the overlay
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_legal_entity_legacy_overlay(
  p_entity public.legal_entities,
  p_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_reactivated integer := 0;
BEGIN
  PERFORM private.community_set_rpc_flag();

  IF p_entity.kind IN (
    'housing_community'::public.legal_entity_kind,
    'housing_cooperative'::public.legal_entity_kind
  ) THEN
    INSERT INTO public.communities (
      org_id,
      name,
      nip,
      legal_name,
      regon,
      status,
      legal_entity_id
    )
    SELECT
      p_org_id,
      p_entity.short_name,
      p_entity.nip_normalized,
      p_entity.legal_name,
      p_entity.regon_normalized,
      'active',
      p_entity.id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.org_id = p_org_id
        AND c.legal_entity_id = p_entity.id
    );

    UPDATE public.communities
    SET
      status = 'active',
      deactivated_at = NULL,
      deactivated_by = NULL
    WHERE org_id = p_org_id
      AND legal_entity_id = p_entity.id
      AND status IS DISTINCT FROM 'active';
    GET DIAGNOSTICS v_reactivated = ROW_COUNT;

    IF v_reactivated > 0 THEN
      UPDATE public.cleaning_locations cl
      SET is_admin_active = true
      FROM public.communities c
      WHERE cl.org_id = p_org_id
        AND cl.community_id = c.id
        AND c.org_id = p_org_id
        AND c.legal_entity_id = p_entity.id
        AND cl.is_admin_active IS DISTINCT FROM true;
    END IF;
  ELSE
    INSERT INTO public.companies (
      org_id,
      name,
      tax_id,
      category,
      address,
      email,
      phone,
      legal_entity_id
    )
    SELECT
      p_org_id,
      p_entity.legal_name,
      p_entity.nip_normalized,
      CASE
        WHEN p_entity.kind = 'property_manager'::public.legal_entity_kind
          THEN 'contractor'::public.company_category
        ELSE 'other'::public.company_category
      END,
      p_entity.seat_full_address,
      p_entity.email,
      p_entity.phone,
      p_entity.id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.legal_entity_id = p_entity.id
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Deactivate RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.deactivate_community_for_org(
  p_org_id uuid,
  p_community_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_actor uuid;
  v_row public.communities%ROWTYPE;
  v_mandates integer := 0;
  v_buildings integer := 0;
  v_coop integer := 0;
BEGIN
  v_actor := private.mandate_require_actor();
  PERFORM private.community_set_rpc_flag();
  PERFORM private.mandate_set_rpc_flag();

  IF p_org_id IS NULL OR NOT public.is_org_management(p_org_id) THEN
    RAISE EXCEPTION 'COMMUNITY_DEACTIVATE_FORBIDDEN';
  END IF;

  SELECT * INTO v_row
  FROM public.communities
  WHERE id = p_community_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMUNITY_NOT_FOUND';
  END IF;

  IF v_row.status = 'inactive' THEN
    RETURN jsonb_build_object(
      'communityId', v_row.id,
      'status', v_row.status,
      'deactivatedAt', v_row.deactivated_at,
      'mandatesSuperseded', 0,
      'buildingsAdminPaused', 0
    );
  END IF;

  UPDATE public.communities
  SET
    status = 'inactive',
    deactivated_at = now(),
    deactivated_by = v_actor
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  IF v_row.legal_entity_id IS NOT NULL THEN
    UPDATE public.org_legal_entity_enrollments
    SET status = 'inactive'
    WHERE org_id = p_org_id
      AND legal_entity_id = v_row.legal_entity_id
      AND status IS DISTINCT FROM 'inactive';
  END IF;

  UPDATE public.cleaning_locations
  SET is_admin_active = false
  WHERE org_id = p_org_id
    AND community_id = v_row.id
    AND is_admin_active IS TRUE;
  GET DIAGNOSTICS v_buildings = ROW_COUNT;

  IF v_row.legal_entity_id IS NOT NULL THEN
    UPDATE public.service_mandates
    SET
      status = 'superseded',
      revoked_by_org_id = p_org_id,
      revoked_at = now()
    WHERE org_id = p_org_id
      AND community_legal_entity_id = v_row.legal_entity_id
      AND module = 'admin'
      AND status IN ('active', 'paused');
    GET DIAGNOSTICS v_mandates = ROW_COUNT;

    UPDATE public.building_cooperation_links
    SET status = 'paused'
    WHERE admin_org_id = p_org_id
      AND status = 'active'
      AND location_master_id IN (
        SELECT cl.location_master_id
        FROM public.cleaning_locations cl
        WHERE cl.org_id = p_org_id
          AND cl.community_id = v_row.id
          AND cl.location_master_id IS NOT NULL
      );
    GET DIAGNOSTICS v_coop = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'communityId', v_row.id,
    'status', v_row.status,
    'deactivatedAt', v_row.deactivated_at,
    'mandatesSuperseded', v_mandates,
    'buildingsAdminPaused', v_buildings,
    'cooperationPaused', v_coop
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_community_for_org(
  p_org_id uuid,
  p_community_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.deactivate_community_for_org(p_org_id, p_community_id);
END;
$$;

COMMENT ON FUNCTION public.deactivate_community_for_org(uuid, uuid) IS
  'Soft-deactivate this org community overlay. Keeps history. Releases admin mandate.';

REVOKE ALL ON FUNCTION public.deactivate_community_for_org(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_community_for_org(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.deactivate_community_for_org(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_legal_entity_legacy_overlay(public.legal_entities, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_legal_entity_legacy_overlay(public.legal_entities, uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- attach: do not reactivate an inactive overlay by assigning a building
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_legal_entity_to_building(
  p_org_id uuid,
  p_cleaning_location_id uuid,
  p_legal_entity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_loc public.cleaning_locations%ROWTYPE;
  v_master public.locations%ROWTYPE;
  v_owner public.legal_entities%ROWTYPE;
  v_community_id uuid;
  v_community_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_AUTH_REQUIRED';
  END IF;

  IF p_org_id IS NULL OR NOT public.is_org_management(p_org_id) THEN
    RAISE EXCEPTION 'BUILDING_ENROLL_FORBIDDEN';
  END IF;

  IF p_legal_entity_id IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_REQUIRED_FOR_ATTACH';
  END IF;

  SELECT * INTO v_loc
  FROM public.cleaning_locations
  WHERE id = p_cleaning_location_id
    AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUILDING_NOT_FOUND';
  END IF;

  SELECT c.id, c.status INTO v_community_id, v_community_status
  FROM public.communities c
  WHERE c.legal_entity_id = p_legal_entity_id
    AND c.org_id = p_org_id
  LIMIT 1;

  IF v_community_status = 'inactive' THEN
    RAISE EXCEPTION 'COMMUNITY_INACTIVE';
  END IF;

  PERFORM public.enroll_legal_entity_for_org(p_org_id, p_legal_entity_id, false, false, false);

  IF v_loc.location_master_id IS NULL THEN
    RAISE EXCEPTION 'BUILDING_MASTER_MISSING';
  END IF;

  SELECT * INTO v_master
  FROM public.locations
  WHERE id = v_loc.location_master_id;

  IF v_master.legal_entity_id IS NOT NULL
     AND v_master.legal_entity_id IS DISTINCT FROM p_legal_entity_id THEN
    SELECT * INTO v_owner FROM public.legal_entities WHERE id = v_master.legal_entity_id;
    RAISE EXCEPTION 'ADDRESS_OWNED_BY_OTHER_ENTITY'
      USING DETAIL = jsonb_build_object(
        'ownerNip', v_owner.nip_normalized,
        'ownerName', v_owner.short_name
      )::text;
  END IF;

  IF v_master.legal_entity_id IS NULL THEN
    UPDATE public.locations
    SET legal_entity_id = p_legal_entity_id
    WHERE id = v_master.id
    RETURNING * INTO v_master;
  END IF;

  SELECT c.id INTO v_community_id
  FROM public.communities c
  WHERE c.legal_entity_id = p_legal_entity_id
    AND c.org_id = p_org_id
  LIMIT 1;

  UPDATE public.cleaning_locations
  SET community_id = COALESCE(community_id, v_community_id)
  WHERE id = v_loc.id
  RETURNING * INTO v_loc;

  RETURN jsonb_build_object(
    'status', 'attached',
    'cleaningLocationId', v_loc.id,
    'locationMasterId', v_master.id,
    'legalEntityId', v_master.legal_entity_id
  );
END;
$$;
