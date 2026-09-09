const CLEANING_SOURCES = new Set(["cleaning", "cleaning_app"]);
const CLEANING_REPORTER_TYPES = new Set(["cleaner", "sprzataczka"]);
const DISPATCHER_REPORTER_TYPES = new Set([
  "administrator",
  "admin",
  "dispatcher",
  "dyspozytor",
]);
const NOT_CLEANING_SOURCES = new Set([
  "dispatcher",
  "tenant_qr",
  "public_qr",
  "email_ai",
  "serwis",
  "admin_ui",
]);

export function isIssueFromCleaningModule(issue: {
  reporter_type?: string | null;
  source?: string | null;
}): boolean {
  const reporterType = (issue.reporter_type ?? "").trim().toLowerCase();
  const source = (issue.source ?? "").trim().toLowerCase();
  if (DISPATCHER_REPORTER_TYPES.has(reporterType)) return false;
  if (NOT_CLEANING_SOURCES.has(source)) return false;
  return CLEANING_REPORTER_TYPES.has(reporterType) || CLEANING_SOURCES.has(source);
}

/** Admin inbox only lists released Cleaning tickets; still gate on source. */
export function shouldShowCleaningOriginBadge(issue: {
  reporter_type?: string | null;
  source?: string | null;
}): boolean {
  return isIssueFromCleaningModule(issue);
}

export function issueSourceLabelPl(issue: {
  reporter_type?: string | null;
  source?: string | null;
}): string {
  const source = (issue.source ?? "").trim().toLowerCase();
  switch (source) {
    case "serwis":
      return "Technik";
    case "tenant_qr":
    case "public_qr":
      return "Kod QR";
    case "cleaning":
    case "cleaning_app":
      return "Sprzątanie";
    case "admin_ui":
    case "dispatcher":
      return "Administrator";
    case "email_ai":
      return "E-mail";
    default:
      break;
  }
  if (isIssueFromCleaningModule(issue)) return "Sprzątanie";
  const reporterType = (issue.reporter_type ?? "").trim().toLowerCase();
  if (DISPATCHER_REPORTER_TYPES.has(reporterType)) return "Administrator";
  return "Ręcznie";
}
