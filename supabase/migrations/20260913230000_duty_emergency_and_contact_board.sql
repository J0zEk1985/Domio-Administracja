-- WARSTWA 1: dyżur Serwisu, pogotowie 24h, ręczna tablica kontaktów Home.
-- RLS policies i RPC — WARSTWA 2 / 3. Nowe tabele mają RLS włączone (brak polityk = brak dostępu z API).

-- ---------------------------------------------------------------------------
-- Helper: role serwisowe (pula dyżuru)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_service_staff_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_role, ''))) = ANY (
    ARRAY['technik', 'koordynator', 'wlasciciel', 'właściciel', 'owner', 'coordinator']
  );
$$;

COMMENT ON FUNCTION public.is_service_staff_role(text) IS
  'True for Serwis team roles (technician / coordinator / owner aliases).';

-- ---------------------------------------------------------------------------
-- A. Dyżur Serwisu
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_duty_state (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  is_duty_enabled boolean NOT NULL DEFAULT false,
  active_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_duty_state_enabled_requires_user_chk CHECK (
    is_duty_enabled = false OR active_user_id IS NOT NULL
  )
);

COMMENT ON TABLE public.org_duty_state IS
  'Current on-call state for a Serwis org. One active duty person when enabled.';

CREATE TABLE IF NOT EXISTS public.org_duty_eligible (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

COMMENT ON TABLE public.org_duty_eligible IS
  'Pool of Serwis staff the coordinator may pick as the current duty person.';

CREATE INDEX IF NOT EXISTS idx_org_duty_eligible_user
  ON public.org_duty_eligible (user_id);

CREATE OR REPLACE FUNCTION public.enforce_org_duty_eligible()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
  v_active boolean;
BEGIN
  SELECT m.role, COALESCE(m.is_active, true)
  INTO v_role, v_active
  FROM public.memberships m
  WHERE m.org_id = NEW.org_id
    AND m.user_id = NEW.user_id
  ORDER BY public.is_service_staff_role(m.role) DESC
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Duty eligible user must be a member of the organization'
      USING ERRCODE = '23514';
  END IF;
  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Duty eligible user must have an active membership'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.is_service_staff_role(v_role) THEN
    RAISE EXCEPTION 'Duty eligible user must have a Serwis staff role'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_duty_eligible_enforce ON public.org_duty_eligible;
CREATE TRIGGER trg_org_duty_eligible_enforce
  BEFORE INSERT OR UPDATE OF org_id, user_id
  ON public.org_duty_eligible
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_org_duty_eligible();

CREATE OR REPLACE FUNCTION public.enforce_org_duty_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_duty_enabled THEN
    IF NEW.active_user_id IS NULL THEN
      RAISE EXCEPTION 'active_user_id is required when duty is enabled'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.org_duty_eligible e
      WHERE e.org_id = NEW.org_id
        AND e.user_id = NEW.active_user_id
    ) THEN
      RAISE EXCEPTION 'active_user_id must belong to the duty eligible pool'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_duty_state_enforce ON public.org_duty_state;
CREATE TRIGGER trg_org_duty_state_enforce
  BEFORE INSERT OR UPDATE
  ON public.org_duty_state
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_org_duty_state();

CREATE OR REPLACE FUNCTION public.enforce_org_duty_eligible_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.org_duty_state
  SET
    is_duty_enabled = false,
    active_user_id = NULL,
    updated_at = now()
  WHERE org_id = OLD.org_id
    AND active_user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_duty_eligible_clear_active ON public.org_duty_eligible;
CREATE TRIGGER trg_org_duty_eligible_clear_active
  AFTER DELETE ON public.org_duty_eligible
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_org_duty_eligible_delete();

CREATE TABLE IF NOT EXISTS public.duty_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.property_issues (id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'exhausted', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 20
    CHECK (max_attempts > 0),
  last_pushed_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id)
);

COMMENT ON TABLE public.duty_alerts IS
  'On-call acknowledgement loop (pending → accepted). Independent of property_issues.status.';

CREATE INDEX IF NOT EXISTS idx_duty_alerts_org_pending
  ON public.duty_alerts (org_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_duty_alerts_target_status
  ON public.duty_alerts (target_user_id, status);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_endpoint_not_blank CHECK (length(btrim(endpoint)) > 0),
  CONSTRAINT push_subscriptions_keys_not_blank CHECK (
    length(btrim(p256dh)) > 0 AND length(btrim(auth)) > 0
  )
);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions (VAPID). Used by n8n duty / emergency notify loop.';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- B. Flagi zgłoszenia + vendor 24h
-- ---------------------------------------------------------------------------

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS immediate_fulfillment boolean NOT NULL DEFAULT false;

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS emergency_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS emergency_vendor_id uuid REFERENCES public.vendor_partners (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.property_issues.immediate_fulfillment IS
  'Administracja-only dispatch mode. Not an issue_status_enum value.';

COMMENT ON COLUMN public.property_issues.emergency_mode IS
  'Created from the Administracja emergency panel. Routes to 24h pogotowie, not Serwis duty.';

COMMENT ON COLUMN public.property_issues.emergency_vendor_id IS
  'vendor_partners row chosen as 24h provider for an emergency_mode issue.';

CREATE INDEX IF NOT EXISTS idx_property_issues_emergency_org
  ON public.property_issues (org_id, created_at DESC)
  WHERE emergency_mode = true;

ALTER TABLE public.vendor_partners
  ADD COLUMN IF NOT EXISTS is_emergency_24h boolean NOT NULL DEFAULT false;

ALTER TABLE public.vendor_partners
  ADD COLUMN IF NOT EXISTS trade_categories text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.vendor_partners.is_emergency_24h IS
  'Vendor may be assigned as after-hours 24h technical emergency provider.';

COMMENT ON COLUMN public.vendor_partners.trade_categories IS
  'Issue trade labels (e.g. Elektryczna, Hydrauliczna). Empty = unset.';

CREATE OR REPLACE FUNCTION public.trade_categories_are_valid(p_cats text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_cats IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_cats) AS t(cat)
      WHERE length(btrim(cat)) = 0
    );
$$;

ALTER TABLE public.vendor_partners
  DROP CONSTRAINT IF EXISTS vendor_partners_trade_categories_chk;

ALTER TABLE public.vendor_partners
  ADD CONSTRAINT vendor_partners_trade_categories_chk
  CHECK (public.trade_categories_are_valid(trade_categories));

CREATE TABLE IF NOT EXISTS public.community_emergency_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.cleaning_locations (id) ON DELETE CASCADE,
  trade_category text NOT NULL,
  vendor_partner_id uuid NOT NULL REFERENCES public.vendor_partners (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_emergency_providers_trade_not_blank CHECK (
    length(btrim(trade_category)) > 0
  )
);

COMMENT ON TABLE public.community_emergency_providers IS
  'Which 24h vendor covers a trade on a community (optional per-building override). Separate from Home contact board.';

CREATE UNIQUE INDEX IF NOT EXISTS community_emergency_providers_community_trade_uidx
  ON public.community_emergency_providers (community_id, trade_category)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS community_emergency_providers_location_trade_uidx
  ON public.community_emergency_providers (community_id, location_id, trade_category)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_emergency_providers_org
  ON public.community_emergency_providers (org_id, community_id);

CREATE INDEX IF NOT EXISTS idx_community_emergency_providers_vendor
  ON public.community_emergency_providers (vendor_partner_id);

-- ---------------------------------------------------------------------------
-- C. Tablica kontaktów Home (ręczna, bez joinów do firm)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.community_contact_board_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  label text NOT NULL,
  phone text,
  email text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT community_contact_board_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT community_contact_board_email_chk CHECK (
    email IS NULL
    OR email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

COMMENT ON TABLE public.community_contact_board_entries IS
  'Manual resident contact board. Not synced with vendor_partners or emergency providers.';

CREATE INDEX IF NOT EXISTS idx_community_contact_board_community
  ON public.community_contact_board_entries (community_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_community_contact_board_org
  ON public.community_contact_board_entries (org_id);

-- ---------------------------------------------------------------------------
-- RLS on (no policies yet — API cannot read/write until WARSTWA 2)
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_duty_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_duty_eligible ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_emergency_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_contact_board_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.org_duty_state FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.org_duty_eligible FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.duty_alerts FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.community_emergency_providers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.community_contact_board_entries FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.org_duty_state TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.org_duty_eligible TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duty_alerts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_emergency_providers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_contact_board_entries TO authenticated, service_role;
