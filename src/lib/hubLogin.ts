/**
 * Centralny Hub logowania (SSO) — logika skopiowana z Domio-Serwis (`src/lib/supabase.ts`):
 * `HUB_LOGIN_URL` + `redirectToHubLogin()` → `${base}/login?returnTo=...`
 *
 * Domio-Cleaning (`LandingPage.tsx`) używa tego samego wzorca z bazą `https://domio.com.pl`
 * (tam stałe w kodzie; tutaj domyślnie to samo + override przez env).
 *
 * Use `||` (not `??`): Coolify/Docker often bake VITE_HUB_URL as "" when the build ARG
 * is unset — nullish coalescing would keep the empty string and redirect to same-origin /login.
 */

const DEFAULT_HUB_URL = "https://domio.com.pl";

function resolveHubLoginUrl(): string {
  const fromEnv = (import.meta.env.VITE_HUB_URL ?? "").trim();
  return fromEnv || DEFAULT_HUB_URL;
}

export const HUB_LOGIN_URL = resolveHubLoginUrl();

/**
 * Przekierowanie do `/login` na Hubie z parametrem `returnTo` (jak Cleaning / Serwis).
 */
export function redirectToHubLogin(returnUrl?: string): void {
  const url = returnUrl ?? window.location.href;
  const returnTo = encodeURIComponent(url);
  const base = HUB_LOGIN_URL.replace(/\/?$/, "") || DEFAULT_HUB_URL;
  window.location.href = `${base}/login?returnTo=${returnTo}`;
}
