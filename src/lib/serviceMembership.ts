/**
 * Determines whether a membership row qualifies for internal service (technician) assignment.
 * Cleaning staff (`cleaner`) is excluded; coordinators/admins/owners remain assignable as in small orgs.
 */
const EXCLUDED_FROM_SERVICE_ASSIGNMENT = new Set(["cleaner"]);

const DEFAULT_SERVICE_ROLES = new Set([
  "technik",
  "technician",
  "serwis",
  "service",
  "service_technician",
  "coordinator",
  "owner",
  "admin",
  "administrator",
  "assistant",
]);

function hasServiceSpecialization(specializations: string[] | null | undefined): boolean {
  if (!specializations?.length) return false;
  return specializations.some((raw) => {
    const s = raw.trim().toLowerCase();
    return (
      s.includes("serwis") || s.includes("technik") || s === "service" || s.includes("maintenance")
    );
  });
}

export function isAssignableServiceStaffMember(row: {
  role: string;
  specializations: string[] | null;
}): boolean {
  const r = (row.role ?? "").trim().toLowerCase();
  if (EXCLUDED_FROM_SERVICE_ASSIGNMENT.has(r)) return false;
  if (DEFAULT_SERVICE_ROLES.has(r)) return true;
  return hasServiceSpecialization(row.specializations);
}
