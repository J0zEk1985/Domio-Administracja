-- =====================================================================
-- Dostep do modulow: subskrypcja org + platform admin + flota (fleet_role)
--
-- Hub juz filtruje kafelki po org_subscriptions. Aplikacje produktowe
-- wpuszczaly kazdego zalogowanego z dowolnym membership (owner = Serwis)
-- albo w ogole bez sprawdzenia roli (Flota, Administracja).
-- Klient z sama Administracja (np. org Ekstra) wchodzil na Cleaning /
-- Serwis / Flote przez bezposredni URL i wspolna sesje SSO.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.application_matches_module_slug(
  p_name text,
  p_domain_url text,
  p_api_url text,
  p_slug text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE lower(btrim(COALESCE(p_slug, '')))
    WHEN 'cleaning' THEN
      v.blob LIKE '%clean%'
    WHEN 'serwis' THEN
      v.blob LIKE '%serwis%' OR v.blob LIKE '%service%'
    WHEN 'flota' THEN
      v.blob LIKE '%flot%' OR v.blob LIKE '%fleet%'
    WHEN 'administracja' THEN
      v.blob LIKE '%administr%'
    WHEN 'home' THEN
      v.blob LIKE '%home%' OR v.blob LIKE '%mieszkan%'
    ELSE
      false
  END
  FROM (
    SELECT lower(
      concat_ws(
        ' ',
        COALESCE(p_name, ''),
        COALESCE(p_domain_url, ''),
        COALESCE(p_api_url, '')
      )
    ) AS blob
  ) v;
$fn$;

REVOKE ALL ON FUNCTION public.application_matches_module_slug(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_matches_module_slug(text, text, text, text) TO authenticated, service_role;

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
        lower(btrim(COALESCE(p_module_slug, ''))) = 'flota'
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND lower(btrim(COALESCE(p.fleet_role::text, ''))) IN ('admin', 'driver')
        )
      )
      OR EXISTS (
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
    );
$fn$;

COMMENT ON FUNCTION public.user_has_module_access(text) IS
  'True when the caller may open a product module: platform admin, free app, fleet_role for Flota, or an active org subscription.';

REVOKE ALL ON FUNCTION public.user_has_module_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_module_access(text) TO authenticated, service_role;
