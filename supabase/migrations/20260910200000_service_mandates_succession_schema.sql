-- Warstwa 1: mandaty ekosystemu, kooperacja i sukcesja (schemat + ciągłość danych).
-- ACL source of truth: succession_share_grants.
-- RLS working copy: shared_with_org_ids[] (maintained by triggers in the next migration).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'domio_module'
  ) THEN
    CREATE TYPE public.domio_module AS ENUM ('admin', 'cleaning', 'maintenance');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'mandate_role'
  ) THEN
    CREATE TYPE public.mandate_role AS ENUM (
      'primary_operator',
      'co_operator',
      'legacy_operator',
      'external_designee'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'mandate_status'
  ) THEN
    CREATE TYPE public.mandate_status AS ENUM (
      'invited',
      'active',
      'paused',
      'superseded',
      'declined'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'cooperation_link_status'
  ) THEN
    CREATE TYPE public.cooperation_link_status AS ENUM ('active', 'paused');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'succession_mode'
  ) THEN
    CREATE TYPE public.succession_mode AS ENUM (
      'share_read',
      'clone_to_successor',
      'transfer_custody'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'succession_status'
  ) THEN
    CREATE TYPE public.succession_status AS ENUM (
      'proposed',
      'accepted',
      'completed',
      'rejected',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'succession_resource'
  ) THEN
    CREATE TYPE public.succession_resource AS ENUM (
      'issues',
      'inspections',
      'unit_inspections',
      'contracts',
      'residents',
      'all'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'succession_grant_access'
  ) THEN
    CREATE TYPE public.succession_grant_access AS ENUM ('read', 'write');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- service_mandates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_legal_entity_id uuid NOT NULL REFERENCES public.legal_entities (id) ON DELETE RESTRICT,
  location_master_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  partner_legal_entity_id uuid NOT NULL REFERENCES public.legal_entities (id) ON DELETE RESTRICT,
  module public.domio_module NOT NULL,
  role public.mandate_role NOT NULL,
  status public.mandate_status NOT NULL DEFAULT 'invited',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  appointed_by_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  accepted_by_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  accepted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_by_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  revoked_at timestamptz,
  CONSTRAINT service_mandates_external_org_chk CHECK (
    (role = 'external_designee' AND org_id IS NULL)
    OR (role <> 'external_designee' AND org_id IS NOT NULL)
  ),
  CONSTRAINT service_mandates_valid_range_chk CHECK (
    valid_until IS NULL OR valid_until >= valid_from
  ),
  CONSTRAINT service_mandates_active_accepted_chk CHECK (
    status <> 'active' OR accepted_at IS NOT NULL
  ),
  CONSTRAINT service_mandates_revoke_pair_chk CHECK (
    (revoked_at IS NULL AND revoked_by_org_id IS NULL)
    OR (
      revoked_at IS NOT NULL
      AND revoked_by_org_id IS NOT NULL
      AND status = 'superseded'
    )
  )
);

COMMENT ON TABLE public.service_mandates IS
  'Who is designated Admin/Cleaning/Serwis on a community or building. Presence (cleaning_locations) is separate.';

CREATE INDEX IF NOT EXISTS idx_service_mandates_community_module_status
  ON public.service_mandates (community_legal_entity_id, module, status, role);

CREATE INDEX IF NOT EXISTS idx_service_mandates_org_status
  ON public.service_mandates (org_id, status)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_mandates_location
  ON public.service_mandates (location_master_id)
  WHERE location_master_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_primary_mandate
  ON public.service_mandates (community_legal_entity_id, location_master_id, module)
  NULLS NOT DISTINCT
  WHERE status = 'active' AND role = 'primary_operator';

DROP TRIGGER IF EXISTS trg_service_mandates_updated_at ON public.service_mandates;
CREATE TRIGGER trg_service_mandates_updated_at
  BEFORE UPDATE ON public.service_mandates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- building_cooperation_links
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.building_cooperation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_master_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
  admin_org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  cleaning_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  maintenance_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  cleaning_issues_to_serwis boolean NOT NULL DEFAULT true,
  skip_admin_triage boolean NOT NULL DEFAULT false,
  status public.cooperation_link_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.building_cooperation_links IS
  'Admin-chosen Cleaning↔Serwis pairing per physical building, per Admin org instance.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_coop_link
  ON public.building_cooperation_links (location_master_id, admin_org_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_coop_links_admin
  ON public.building_cooperation_links (admin_org_id, status);

DROP TRIGGER IF EXISTS trg_building_cooperation_links_updated_at ON public.building_cooperation_links;
CREATE TRIGGER trg_building_cooperation_links_updated_at
  BEFORE UPDATE ON public.building_cooperation_links
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- succession_events + succession_share_grants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.succession_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_legal_entity_id uuid NOT NULL REFERENCES public.legal_entities (id) ON DELETE RESTRICT,
  location_master_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
  from_org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  to_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  to_legal_entity_id uuid NOT NULL REFERENCES public.legal_entities (id) ON DELETE RESTRICT,
  mode public.succession_mode NOT NULL DEFAULT 'share_read',
  status public.succession_status NOT NULL DEFAULT 'proposed',
  resource_scope public.succession_resource[] NOT NULL DEFAULT ARRAY['all'::public.succession_resource],
  accepted_by_from_org_at timestamptz,
  accepted_by_to_org_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT succession_events_scope_chk CHECK (cardinality(resource_scope) >= 1)
);

COMMENT ON TABLE public.succession_events IS
  'Handover of community/building operational data. Terminal statuses never return to proposed.';

CREATE INDEX IF NOT EXISTS idx_succession_events_community_status
  ON public.succession_events (community_legal_entity_id, status);

CREATE INDEX IF NOT EXISTS idx_succession_events_from_org
  ON public.succession_events (from_org_id, status);

CREATE INDEX IF NOT EXISTS idx_succession_events_to_org
  ON public.succession_events (to_org_id, status)
  WHERE to_org_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_succession_events_updated_at ON public.succession_events;
CREATE TRIGGER trg_succession_events_updated_at
  BEFORE UPDATE ON public.succession_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.succession_share_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  succession_id uuid NOT NULL REFERENCES public.succession_events (id) ON DELETE CASCADE,
  grantee_org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  resource_type public.succession_resource NOT NULL,
  location_master_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
  access public.succession_grant_access NOT NULL DEFAULT 'read',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '3 months')
);

COMMENT ON TABLE public.succession_share_grants IS
  'Source of truth for cross-org read/write. Live iff revoked_at IS NULL AND expires_at > now().';

CREATE INDEX IF NOT EXISTS idx_succession_grants_live_grantee
  ON public.succession_share_grants (grantee_org_id, location_master_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_succession_grants_expires
  ON public.succession_share_grants (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_succession_grants_succession
  ON public.succession_share_grants (succession_id);

-- ---------------------------------------------------------------------------
-- Continuity columns on operational tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS location_master_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_with_org_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.property_inspections
  ADD COLUMN IF NOT EXISTS location_master_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_with_org_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.inspection_campaigns
  ADD COLUMN IF NOT EXISTS location_master_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_with_org_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.unit_inspection_records
  ADD COLUMN IF NOT EXISTS location_master_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_with_org_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.property_contracts
  ADD COLUMN IF NOT EXISTS location_master_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_with_org_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.location_access
  ADD COLUMN IF NOT EXISTS location_master_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_with_org_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.property_issues pi
SET
  location_master_id = COALESCE(pi.location_master_id, cl.location_master_id),
  origin_org_id = COALESCE(pi.origin_org_id, pi.org_id, cl.org_id)
FROM public.cleaning_locations cl
WHERE pi.location_id = cl.id
  AND (pi.location_master_id IS NULL OR pi.origin_org_id IS NULL);

UPDATE public.property_inspections pin
SET
  location_master_id = COALESCE(pin.location_master_id, cl.location_master_id),
  org_id = COALESCE(pin.org_id, cl.org_id),
  origin_org_id = COALESCE(pin.origin_org_id, cl.org_id)
FROM public.cleaning_locations cl
WHERE pin.location_id = cl.id
  AND (pin.location_master_id IS NULL OR pin.org_id IS NULL OR pin.origin_org_id IS NULL);

UPDATE public.inspection_campaigns ic
SET
  location_master_id = COALESCE(ic.location_master_id, cl.location_master_id),
  origin_org_id = COALESCE(ic.origin_org_id, ic.org_id)
FROM public.cleaning_locations cl
WHERE ic.location_id = cl.id
  AND (ic.location_master_id IS NULL OR ic.origin_org_id IS NULL);

ALTER TABLE public.unit_inspection_records DISABLE TRIGGER USER;
UPDATE public.unit_inspection_records uir
SET
  location_master_id = COALESCE(uir.location_master_id, ic.location_master_id),
  org_id = COALESCE(uir.org_id, ic.org_id),
  origin_org_id = COALESCE(uir.origin_org_id, ic.origin_org_id, ic.org_id)
FROM public.inspection_campaigns ic
WHERE uir.campaign_id = ic.id
  AND (uir.location_master_id IS NULL OR uir.org_id IS NULL OR uir.origin_org_id IS NULL);
ALTER TABLE public.unit_inspection_records ENABLE TRIGGER USER;

UPDATE public.property_contracts pc
SET
  location_master_id = COALESCE(pc.location_master_id, cl.location_master_id),
  org_id = COALESCE(pc.org_id, cl.org_id),
  origin_org_id = COALESCE(pc.origin_org_id, cl.org_id)
FROM public.cleaning_locations cl
WHERE pc.location_id = cl.id
  AND (pc.location_master_id IS NULL OR pc.org_id IS NULL OR pc.origin_org_id IS NULL);

UPDATE public.location_access la
SET location_master_id = COALESCE(la.location_master_id, cl.location_master_id)
FROM public.cleaning_locations cl
WHERE la.location_id = cl.id
  AND la.location_master_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_property_issues_shared_orgs
  ON public.property_issues USING gin (shared_with_org_ids);

CREATE INDEX IF NOT EXISTS idx_property_issues_master_org
  ON public.property_issues (location_master_id, org_id);

CREATE INDEX IF NOT EXISTS idx_property_issues_origin_org
  ON public.property_issues (origin_org_id)
  WHERE origin_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_inspections_shared_orgs
  ON public.property_inspections USING gin (shared_with_org_ids);

CREATE INDEX IF NOT EXISTS idx_property_inspections_master_org
  ON public.property_inspections (location_master_id, org_id);

CREATE INDEX IF NOT EXISTS idx_inspection_campaigns_shared_orgs
  ON public.inspection_campaigns USING gin (shared_with_org_ids);

CREATE INDEX IF NOT EXISTS idx_inspection_campaigns_master_org
  ON public.inspection_campaigns (location_master_id, org_id);

CREATE INDEX IF NOT EXISTS idx_unit_inspection_records_shared_orgs
  ON public.unit_inspection_records USING gin (shared_with_org_ids);

CREATE INDEX IF NOT EXISTS idx_unit_inspection_records_master_org
  ON public.unit_inspection_records (location_master_id, org_id);

CREATE INDEX IF NOT EXISTS idx_property_contracts_shared_orgs
  ON public.property_contracts USING gin (shared_with_org_ids);

CREATE INDEX IF NOT EXISTS idx_property_contracts_master_org
  ON public.property_contracts (location_master_id, org_id);

CREATE INDEX IF NOT EXISTS idx_location_access_master
  ON public.location_access (location_master_id)
  WHERE location_master_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_location_access_shared_orgs
  ON public.location_access USING gin (shared_with_org_ids);

CREATE OR REPLACE FUNCTION public.tg_fill_location_continuity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_master uuid;
  v_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'unit_inspection_records' THEN
    SELECT ic.location_master_id, ic.org_id
      INTO v_master, v_org
    FROM public.inspection_campaigns ic
    WHERE ic.id = NEW.campaign_id;
    NEW.location_master_id := COALESCE(NEW.location_master_id, v_master);
    NEW.org_id := COALESCE(NEW.org_id, v_org);
    NEW.origin_org_id := COALESCE(NEW.origin_org_id, v_org);
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'location_access' THEN
    SELECT cl.location_master_id
      INTO v_master
    FROM public.cleaning_locations cl
    WHERE cl.id = NEW.location_id;
    NEW.location_master_id := COALESCE(NEW.location_master_id, v_master);
    RETURN NEW;
  END IF;

  SELECT cl.location_master_id, cl.org_id
    INTO v_master, v_org
  FROM public.cleaning_locations cl
  WHERE cl.id = NEW.location_id;

  NEW.location_master_id := COALESCE(NEW.location_master_id, v_master);

  IF TG_TABLE_NAME = 'property_issues' THEN
    NEW.origin_org_id := COALESCE(NEW.origin_org_id, NEW.org_id, v_org);
  ELSIF TG_TABLE_NAME = 'inspection_campaigns' THEN
    NEW.origin_org_id := COALESCE(NEW.origin_org_id, NEW.org_id, v_org);
  ELSE
    NEW.org_id := COALESCE(NEW.org_id, v_org);
    NEW.origin_org_id := COALESCE(NEW.origin_org_id, NEW.org_id, v_org);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_issues_continuity ON public.property_issues;
CREATE TRIGGER trg_property_issues_continuity
  BEFORE INSERT OR UPDATE OF location_id, org_id ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fill_location_continuity();

DROP TRIGGER IF EXISTS trg_property_inspections_continuity ON public.property_inspections;
CREATE TRIGGER trg_property_inspections_continuity
  BEFORE INSERT OR UPDATE OF location_id, org_id ON public.property_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fill_location_continuity();

DROP TRIGGER IF EXISTS trg_inspection_campaigns_continuity ON public.inspection_campaigns;
CREATE TRIGGER trg_inspection_campaigns_continuity
  BEFORE INSERT OR UPDATE OF location_id, org_id ON public.inspection_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fill_location_continuity();

DROP TRIGGER IF EXISTS trg_unit_inspection_records_continuity ON public.unit_inspection_records;
CREATE TRIGGER trg_unit_inspection_records_continuity
  BEFORE INSERT OR UPDATE OF campaign_id ON public.unit_inspection_records
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fill_location_continuity();

DROP TRIGGER IF EXISTS trg_property_contracts_continuity ON public.property_contracts;
CREATE TRIGGER trg_property_contracts_continuity
  BEFORE INSERT OR UPDATE OF location_id ON public.property_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fill_location_continuity();

DROP TRIGGER IF EXISTS trg_location_access_continuity ON public.location_access;
CREATE TRIGGER trg_location_access_continuity
  BEFORE INSERT OR UPDATE OF location_id ON public.location_access
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fill_location_continuity();
