/** UUID tokens on `cleaning_locations` for guest portals (database columns, not `visibility_config`). */
export type PropertyLocationPortalTokens = {
  boardPortalToken: string;
  publicReportToken: string;
};

/** Pusty lub poprawny format e-mail (prosta walidacja UI). */
export function isValidOptionalEmail(value: string): boolean {
  const t = value.trim();
  if (t === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
