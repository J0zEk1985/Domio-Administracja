/** PostgREST filter: hide Cleaning-internal tickets until hand-off. */
export const ADMIN_VISIBLE_ISSUES_OR =
  "source.neq.cleaning,released_from_cleaning_at.not.is.null";

export function isIssueVisibleInAdminModule(issue: {
  source?: string | null;
  released_from_cleaning_at?: string | null;
}): boolean {
  const source = (issue.source ?? "").trim().toLowerCase();
  if (source === "cleaning" || source === "cleaning_app") {
    return Boolean(issue.released_from_cleaning_at);
  }
  return true;
}
