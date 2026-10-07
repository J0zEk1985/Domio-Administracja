-- Lista zasobów w panelu wspólnoty czyta shared_resources po community_id.
-- Wcześniej UI wołało get_available_resources, którego nie było w bazie.

BEGIN;

CREATE TYPE public.resource_type AS ENUM (
  'community_managed',
  'private_peer'
);

CREATE TYPE public.billing_unit_type AS ENUM (
  'hourly',
  'daily'
);

CREATE TYPE public.resource_status AS ENUM (
  'active',
  'inactive',
  'archived'
);

CREATE TYPE public.access_code_type AS ENUM (
  'pin',
  'nfc',
  'qr',
  'manual'
);

CREATE TABLE public.shared_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.cleaning_locations(id) ON DELETE CASCADE,
  resource_type public.resource_type NOT NULL,
  owner_unit_id UUID REFERENCES public.community_units(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status public.resource_status NOT NULL DEFAULT 'active',
  billing_unit public.billing_unit_type NOT NULL DEFAULT 'hourly',
  min_booking_duration INTEGER,
  max_booking_duration INTEGER,
  max_advance_booking_days INTEGER DEFAULT 30,
  max_bookings_per_unit_monthly INTEGER,
  max_hours_per_unit_monthly INTEGER,
  requires_manager_approval BOOLEAN DEFAULT false,
  requires_owner_approval BOOLEAN DEFAULT false,
  requires_check_in BOOLEAN DEFAULT false,
  requires_check_out BOOLEAN DEFAULT false,
  requires_check_out_photo BOOLEAN DEFAULT false,
  requires_deposit BOOLEAN DEFAULT false,
  deposit_amount NUMERIC(10,2),
  price_per_hour NUMERIC(10,2) DEFAULT 0,
  price_per_day NUMERIC(10,2) DEFAULT 0,
  is_free BOOLEAN DEFAULT true,
  access_code_enabled BOOLEAN DEFAULT false,
  access_code_type public.access_code_type,
  static_access_code TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  rules JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT shared_resources_billing_check CHECK (
    (billing_unit = 'hourly' AND price_per_hour >= 0) OR
    (billing_unit = 'daily' AND price_per_day >= 0)
  ),
  CONSTRAINT shared_resources_community_managed_owner_check CHECK (
    resource_type = 'private_peer' OR (owner_unit_id IS NULL AND owner_user_id IS NULL)
  ),
  CONSTRAINT shared_resources_private_peer_owner_check CHECK (
    resource_type = 'community_managed' OR (owner_unit_id IS NOT NULL AND owner_user_id IS NOT NULL)
  ),
  CONSTRAINT shared_resources_deposit_check CHECK (
    (requires_deposit = false) OR (requires_deposit = true AND deposit_amount > 0)
  )
);

CREATE INDEX idx_shared_resources_community_type
  ON public.shared_resources (community_id, resource_type, created_at DESC);

CREATE INDEX idx_shared_resources_org
  ON public.shared_resources (org_id);

CREATE TRIGGER trg_shared_resources_updated_at
  BEFORE UPDATE ON public.shared_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.shared_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_resources_select_management"
  ON public.shared_resources
  FOR SELECT
  TO authenticated
  USING (
    resource_type = 'community_managed'
    AND public.is_org_management(org_id)
  );

GRANT SELECT ON public.shared_resources TO authenticated;

-- Obecny panel woła to RPC. Musi istnieć i wracać od razu,
-- także dla zarządcy (is_org_management), nie tylko mieszkańca.
CREATE OR REPLACE FUNCTION public.get_available_resources(
  p_resource_type public.resource_type DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS SETOF public.shared_resources
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.*
  FROM public.shared_resources sr
  WHERE (p_resource_type IS NULL OR sr.resource_type = p_resource_type)
    AND (p_category IS NULL OR sr.category = p_category)
    AND (
      public.is_org_management(sr.org_id)
      OR (
        sr.status = 'active'
        AND sr.resource_type = 'community_managed'
        AND sr.community_id IN (
          SELECT cu.community_id
          FROM public.location_access la
          JOIN public.community_units cu
            ON cu.location_id = la.location_id
           AND public.normalize_unit_number(la.unit_number) = cu.normalized_unit_number
          WHERE la.user_id = auth.uid()
            AND (la.expires_at IS NULL OR la.expires_at > now())
        )
      )
    )
  ORDER BY sr.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_available_resources(public.resource_type, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_resources(public.resource_type, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
