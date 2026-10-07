/** Public developer warranty portal. The token is the login secret; the PIN is entered on that page. */
export function developerPortalUrl(accessToken: string, origin?: string): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "https://adm.domio.com.pl")).replace(
    /\/$/,
    "",
  );
  return `${base}/deweloper/${accessToken}`;
}
