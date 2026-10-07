const PRODUCTION_HOME_ORIGIN = "https://home.domio.com.pl";
const TEST_HOME_ORIGIN = "https://test.home.domio.com.pl";

/** Read-only resident page. The token is not a developer login. */
export function residentWarrantyPublicUrl(token: string, adminOrigin = "https://adm.domio.com.pl"): string {
  let home = PRODUCTION_HOME_ORIGIN;
  try {
    const host = new URL(adminOrigin).host;
    if (host.startsWith("test.")) home = TEST_HOME_ORIGIN;
  } catch (error) {
    console.error("[residentWarrantyPublicUrl]", error);
  }
  return `${home}/usterki/${encodeURIComponent(token)}`;
}
