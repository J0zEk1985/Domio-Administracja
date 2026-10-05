BEGIN;

-- WARSTWA 1+2: katalog branż pogotowia 24h, kolumny, RLS.
-- RPC (resolve_emergency_vendor / create_emergency_issue) — WARSTWA 3.
-- trade_category zostaje zsynchronizowane z label_pl, żeby obecne RPC nie padło.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.emergency_trades (
  code text PRIMARY KEY,
  label_pl text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT emergency_trades_code_chk CHECK (code ~ '^[a-z0-9_]+$'),
  CONSTRAINT emergency_trades_label_not_blank CHECK (length(btrim(label_pl)) > 0),
  CONSTRAINT emergency_trades_sort_order_chk CHECK (sort_order >= 0),
  CONSTRAINT emergency_trades_sort_order_uidx UNIQUE (sort_order)
);

COMMENT ON TABLE public.emergency_trades IS
  'Canonical 24h emergency trades. Platform catalog — not tenant data.';

INSERT INTO public.emergency_trades (code, label_pl, sort_order) VALUES
  ('pogotowie_techniczne', 'Pogotowie techniczne', 10),
  ('elektryczna', 'Elektryczna', 20),
  ('hydrauliczna', 'Hydrauliczna', 30),
  ('domofony', 'Domofony', 40),
  ('slusarska', 'Ślusarska', 50),
  ('sprzatanie', 'Sprzątanie', 60),
  ('wezly_cieplne', 'Węzły cieplne', 70),
  ('kotlownie', 'Kotłownie', 80),
  ('piece_gazowe', 'Piece gazowe', 90),
  ('ogolnobudowlana', 'Ogólnobudowlana', 100)
ON CONFLICT (code) DO UPDATE
SET
  label_pl = EXCLUDED.label_pl,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

ALTER TABLE public.emergency_trades ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.emergency_trades FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.emergency_trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.emergency_trades TO service_role;

DROP POLICY IF EXISTS emergency_trades_select_authenticated ON public.emergency_trades;
CREATE POLICY emergency_trades_select_authenticated
  ON public.emergency_trades
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ---------------------------------------------------------------------------
-- community_emergency_providers
-- ---------------------------------------------------------------------------

ALTER TABLE public.community_emergency_providers
  ADD COLUMN IF NOT EXISTS trade_code text REFERENCES public.emergency_trades (code);

ALTER TABLE public.community_emergency_providers
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;

UPDATE public.community_emergency_providers cep
SET trade_code = mapped.code
FROM (
  VALUES
    ('Elektryczna', 'elektryczna'),
    ('Hydrauliczna', 'hydrauliczna'),
    ('Ogólnobudowlana', 'ogolnobudowlana'),
    ('Ślusarska', 'slusarska'),
    ('Sprzątanie', 'sprzatanie'),
    ('Pogotowie techniczne', 'pogotowie_techniczne'),
    ('Domofony', 'domofony'),
    ('Węzły cieplne', 'wezly_cieplne'),
    ('Kotłownie', 'kotlownie'),
    ('Piece gazowe', 'piece_gazowe')
) AS mapped(label_pl, code)
WHERE cep.trade_code IS NULL
  AND btrim(cep.trade_category) = mapped.label_pl;

DELETE FROM public.community_emergency_providers
WHERE trade_code IS NULL;

ALTER TABLE public.community_emergency_providers
  ALTER COLUMN trade_code SET NOT NULL;

ALTER TABLE public.community_emergency_providers
  ALTER COLUMN vendor_partner_id DROP NOT NULL;

ALTER TABLE public.community_emergency_providers
  DROP CONSTRAINT IF EXISTS community_emergency_providers_enabled_requires_vendor_chk;

ALTER TABLE public.community_emergency_providers
  ADD CONSTRAINT community_emergency_providers_enabled_requires_vendor_chk
  CHECK (is_enabled = false OR vendor_partner_id IS NOT NULL);

ALTER TABLE public.community_emergency_providers
  DROP CONSTRAINT IF EXISTS community_emergency_providers_community_wide_chk;

ALTER TABLE public.community_emergency_providers
  ADD CONSTRAINT community_emergency_providers_community_wide_chk
  CHECK (location_id IS NULL);

DROP INDEX IF EXISTS public.community_emergency_providers_community_trade_uidx;
DROP INDEX IF EXISTS public.community_emergency_providers_location_trade_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS community_emergency_providers_community_trade_code_uidx
  ON public.community_emergency_providers (community_id, trade_code);

CREATE OR REPLACE FUNCTION public.sync_emergency_provider_trade_label()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  SELECT et.label_pl INTO STRICT NEW.trade_category
  FROM public.emergency_trades et
  WHERE et.code = NEW.trade_code;

  IF NEW.location_id IS NOT NULL THEN
    RAISE EXCEPTION 'EMERGENCY_PROVIDER_COMMUNITY_WIDE'
      USING ERRCODE = '23514',
            HINT = '24h emergency providers are configured per community, not per building.';
  END IF;

  IF NEW.is_enabled AND NEW.vendor_partner_id IS NULL THEN
    RAISE EXCEPTION 'EMERGENCY_PROVIDER_VENDOR_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.vendor_partner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.vendor_partners vp
    WHERE vp.id = NEW.vendor_partner_id
      AND vp.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'EMERGENCY_PROVIDER_VENDOR_ORG'
      USING ERRCODE = '23514',
            HINT = 'Vendor must belong to the same organization.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_emergency_provider_trade_label() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_emergency_provider_trade_label ON public.community_emergency_providers;
CREATE TRIGGER trg_sync_emergency_provider_trade_label
  BEFORE INSERT OR UPDATE OF trade_code, org_id, vendor_partner_id, is_enabled, location_id
  ON public.community_emergency_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_emergency_provider_trade_label();

COMMENT ON TABLE public.community_emergency_providers IS
  'Community-wide 24h emergency vendor per trade. Separate from Home contact board.';

COMMENT ON COLUMN public.community_emergency_providers.trade_code IS
  'FK to emergency_trades.code. Canonical routing key.';

COMMENT ON COLUMN public.community_emergency_providers.is_enabled IS
  'Administrator toggle: this trade operates in 24h emergency mode.';

COMMENT ON COLUMN public.community_emergency_providers.trade_category IS
  'Deprecated display copy of emergency_trades.label_pl. Kept for current RPC exact-match until WARSTWA 3.';

DROP POLICY IF EXISTS community_emergency_providers_select ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_select
  ON public.community_emergency_providers
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_active_org_member(org_id)));

DROP POLICY IF EXISTS community_emergency_providers_insert ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_insert
  ON public.community_emergency_providers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.can_manage_serwis_duty(org_id))
    AND EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.id = community_id
        AND c.org_id = org_id
    )
    AND (
      vendor_partner_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.vendor_partners vp
        WHERE vp.id = vendor_partner_id
          AND vp.org_id = org_id
      )
    )
  );

DROP POLICY IF EXISTS community_emergency_providers_update ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_update
  ON public.community_emergency_providers
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.can_manage_serwis_duty(org_id)))
  WITH CHECK (
    (SELECT public.can_manage_serwis_duty(org_id))
    AND EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.id = community_id
        AND c.org_id = org_id
    )
    AND (
      vendor_partner_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.vendor_partners vp
        WHERE vp.id = vendor_partner_id
          AND vp.org_id = org_id
      )
    )
  );

DROP POLICY IF EXISTS community_emergency_providers_delete ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_delete
  ON public.community_emergency_providers
  FOR DELETE
  TO authenticated
  USING ((SELECT public.can_manage_serwis_duty(org_id)));

-- ---------------------------------------------------------------------------
-- property_issues.emergency_trade_code
-- ---------------------------------------------------------------------------

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS emergency_trade_code text REFERENCES public.emergency_trades (code);

ALTER TABLE public.property_issues
  DROP CONSTRAINT IF EXISTS property_issues_emergency_trade_consistency_chk;

ALTER TABLE public.property_issues
  ADD CONSTRAINT property_issues_emergency_trade_consistency_chk
  CHECK (
    (emergency_mode = false AND emergency_trade_code IS NULL)
    OR (emergency_mode = true AND emergency_trade_code IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_property_issues_emergency_trade
  ON public.property_issues (org_id, emergency_trade_code)
  WHERE emergency_mode = true;

COMMENT ON COLUMN public.property_issues.emergency_trade_code IS
  'Canonical 24h trade. Independent of property_issues.category (Serwis taxonomy).';

CREATE OR REPLACE FUNCTION public.enforce_property_issue_duty_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_mgmt boolean;
  v_flags_changed boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  v_org := COALESCE(NEW.org_id, OLD.org_id);
  v_mgmt := v_org IS NOT NULL AND (
    public.is_management_role(v_org) OR public.is_org_management(v_org)
  );

  IF TG_OP = 'INSERT' THEN
    IF (
      NEW.immediate_fulfillment IS TRUE
      OR NEW.emergency_mode IS TRUE
      OR NEW.emergency_vendor_id IS NOT NULL
      OR NEW.emergency_trade_code IS NOT NULL
    ) AND NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_DUTY_FLAGS_FORBIDDEN'
        USING HINT = 'Only Administracja management can set emergency / immediate fulfillment.';
    END IF;
    RETURN NEW;
  END IF;

  v_flags_changed :=
    NEW.immediate_fulfillment IS DISTINCT FROM OLD.immediate_fulfillment
    OR NEW.emergency_mode IS DISTINCT FROM OLD.emergency_mode
    OR NEW.emergency_vendor_id IS DISTINCT FROM OLD.emergency_vendor_id
    OR NEW.emergency_trade_code IS DISTINCT FROM OLD.emergency_trade_code;

  IF v_flags_changed AND NOT v_mgmt THEN
    RAISE EXCEPTION 'ISSUE_DUTY_FLAGS_FORBIDDEN'
      USING HINT = 'Serwis staff cannot change emergency_mode or immediate fulfillment.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_property_issue_duty_flags ON public.property_issues;
CREATE TRIGGER trg_enforce_property_issue_duty_flags
  BEFORE INSERT OR UPDATE OF immediate_fulfillment, emergency_mode, emergency_vendor_id, emergency_trade_code, org_id
  ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_issue_duty_flags();

COMMIT;
