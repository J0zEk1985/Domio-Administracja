-- =====================================================================
-- Wlasciciel organizacji po wykupieniu Floty dostaje fleet_role = admin,
-- analogicznie do roli owner w Cleaning / Serwis / Administracja.
--
-- Nadanie idzie triggerem na org_subscriptions (aktywacja przez RPC
-- checkoutu albo przyszly webhook). Guard profiles.fleet_role wpuszcza
-- ten zapis tylko przy fladze transakcyjnej — klient nadal nie moze
-- sam sobie nadac roli we flocie.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.grant_fleet_admin_to_org_owners(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.granting_fleet_admin', 'on', true);

  UPDATE public.profiles p
  SET fleet_role = 'admin'
  FROM public.memberships m
  WHERE m.user_id = p.id
    AND m.org_id = p_org_id
    AND COALESCE(m.is_active, true) = true
    AND lower(btrim(COALESCE(m.role, ''))) = ANY (
      ARRAY['owner', 'admin', 'administrator', 'wlasciciel', 'właściciel']
    )
    AND COALESCE(p.fleet_role::text, '') IS DISTINCT FROM 'admin';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$fn$;

COMMENT ON FUNCTION public.grant_fleet_admin_to_org_owners(uuid) IS
  'Sets fleet_role=admin for owner-class members of the organisation. Called after a Fleet subscription becomes active.';

REVOKE ALL ON FUNCTION public.grant_fleet_admin_to_org_owners(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_fleet_admin_to_org_owners(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_org_subscriptions_grant_fleet_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF lower(btrim(COALESCE(NEW.status, ''))) <> 'active' THEN
    RETURN NEW;
  END IF;
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = NEW.app_id
      AND a.is_active = true
      AND public.application_matches_module_slug(a.name, a.domain_url, a.api_url, 'flota')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.grant_fleet_admin_to_org_owners(NEW.org_id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_org_subscriptions_grant_fleet_admin ON public.org_subscriptions;
CREATE TRIGGER trg_org_subscriptions_grant_fleet_admin
  AFTER INSERT OR UPDATE OF status, expires_at, app_id
  ON public.org_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_org_subscriptions_grant_fleet_admin();

CREATE OR REPLACE FUNCTION public.tg_profiles_guard_role_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.platform_role IS DISTINCT FROM OLD.platform_role THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany roli platformy'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.fleet_role IS DISTINCT FROM OLD.fleet_role THEN
    IF current_setting('app.granting_fleet_admin', true) = 'on'
       AND NEW.fleet_role IS NOT DISTINCT FROM 'admin'::public.fleet_role THEN
      RETURN NEW;
    END IF;

    IF NOT (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_actor AND p.fleet_role = 'admin'
      )
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany roli we flocie'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.user_has_module_access(p_module_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        WHERE a.is_active = true
          AND COALESCE(a.is_free, false) = true
          AND public.application_matches_module_slug(a.name, a.domain_url, a.api_url, p_module_slug)
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.memberships m
          JOIN public.org_subscriptions s ON s.org_id = m.org_id
          JOIN public.applications a ON a.id = s.app_id
          WHERE m.user_id = (SELECT auth.uid())
            AND COALESCE(m.is_active, true) = true
            AND a.is_active = true
            AND public.application_matches_module_slug(a.name, a.domain_url, a.api_url, p_module_slug)
            AND lower(btrim(COALESCE(s.status, ''))) = 'active'
            AND (s.expires_at IS NULL OR s.expires_at > now())
        )
        AND (
          lower(btrim(COALESCE(p_module_slug, ''))) <> 'flota'
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND lower(btrim(COALESCE(p.fleet_role::text, ''))) IN ('admin', 'driver')
          )
          OR EXISTS (
            SELECT 1
            FROM public.memberships m
            JOIN public.org_subscriptions s ON s.org_id = m.org_id
            JOIN public.applications a ON a.id = s.app_id
            WHERE m.user_id = (SELECT auth.uid())
              AND COALESCE(m.is_active, true) = true
              AND lower(btrim(COALESCE(m.role, ''))) = ANY (
                ARRAY['owner', 'admin', 'administrator', 'wlasciciel', 'właściciel']
              )
              AND a.is_active = true
              AND public.application_matches_module_slug(a.name, a.domain_url, a.api_url, 'flota')
              AND lower(btrim(COALESCE(s.status, ''))) = 'active'
              AND (s.expires_at IS NULL OR s.expires_at > now())
          )
        )
      )
      OR (
        lower(btrim(COALESCE(p_module_slug, ''))) = 'flota'
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND lower(btrim(COALESCE(p.fleet_role::text, ''))) IN ('admin', 'driver')
        )
        AND EXISTS (
          SELECT 1
          FROM public.vehicles v
          JOIN public.org_subscriptions s ON s.org_id = v.org_id
          JOIN public.applications a ON a.id = s.app_id
          WHERE v.assigned_driver_id = (SELECT auth.uid())
            AND a.is_active = true
            AND public.application_matches_module_slug(a.name, a.domain_url, a.api_url, 'flota')
            AND lower(btrim(COALESCE(s.status, ''))) = 'active'
            AND (s.expires_at IS NULL OR s.expires_at > now())
        )
      )
    );
$fn$;

COMMENT ON FUNCTION public.user_has_module_access(text) IS
  'Paid modules need an active org subscription. Flota: fleet_role admin/driver, or org owner after purchase (auto-granted admin). Platform admin and free Home remain exceptions.';

DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT s.org_id
    FROM public.org_subscriptions s
    JOIN public.applications a ON a.id = s.app_id
    WHERE lower(btrim(COALESCE(s.status, ''))) = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND a.is_active = true
      AND public.application_matches_module_slug(a.name, a.domain_url, a.api_url, 'flota')
  LOOP
    PERFORM public.grant_fleet_admin_to_org_owners(r.org_id);
  END LOOP;
END;
$backfill$;
