/**
 * Centralny Hub logowania (SSO) — logika skopiowana z Domio-Serwis (`src/lib/supabase.ts`):
 * `HUB_LOGIN_URL` + `redirectToHubLogin()` → `${base}/login?returnTo=...`
 *
 * Domio-Cleaning (`LandingPage.tsx`) używa tego samego wzorca z bazą `https://domio.com.pl`
 * (tam stałe w kodzie; tutaj domyślnie to samo + override przez env).
 */

export const HUB_LOGIN_URL = import.meta.env.VITE_HUB_URL ?? "https://domio.com.pl";

/**
 * Przekierowanie do `/login` na Hubie z parametrem `returnTo` (jak Cleaning / Serwis).
 */
export function redirectToHubLogin(returnUrl?: string): void {
  const url = returnUrl ?? window.location.href;
  const returnTo = encodeURIComponent(url);
  const base = HUB_LOGIN_URL.replace(/\/?$/, "");
  window.location.href = `${base}/login?returnTo=${returnTo}`;
}
