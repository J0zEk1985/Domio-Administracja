/** Prefiks w `location_holidays.description` — urlopy pracowników z panelu Administracja (schemat bez dedykowanych kolumn). */
export const ADMIN_LEAVE_DESC_PREFIX = "DOMIO_ADMIN_LEAVE_V1:";

export type AdminLeavePayload = {
  staff_user_id: string;
  substitute_user_id: string;
  date_from: string;
  date_to: string;
};

export function encodeAdminLeaveDescription(payload: AdminLeavePayload): string {
  return ADMIN_LEAVE_DESC_PREFIX + JSON.stringify(payload);
}

export function parseAdminLeaveDescription(description: string | null): AdminLeavePayload | null {
  if (!description || !description.startsWith(ADMIN_LEAVE_DESC_PREFIX)) return null;
  try {
    const raw = description.slice(ADMIN_LEAVE_DESC_PREFIX.length);
    const o = JSON.parse(raw) as AdminLeavePayload;
    if (
      typeof o.staff_user_id === "string" &&
      typeof o.substitute_user_id === "string" &&
      typeof o.date_from === "string" &&
      typeof o.date_to === "string"
    ) {
      return o;
    }
  } catch {
    /* ignore */
  }
  return null;
}
