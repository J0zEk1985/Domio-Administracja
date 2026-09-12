-- Warstwa 2+3: odczyt zakresu SOP partnera Cleaning + dokument umowy do porównania.
-- Brak RLS SELECT na property_checklists / property_sections (za szerokie).
-- Odczyt SOP tylko przez SECURITY DEFINER RPC ze stałym DTO.

-- ---------------------------------------------------------------------------
-- Column: which contract PDF to compare against (Admin overlay row)
-- ---------------------------------------------------------------------------

ALTER TABLE public.cleaning_locations
  ADD COLUMN IF NOT EXISTS cleaning_scope_contract_id uuid
    REFERENCES public.property_contracts (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cleaning_locations.cleaning_scope_contract_id IS
  'Admin-chosen property_contracts row (must have document_url) used to compare against partner Cleaning SOP. NULL = auto-resolve from building then community contracts.';

CREATE INDEX IF NOT EXISTS idx_cleaning_locations_scope_contract
  ON public.cleaning_locations (cleaning_scope_contract_id)
  WHERE cleaning_scope_contract_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Private helpers (not granted to authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.contract_has_document(p_document_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT length(trim(both from COALESCE(p_document_url, ''))) > 0;
$$;

CREATE OR REPLACE FUNCTION private.contract_is_active(p_end_date date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_end_date IS NULL OR p_end_date >= CURRENT_DATE;
$$;

CREATE OR REPLACE FUNCTION private.contract_belongs_to_admin_org(
  p_contract_org_id uuid,
  p_origin_org_id uuid,
  p_shared_with_org_ids uuid[],
  p_location_org_id uuid,
  p_admin_org_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(p_contract_org_id, p_location_org_id) IS NOT DISTINCT FROM p_admin_org_id
    OR COALESCE(p_origin_org_id, p_location_org_id) IS NOT DISTINCT FROM p_admin_org_id
    OR COALESCE(p_admin_org_id = ANY (COALESCE(p_shared_with_org_ids, '{}'::uuid[])), false);
$$;

CREATE OR REPLACE FUNCTION private.contract_in_community_scope(
  p_contract_community_id uuid,
  p_contract_location_id uuid,
  p_contract_location_community_id uuid,
  p_admin_location_id uuid,
  p_community_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_contract_location_id IS NOT DISTINCT FROM p_admin_location_id
    OR (
      p_community_id IS NOT NULL
      AND (
        p_contract_community_id IS NOT DISTINCT FROM p_community_id
        OR p_contract_location_community_id IS NOT DISTINCT FROM p_community_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.contract_eligible_for_cleaning_scope(
  p_contract_id uuid,
  p_admin_org_id uuid,
  p_admin_location_id uuid,
  p_community_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_contracts pc
    JOIN public.cleaning_locations loc ON loc.id = pc.location_id
    WHERE pc.id = p_contract_id
      AND private.contract_has_document(pc.document_url)
      AND private.contract_belongs_to_admin_org(
        pc.org_id,
        pc.origin_org_id,
        pc.shared_with_org_ids,
        loc.org_id,
        p_admin_org_id
      )
      AND private.contract_in_community_scope(
        pc.community_id,
        pc.location_id,
        loc.community_id,
        p_admin_location_id,
        p_community_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.resolve_admin_location_for_scope(
  p_location_master_id uuid
)
RETURNS TABLE (
  admin_location_id uuid,
  admin_org_id uuid,
  community_id uuid
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_orgs uuid[];
BEGIN
  IF p_location_master_id IS NULL THEN
    RETURN;
  END IF;

  v_orgs := public.current_user_org_ids();

  RETURN QUERY
  SELECT cl.id, cl.org_id, cl.community_id
  FROM public.cleaning_locations cl
  WHERE cl.location_master_id = p_location_master_id
    AND COALESCE(cl.is_admin_active, false) = true
    AND COALESCE(cl.status, 'active') = 'active'
    AND cl.org_id = ANY (v_orgs)
  ORDER BY cl.created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN QUERY
    SELECT cl.id, cl.org_id, cl.community_id
    FROM public.cleaning_locations cl
    WHERE cl.location_master_id = p_location_master_id
      AND COALESCE(cl.is_admin_active, false) = true
      AND COALESCE(cl.status, 'active') = 'active'
    ORDER BY cl.created_at
    LIMIT 1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_can_access_admin_location(
  p_admin_location_id uuid
)
RETURNS public.cleaning_locations
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.cleaning_locations;
  v_orgs uuid[];
BEGIN
  IF p_admin_location_id IS NULL THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_FORBIDDEN';
  END IF;

  SELECT * INTO v_row
  FROM public.cleaning_locations
  WHERE id = p_admin_location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_FORBIDDEN';
  END IF;

  IF COALESCE(v_row.is_admin_active, false) IS NOT TRUE
     OR COALESCE(v_row.status, 'active') IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_FORBIDDEN';
  END IF;

  IF public.is_platform_admin() THEN
    RETURN v_row;
  END IF;

  v_orgs := public.current_user_org_ids();
  IF v_row.org_id IS NULL OR NOT (v_row.org_id = ANY (v_orgs)) THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_FORBIDDEN';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_partner_cleaning_location(
  p_location_master_id uuid,
  p_admin_org_id uuid,
  p_community_id uuid
)
RETURNS TABLE (
  cleaning_org_id uuid,
  cleaning_location_id uuid,
  has_active_mandate boolean,
  has_active_cooperation boolean
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_coop_org uuid;
  v_mandate_org uuid;
  v_le uuid;
  v_partner_org uuid;
  v_partner_loc uuid;
  v_has_coop boolean := false;
  v_has_mandate boolean := false;
BEGIN
  SELECT bcl.cleaning_org_id
  INTO v_coop_org
  FROM public.building_cooperation_links bcl
  WHERE bcl.location_master_id = p_location_master_id
    AND bcl.admin_org_id = p_admin_org_id
    AND bcl.status = 'active'
    AND bcl.cleaning_org_id IS NOT NULL
  LIMIT 1;

  v_has_coop := v_coop_org IS NOT NULL;

  IF p_community_id IS NOT NULL THEN
    SELECT c.legal_entity_id INTO v_le
    FROM public.communities c
    WHERE c.id = p_community_id;
  END IF;

  IF v_le IS NOT NULL THEN
    SELECT sm.org_id
    INTO v_mandate_org
    FROM public.service_mandates sm
    WHERE sm.community_legal_entity_id = v_le
      AND sm.module = 'cleaning'
      AND sm.status = 'active'
      AND sm.org_id IS NOT NULL
      AND (
        sm.location_master_id IS NULL
        OR sm.location_master_id IS NOT DISTINCT FROM p_location_master_id
      )
    ORDER BY sm.location_master_id NULLS LAST, sm.accepted_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_has_mandate := v_mandate_org IS NOT NULL;
  v_partner_org := COALESCE(v_coop_org, v_mandate_org);

  IF v_partner_org IS NOT NULL THEN
    SELECT cl.id
    INTO v_partner_loc
    FROM public.cleaning_locations cl
    WHERE cl.location_master_id = p_location_master_id
      AND cl.org_id = v_partner_org
      AND COALESCE(cl.is_cleaning_active, false) = true
      AND COALESCE(cl.status, 'active') = 'active'
    ORDER BY cl.created_at
    LIMIT 1;
  END IF;

  IF v_partner_org IS NULL OR v_partner_loc IS NULL THEN
    RETURN;
  END IF;

  cleaning_org_id := v_partner_org;
  cleaning_location_id := v_partner_loc;
  has_active_mandate := v_has_mandate;
  has_active_cooperation := v_has_coop;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.user_can_view_partner_cleaning_scope(
  p_location_master_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin record;
  v_partner record;
BEGIN
  SELECT * INTO v_admin
  FROM private.resolve_admin_location_for_scope(p_location_master_id);

  IF v_admin.admin_location_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_partner
  FROM private.resolve_partner_cleaning_location(
    p_location_master_id,
    v_admin.admin_org_id,
    v_admin.community_id
  );

  RETURN v_partner.cleaning_location_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.user_can_set_cleaning_scope_contract(
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.is_platform_admin() OR public.is_org_management(p_org_id);
$$;

CREATE OR REPLACE FUNCTION private.cleaning_scope_require_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $$
BEGIN
  RETURN private.mandate_require_actor();
EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE '%MANDATE_AUTH_REQUIRED%' THEN
      RAISE EXCEPTION 'CLEANING_SCOPE_AUTH_REQUIRED';
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION private.pick_scope_contract_row(
  p_admin_org_id uuid,
  p_admin_location_id uuid,
  p_community_id uuid,
  p_prefer_type public.property_contract_type
)
RETURNS public.property_contracts
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.property_contracts;
BEGIN
  SELECT pc.*
  INTO v_row
  FROM public.property_contracts pc
  JOIN public.cleaning_locations loc ON loc.id = pc.location_id
  WHERE private.contract_has_document(pc.document_url)
    AND private.contract_is_active(pc.end_date)
    AND private.contract_belongs_to_admin_org(
      pc.org_id, pc.origin_org_id, pc.shared_with_org_ids, loc.org_id, p_admin_org_id
    )
    AND private.contract_in_community_scope(
      pc.community_id, pc.location_id, loc.community_id, p_admin_location_id, p_community_id
    )
    AND (p_prefer_type IS NULL OR pc.type = p_prefer_type)
  ORDER BY
    CASE WHEN pc.location_id = p_admin_location_id THEN 0 ELSE 1 END,
    CASE WHEN pc.community_id IS NOT DISTINCT FROM p_community_id THEN 0 ELSE 1 END,
    pc.start_date DESC
  LIMIT 1;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_scope_document(
  p_admin_location public.cleaning_locations
)
RETURNS TABLE (
  contract_id uuid,
  contract_number text,
  contract_type text,
  company_name text,
  document_url text,
  source text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_pc public.property_contracts;
  v_source text := 'none';
BEGIN
  IF p_admin_location.cleaning_scope_contract_id IS NOT NULL
     AND private.contract_eligible_for_cleaning_scope(
       p_admin_location.cleaning_scope_contract_id,
       p_admin_location.org_id,
       p_admin_location.id,
       p_admin_location.community_id
     )
  THEN
    SELECT * INTO v_pc
    FROM public.property_contracts
    WHERE id = p_admin_location.cleaning_scope_contract_id;
    v_source := 'explicit';
  END IF;

  IF v_pc.id IS NULL THEN
    v_pc := private.pick_scope_contract_row(
      p_admin_location.org_id,
      p_admin_location.id,
      p_admin_location.community_id,
      'cleaning'
    );
    IF v_pc.id IS NOT NULL THEN
      v_source := CASE
        WHEN v_pc.location_id = p_admin_location.id THEN 'location'
        ELSE 'community'
      END;
    END IF;
  END IF;

  IF v_pc.id IS NULL THEN
    v_pc := private.pick_scope_contract_row(
      p_admin_location.org_id,
      p_admin_location.id,
      p_admin_location.community_id,
      NULL
    );
    IF v_pc.id IS NOT NULL THEN
      v_source := CASE
        WHEN v_pc.location_id = p_admin_location.id THEN 'location'
        ELSE 'community'
      END;
    END IF;
  END IF;

  IF v_pc.id IS NULL THEN
    contract_id := NULL;
    contract_number := NULL;
    contract_type := NULL;
    company_name := NULL;
    document_url := NULL;
    source := 'none';
    RETURN NEXT;
    RETURN;
  END IF;

  contract_id := v_pc.id;
  contract_number := v_pc.contract_number;
  contract_type := v_pc.type::text;
  document_url := v_pc.document_url;
  source := v_source;

  SELECT c.name INTO company_name
  FROM public.companies c
  WHERE c.id = v_pc.company_id;

  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: reject ineligible contract pointer even via PostgREST UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.trg_cleaning_locations_scope_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NEW.cleaning_scope_contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.contract_eligible_for_cleaning_scope(
    NEW.cleaning_scope_contract_id,
    NEW.org_id,
    NEW.id,
    NEW.community_id
  ) THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_CONTRACT_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleaning_locations_scope_contract ON public.cleaning_locations;
CREATE TRIGGER trg_cleaning_locations_scope_contract
  BEFORE INSERT OR UPDATE OF cleaning_scope_contract_id ON public.cleaning_locations
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_cleaning_locations_scope_contract();

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_partner_cleaning_work_scope(
  p_location_master_id uuid
)
RETURNS TABLE (
  cleaning_org_id uuid,
  cleaning_org_name text,
  partner_legal_entity_id uuid,
  cleaning_location_id uuid,
  has_active_mandate boolean,
  has_active_cooperation boolean,
  section_id uuid,
  section_name text,
  section_is_active boolean,
  section_sort_order integer,
  checklist_id uuid,
  checklist_name text,
  frequency text,
  frequency_config jsonb,
  baseline_date date,
  requires_photo boolean,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin record;
  v_partner record;
  v_org_name text;
  v_le uuid;
BEGIN
  PERFORM private.cleaning_scope_require_actor();

  IF p_location_master_id IS NULL THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_FORBIDDEN';
  END IF;

  SELECT * INTO v_admin
  FROM private.resolve_admin_location_for_scope(p_location_master_id);

  IF v_admin.admin_location_id IS NULL THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_FORBIDDEN';
  END IF;

  SELECT * INTO v_partner
  FROM private.resolve_partner_cleaning_location(
    p_location_master_id,
    v_admin.admin_org_id,
    v_admin.community_id
  );

  IF v_partner.cleaning_location_id IS NULL THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_NO_PARTNER';
  END IF;

  SELECT COALESCE(o.name, v_partner.cleaning_org_id::text)
  INTO v_org_name
  FROM public.organizations o
  WHERE o.id = v_partner.cleaning_org_id;

  SELECT e.legal_entity_id
  INTO v_le
  FROM public.org_legal_entity_enrollments e
  WHERE e.org_id = v_partner.cleaning_org_id
  ORDER BY COALESCE(e.is_cleaning, false) DESC, e.created_at
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_partner.cleaning_org_id,
    COALESCE(v_org_name, v_partner.cleaning_org_id::text),
    v_le,
    v_partner.cleaning_location_id,
    v_partner.has_active_mandate,
    v_partner.has_active_cooperation,
    items.section_id,
    items.section_name,
    COALESCE(items.section_is_active, false),
    COALESCE(items.section_sort_order, 0),
    items.checklist_id,
    items.checklist_name,
    items.frequency,
    items.frequency_config,
    items.baseline_date,
    COALESCE(items.requires_photo, false),
    COALESCE(items.is_active, false)
  FROM (SELECT 1) AS header
  LEFT JOIN (
    SELECT
      ps.id AS section_id,
      ps.name AS section_name,
      COALESCE(ps.is_active, true) AS section_is_active,
      COALESCE(ps.sort_order, 0) AS section_sort_order,
      chk.id AS checklist_id,
      chk.name AS checklist_name,
      chk.frequency,
      chk.frequency_config,
      chk.baseline_date,
      COALESCE(chk.requires_photo, false) AS requires_photo,
      COALESCE(chk.is_active, true) AS is_active
    FROM public.property_sections ps
    LEFT JOIN public.property_checklists chk
      ON chk.section_id = ps.id
     AND chk.location_id = v_partner.cleaning_location_id
    WHERE ps.location_id = v_partner.cleaning_location_id

    UNION ALL

    SELECT
      NULL::uuid,
      NULL::text,
      false,
      0,
      chk.id,
      chk.name,
      chk.frequency,
      chk.frequency_config,
      chk.baseline_date,
      COALESCE(chk.requires_photo, false),
      COALESCE(chk.is_active, true)
    FROM public.property_checklists chk
    WHERE chk.location_id = v_partner.cleaning_location_id
      AND chk.section_id IS NULL
  ) AS items ON true
  ORDER BY
    COALESCE(items.section_sort_order, 0),
    COALESCE(items.section_name, ''),
    COALESCE(items.checklist_name, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_cleaning_scope_document(
  p_admin_location_id uuid
)
RETURNS TABLE (
  contract_id uuid,
  contract_number text,
  contract_type text,
  company_name text,
  document_url text,
  source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_loc public.cleaning_locations;
BEGIN
  PERFORM private.cleaning_scope_require_actor();
  v_loc := private.assert_can_access_admin_location(p_admin_location_id);

  RETURN QUERY
  SELECT *
  FROM private.resolve_scope_document(v_loc);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_building_cleaning_scope_contract(
  p_admin_location_id uuid,
  p_contract_id uuid
)
RETURNS TABLE (
  contract_id uuid,
  contract_number text,
  contract_type text,
  company_name text,
  document_url text,
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_loc public.cleaning_locations;
BEGIN
  PERFORM private.cleaning_scope_require_actor();
  v_loc := private.assert_can_access_admin_location(p_admin_location_id);

  IF NOT private.user_can_set_cleaning_scope_contract(v_loc.org_id) THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_FORBIDDEN';
  END IF;

  IF p_contract_id IS NOT NULL
     AND NOT private.contract_eligible_for_cleaning_scope(
       p_contract_id,
       v_loc.org_id,
       v_loc.id,
       v_loc.community_id
     )
  THEN
    RAISE EXCEPTION 'CLEANING_SCOPE_CONTRACT_INVALID';
  END IF;

  UPDATE public.cleaning_locations
  SET cleaning_scope_contract_id = p_contract_id
  WHERE id = v_loc.id
  RETURNING * INTO v_loc;

  RETURN QUERY
  SELECT *
  FROM private.resolve_scope_document(v_loc);
END;
$$;

COMMENT ON FUNCTION public.get_partner_cleaning_work_scope(uuid) IS
  'Read-only partner Cleaning SOP (sections + checklists) for an Admin building. No staff/PII.';

COMMENT ON FUNCTION public.resolve_cleaning_scope_document(uuid) IS
  'Resolves the contract PDF used to compare against Cleaning SOP (explicit pointer or auto).';

COMMENT ON FUNCTION public.set_building_cleaning_scope_contract(uuid, uuid) IS
  'Persists which community/building contract PDF is used for Cleaning SOP comparison. NULL = auto.';

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
        'get_partner_cleaning_work_scope',
        'resolve_cleaning_scope_document',
        'set_building_cleaning_scope_contract'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;
