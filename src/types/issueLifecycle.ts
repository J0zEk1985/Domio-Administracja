export type IssueLifecycleEventType =
  | "claimed"
  | "started"
  | "cancel_requested"
  | "cancelled"
  | "transfer_requested"
  | "transfer_accepted"
  | "transfer_rejected";

export type IssueLifecycleEventPayload = {
  assigned_staff_id?: string;
  reason?: string | null;
  transfer_to_vendor_id?: string | null;
};

export interface IssueLifecycleEvent {
  id: string;
  org_id: string;
  issue_id: string;
  event_type: IssueLifecycleEventType;
  actor_user_id: string | null;
  payload: IssueLifecycleEventPayload;
  created_at: string;
}

/** Extra columns on property_issues from lifecycle / routing-guard migration. */
export interface PropertyIssueLifecycleFields {
  claimed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancel_requested_at: string | null;
  cancel_requested_by: string | null;
  cancel_request_reason: string | null;
  transfer_to_vendor_id: string | null;
  transfer_authorized_at: string | null;
  transfer_authorized_by: string | null;
  is_transfer_requested: boolean | null;
  transfer_reason: string | null;
}

export type TriageRoutingLock =
  | "unlocked"
  | "claimed_internal"
  | "in_progress"
  | "delegated"
  | "transfer_pending"
  | "cancelled";

export function getTriageRoutingLock(issue: {
  status?: string | null;
  assigned_staff_id?: string | null;
  started_at?: string | null;
  delegated_vendor_id?: string | null;
  is_transfer_requested?: boolean | null;
}): TriageRoutingLock {
  if (issue.status === "cancelled") return "cancelled";
  if (issue.is_transfer_requested) return "transfer_pending";
  if (issue.delegated_vendor_id) return "delegated";
  const started =
    Boolean(issue.started_at) || issue.status === "in_progress";
  if (started && issue.assigned_staff_id) return "in_progress";
  if (issue.assigned_staff_id) return "claimed_internal";
  return "unlocked";
}

/** Postgres RAISE EXCEPTION codes from enforce_property_issue_lifecycle(). */
export const ISSUE_LIFECYCLE_ERROR_CODES = [
  "ISSUE_AUTH_REQUIRED",
  "ISSUE_NOT_FOUND",
  "ISSUE_REJECT_LOCKED",
  "ISSUE_REJECT_FORBIDDEN",
  "ISSUE_CANCEL_AFTER_START",
  "ISSUE_CANCEL_FORBIDDEN",
  "ISSUE_CANCEL_REQUEST_FORBIDDEN",
  "ISSUE_CANCEL_REASON_REQUIRED",
  "ISSUE_BROADCAST_LOCKED",
  "ISSUE_BROADCAST_FORBIDDEN",
  "ISSUE_TRANSFER_NEEDS_AUTH",
  "ISSUE_TRANSFER_NOT_NEEDED",
  "ISSUE_TRANSFER_FIELDS_REQUIRED",
  "ISSUE_TRANSFER_AUTH_FORBIDDEN",
  "ISSUE_TRANSFER_DECLINE_FORBIDDEN",
  "ISSUE_TRANSFER_REQUEST_FORBIDDEN",
  "ISSUE_DELEGATE_FORBIDDEN",
  "ISSUE_UNCLAIM_LOCKED",
  "ISSUE_ROUTING_FORBIDDEN",
] as const;

export type IssueLifecycleErrorCode =
  (typeof ISSUE_LIFECYCLE_ERROR_CODES)[number];

const ERROR_MESSAGE_PL: Record<IssueLifecycleErrorCode, string> = {
  ISSUE_AUTH_REQUIRED: "Musisz być zalogowany.",
  ISSUE_NOT_FOUND: "Nie znaleziono zgłoszenia lub brak uprawnień.",
  ISSUE_REJECT_LOCKED:
    "Nie można odrzucić podjętego zlecenia. Anuluj je albo złóż wniosek o anulowanie.",
  ISSUE_REJECT_FORBIDDEN: "Tylko dyspozytor lub administrator może odrzucić zgłoszenie.",
  ISSUE_CANCEL_AFTER_START:
    "Prace już wystartowały. Złóż wniosek o anulowanie zamiast kasować zlecenie.",
  ISSUE_CANCEL_FORBIDDEN: "Tylko dyspozytor lub administrator może anulować zlecenie.",
  ISSUE_CANCEL_REQUEST_FORBIDDEN:
    "Tylko dyspozytor lub administrator może wnioskować o anulowanie.",
  ISSUE_CANCEL_REASON_REQUIRED: "Podaj powód (minimum 3 znaki).",
  ISSUE_BROADCAST_LOCKED:
    "Nie można wysłać na giełdę zlecenia już podjętego lub delegowanego.",
  ISSUE_BROADCAST_FORBIDDEN: "Tylko dyspozytor lub administrator może wysłać zgłoszenie na giełdę.",
  ISSUE_TRANSFER_NEEDS_AUTH:
    "Zmiana firmy wymaga wniosku o cesję i zgody kontrahenta.",
  ISSUE_TRANSFER_NOT_NEEDED:
    "Wolne zgłoszenie deleguj bezpośrednio, bez wniosku o cesję.",
  ISSUE_TRANSFER_FIELDS_REQUIRED: "Wybierz firmę i podaj powód cesji (minimum 3 znaki).",
  ISSUE_TRANSFER_AUTH_FORBIDDEN: "Tylko wskazany kontrahent może zaakceptować cesję.",
  ISSUE_TRANSFER_DECLINE_FORBIDDEN: "Tylko kontrahent lub dyspozytor może odrzucić wniosek o cesję.",
  ISSUE_TRANSFER_REQUEST_FORBIDDEN: "Tylko dyspozytor lub administrator może wnioskować o cesję.",
  ISSUE_DELEGATE_FORBIDDEN: "Tylko dyspozytor lub administrator może delegować wolne zgłoszenie.",
  ISSUE_UNCLAIM_LOCKED: "Nie można zdjąć technika bez anulowania albo autoryzowanej cesji.",
  ISSUE_ROUTING_FORBIDDEN:
    "Technik nie może odrzucać, anulować ani przekazywać zlecenia do innej firmy.",
};

export function issueLifecycleErrorMessagePl(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err ?? "");
  for (const code of ISSUE_LIFECYCLE_ERROR_CODES) {
    if (raw.includes(code)) return ERROR_MESSAGE_PL[code];
  }
  return raw.trim() || "Operacja nie powiodła się.";
}
