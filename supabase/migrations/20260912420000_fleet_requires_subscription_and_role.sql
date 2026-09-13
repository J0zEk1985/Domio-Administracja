-- =====================================================================
-- Flota jest modulem platnym, tak jak Cleaning / Serwis / Administracja.
--
-- user_has_module_access dawalo wstęp przy samym profiles.fleet_role
-- (admin/driver), bez org_subscriptions. Wlasciciel org bez wykupionej
-- Floty albo uzytkownik bez roli flotowej nie moze wejsc.
--
-- Flota: aktywna subskrypcja org (czlonkostwo albo pojazd kierowcy)
--        ORAZ fleet_role IN (admin, driver).
-- Inne moduly: bez zmian (subskrypcja przez memberships / darmowy Home /
--              platform admin).
-- =====================================================================

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
  'Paid modules need an active org subscription. Flota also requires fleet_role admin/driver. Platform admin and free apps (Home) remain exceptions.';
