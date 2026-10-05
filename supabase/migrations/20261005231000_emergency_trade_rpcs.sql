BEGIN;

-- WARSTWA 3: RPC pogotowia 24h — trade_code, is_enabled, mapowanie category Serwisu.
-- Wejście p_trade_category / p_category: kod katalogu LUB etykieta PL (kompatybilność UI).

CREATE OR REPLACE FUNCTION public.resolve_emergency_trade_code(p_trade text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT et.code
  FROM public.emergency_trades et
  WHERE et.is_active = true
    AND (
      et.code = lower(btrim(COALESCE(p_trade, '')))
      OR et.label_pl = btrim(COALESCE(p_trade, ''))
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_emergency_trade_code(text) IS
  'Maps emergency trade code or Polish label to emergency_trades.code.';

CREATE OR REPLACE FUNCTION public.emergency_trade_to_issue_category(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE btrim(COALESCE(p_code, ''))
    WHEN 'elektryczna' THEN 'Elektryczna'
    WHEN 'hydrauliczna' THEN 'Hydrauliczna'
    WHEN 'slusarska' THEN 'Ślusarska'
    WHEN 'ogolnobudowlana' THEN 'Ogólnobudowlana'
    ELSE 'Inna'
  END;
$$;

COMMENT ON FUNCTION public.emergency_trade_to_issue_category(text) IS
  'Maps 24h trade code to Serwis property_issues.category. Non-overlapping trades become Inna.';

CREATE OR REPLACE FUNCTION public.sync_emergency_provider_trade_label()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
BEGIN
  v_code := NULLIF(btrim(COALESCE(NEW.trade_code, '')), '');
  IF v_code IS NULL THEN
    v_code := public.resolve_emergency_trade_code(NEW.trade_category);
  ELSE
    v_code := public.resolve_emergency_trade_code(v_code);
  END IF;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'EMERGENCY_TRADE_UNKNOWN'
      USING ERRCODE = '23514';
  END IF;

  NEW.trade_code := v_code;

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

CREATE OR REPLACE FUNCTION public.resolve_emergency_vendor(
  p_community_id uuid,
  p_location_id uuid,
  p_trade_category text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_vendor uuid;
  v_code text;
  v_enabled boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  v_code := public.resolve_emergency_trade_code(p_trade_category);
  IF p_community_id IS NULL THEN
    RAISE EXCEPTION 'EMERGENCY_VENDOR_ARGS';
  END IF;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'EMERGENCY_TRADE_UNKNOWN';
  END IF;

  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = p_community_id;

  IF v_org IS NULL OR NOT public.can_manage_serwis_duty(v_org) THEN
    RAISE EXCEPTION 'EMERGENCY_MANAGE_FORBIDDEN';
  END IF;

  -- Community-wide only (location_id is always NULL). p_location_id kept for API compatibility.
  SELECT cep.vendor_partner_id, cep.is_enabled
  INTO v_vendor, v_enabled
  FROM public.community_emergency_providers cep
  WHERE cep.community_id = p_community_id
    AND cep.trade_code = v_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMERGENCY_VENDOR_MISSING';
  END IF;
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'EMERGENCY_TRADE_DISABLED';
  END IF;

  IF v_vendor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.vendor_partners vp
    WHERE vp.id = v_vendor
      AND vp.org_id = v_org
      AND vp.is_emergency_24h = true
  ) THEN
    RAISE EXCEPTION 'EMERGENCY_VENDOR_MISSING';
  END IF;

  RETURN v_vendor;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_emergency_issue(
  p_location_id uuid,
  p_category text,
  p_description text,
  p_photos_before text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_community uuid;
  v_vendor uuid;
  v_issue uuid;
  v_desc text := btrim(COALESCE(p_description, ''));
  v_code text;
  v_serwis_cat text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  v_code := public.resolve_emergency_trade_code(p_category);
  IF p_location_id IS NULL OR v_code IS NULL OR length(v_desc) < 10 THEN
    RAISE EXCEPTION 'EMERGENCY_ISSUE_INVALID';
  END IF;

  v_org := public.get_my_org_id_safe();
  IF v_org IS NULL OR NOT public.can_manage_serwis_duty(v_org) THEN
    RAISE EXCEPTION 'EMERGENCY_MANAGE_FORBIDDEN';
  END IF;

  SELECT cl.community_id INTO v_community
  FROM public.cleaning_locations cl
  WHERE cl.id = p_location_id
    AND cl.org_id = v_org;

  IF v_community IS NULL THEN
    RAISE EXCEPTION 'EMERGENCY_LOCATION_FORBIDDEN';
  END IF;

  v_vendor := public.resolve_emergency_vendor(v_community, NULL, v_code);
  v_serwis_cat := public.emergency_trade_to_issue_category(v_code);

  INSERT INTO public.property_issues (
    org_id,
    location_id,
    category,
    description,
    priority,
    status,
    source,
    reporter_type,
    reporter_id,
    photos_before,
    immediate_fulfillment,
    emergency_mode,
    emergency_vendor_id,
    emergency_trade_code,
    delegated_vendor_id
  ) VALUES (
    v_org,
    p_location_id,
    v_serwis_cat,
    v_desc,
    'critical',
    'delegated',
    'admin_ui',
    'admin',
    (SELECT auth.uid()),
    p_photos_before,
    true,
    true,
    v_vendor,
    v_code,
    v_vendor
  )
  RETURNING id INTO v_issue;

  RETURN jsonb_build_object(
    'issue_id', v_issue,
    'vendor_id', v_vendor,
    'trade_code', v_code,
    'category', v_serwis_cat
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_emergency_trade_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emergency_trade_to_issue_category(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_emergency_vendor(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_emergency_issue(uuid, text, text, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.resolve_emergency_trade_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_trade_to_issue_category(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_emergency_vendor(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_emergency_issue(uuid, text, text, text[]) TO authenticated;

COMMIT;
