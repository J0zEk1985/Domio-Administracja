/** PostgREST filter: hide Cleaning-internal tickets until hand-off. */
export const ADMIN_VISIBLE_ISSUES_OR =
  "source.neq.cleaning,released_from_cleaning_at.not.is.null";

/**
 * PostgREST filter: hide Serwis-internal tickets unless they were sent to Administracja.
 * Chain with `.or(ADMIN_VISIBLE_ISSUES_OR)` — the two `.or()` calls are ANDed.
 */
export const ADMIN_HANDOFF_FROM_SERWIS_OR =
  "source.not.in.(dispatcher,serwis),status.eq.pending_admin_approval";

const SERWIS_SOURCES = new Set(["dispatcher", "serwis"]);
const CLEANING_SOURCES = new Set(["cleaning", "cleaning_app"]);

export function isIssueVisibleInAdminModule(issue: {
  source?: string | null;
  status?: string | null;
  released_from_cleaning_at?: string | null;
}): boolean {
  const source = (issue.source ?? "").trim().toLowerCase();
  if (CLEANING_SOURCES.has(source)) {
    return Boolean(issue.released_from_cleaning_at);
  }
  if (SERWIS_SOURCES.has(source)) {
    return issue.status === "pending_admin_approval";
  }
  return true;
}
