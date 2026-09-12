-- Resident one-click orders (keys, remotes, fobs).
-- Catalog starts EMPTY — administration fills items per community.
-- RLS policies, storage object policies, and RPCs are the next migration.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Catalog items (editable, default empty — no seed rows)
-- ---------------------------------------------------------------------------

CREATE TABLE public.resident_order_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_amount numeric(12, 2),
  price_kind text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_order_catalog_items_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT resident_order_catalog_items_price_kind_check CHECK (
    price_kind IS NULL OR price_kind IN ('exact', 'approximate')
  ),
  CONSTRAINT resident_order_catalog_items_price_pair CHECK (
    (price_amount IS NULL AND price_kind IS NULL)
    OR (
      price_amount IS NOT NULL
      AND price_amount >= 0
      AND price_kind IS NOT NULL
    )
  )
);

COMMENT ON TABLE public.resident_order_catalog_items IS
  'Orderable items (keys, remotes, fobs) per community. Starts empty; admins CRUD the list.';

CREATE INDEX resident_order_catalog_items_community_idx
  ON public.resident_order_catalog_items (community_id, sort_order, name);

CREATE INDEX resident_order_catalog_items_org_active_idx
  ON public.resident_order_catalog_items (org_id, is_active);

CREATE TRIGGER resident_order_catalog_items_set_updated_at
  BEFORE UPDATE ON public.resident_order_catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.resident_order_catalog_item_locations (
  item_id uuid NOT NULL REFERENCES public.resident_order_catalog_items (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.cleaning_locations (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, location_id)
);

COMMENT ON TABLE public.resident_order_catalog_item_locations IS
  'Optional building filter. Empty set = item visible in every building of the community.';

CREATE INDEX resident_order_catalog_item_locations_location_idx
  ON public.resident_order_catalog_item_locations (location_id);

-- ---------------------------------------------------------------------------
-- Per-community settings: default contractor + editable email template
-- ---------------------------------------------------------------------------

CREATE TABLE public.resident_order_settings (
  community_id uuid PRIMARY KEY REFERENCES public.communities (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  default_company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  email_subject_template text NOT NULL,
  email_body_template text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT resident_order_settings_subject_not_blank CHECK (length(btrim(email_subject_template)) > 0),
  CONSTRAINT resident_order_settings_body_not_blank CHECK (length(btrim(email_body_template)) > 0)
);

COMMENT ON TABLE public.resident_order_settings IS
  'Fulfillment contractor and n8n email template for a community. Created on first admin open; catalog stays empty.';

CREATE INDEX resident_order_settings_org_idx
  ON public.resident_order_settings (org_id);

CREATE INDEX resident_order_settings_company_idx
  ON public.resident_order_settings (default_company_id)
  WHERE default_company_id IS NOT NULL;

CREATE TRIGGER resident_order_settings_set_updated_at
  BEFORE UPDATE ON public.resident_order_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

CREATE TABLE public.resident_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.cleaning_locations (id) ON DELETE RESTRICT,
  unit_number text,
  resident_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  catalog_item_id uuid REFERENCES public.resident_order_catalog_items (id) ON DELETE SET NULL,
  item_name text NOT NULL,
  item_price_amount numeric(12, 2),
  item_price_kind text,
  quantity integer NOT NULL DEFAULT 1,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  fulfillment_company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  handed_over_at timestamptz,
  handed_over_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  handover_photo_urls text[] NOT NULL DEFAULT '{}'::text[],
  dispatched_at timestamptz,
  dispatch_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_orders_item_name_not_blank CHECK (length(btrim(item_name)) > 0),
  CONSTRAINT resident_orders_quantity_check CHECK (quantity >= 1 AND quantity <= 99),
  CONSTRAINT resident_orders_item_price_kind_check CHECK (
    item_price_kind IS NULL OR item_price_kind IN ('exact', 'approximate')
  ),
  CONSTRAINT resident_orders_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'stock_delivery'::text,
        'delivered'::text,
        'ordered_offline'::text,
        'dispatch_queued'::text,
        'dispatch_sent'::text,
        'dispatch_failed'::text,
        'cancelled'::text
      ]
    )
  )
);

COMMENT ON TABLE public.resident_orders IS
  'Resident catalog orders. Item name/price are snapshotted at place time.';

CREATE INDEX resident_orders_org_status_created_idx
  ON public.resident_orders (org_id, status, created_at DESC);

CREATE INDEX resident_orders_community_created_idx
  ON public.resident_orders (community_id, created_at DESC);

CREATE INDEX resident_orders_location_stock_idx
  ON public.resident_orders (location_id, created_at DESC)
  WHERE status = 'stock_delivery';

CREATE INDEX resident_orders_resident_created_idx
  ON public.resident_orders (resident_user_id, created_at DESC);

CREATE INDEX resident_orders_company_idx
  ON public.resident_orders (fulfillment_company_id)
  WHERE fulfillment_company_id IS NOT NULL;

CREATE TRIGGER resident_orders_set_updated_at
  BEFORE UPDATE ON public.resident_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Order history events
-- ---------------------------------------------------------------------------

CREATE TABLE public.resident_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.resident_orders (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_order_events_type_check CHECK (
    event_type = ANY (
      ARRAY[
        'created'::text,
        'stock_assigned'::text,
        'handover_completed'::text,
        'ordered_offline'::text,
        'company_changed'::text,
        'dispatch_queued'::text,
        'dispatch_sent'::text,
        'dispatch_failed'::text,
        'cancelled'::text
      ]
    )
  ),
  CONSTRAINT resident_order_events_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE public.resident_order_events IS
  'Audit trail for resident orders (status changes, handover photos, contractor changes).';

CREATE INDEX resident_order_events_order_created_idx
  ON public.resident_order_events (order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Integrity: org_id from community; location must belong to the catalog community
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_resident_order_set_org_from_community()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = NEW.community_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono wspólnoty.';
  END IF;

  NEW.org_id := v_org;
  RETURN NEW;
END;
$$;

CREATE TRIGGER resident_order_catalog_items_set_org
  BEFORE INSERT OR UPDATE OF community_id ON public.resident_order_catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_resident_order_set_org_from_community();

CREATE TRIGGER resident_order_settings_set_org
  BEFORE INSERT OR UPDATE OF community_id ON public.resident_order_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_resident_order_set_org_from_community();

CREATE OR REPLACE FUNCTION public.tg_resident_order_catalog_location_matches_community()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_item_community uuid;
  v_item_org uuid;
  v_loc_community uuid;
  v_loc_org uuid;
BEGIN
  SELECT i.community_id, i.org_id
  INTO v_item_community, v_item_org
  FROM public.resident_order_catalog_items i
  WHERE i.id = NEW.item_id;

  SELECT cl.community_id, cl.org_id
  INTO v_loc_community, v_loc_org
  FROM public.cleaning_locations cl
  WHERE cl.id = NEW.location_id;

  IF v_item_community IS NULL OR v_loc_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono pozycji katalogu albo budynku.';
  END IF;

  IF v_loc_org IS DISTINCT FROM v_item_org OR v_loc_community IS DISTINCT FROM v_item_community THEN
    RAISE EXCEPTION 'Budynek nie należy do tej wspólnoty.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER resident_order_catalog_item_locations_community
  BEFORE INSERT OR UPDATE ON public.resident_order_catalog_item_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_resident_order_catalog_location_matches_community();

-- ---------------------------------------------------------------------------
-- Storage bucket (object policies in the RLS migration)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resident-order-photos',
  'resident-order-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants + RLS enabled (no policies yet — deny-by-default)
-- ---------------------------------------------------------------------------

ALTER TABLE public.resident_order_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_order_catalog_item_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_order_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_order_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.resident_order_catalog_items FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.resident_order_catalog_item_locations FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.resident_order_settings FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.resident_orders FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.resident_order_events FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_catalog_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_catalog_item_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.resident_order_settings TO authenticated;
GRANT SELECT ON TABLE public.resident_orders TO authenticated;
GRANT SELECT ON TABLE public.resident_order_events TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_catalog_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_catalog_item_locations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_events TO service_role;
