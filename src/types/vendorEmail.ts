/**
 * Email bridge for vendors without a DOMIO login.
 * Outbound: templated issue dispatch. Inbound: CRM status mails matched by token / template.
 */

export type VendorDispatchChannel = "in_app" | "email";

export type VendorEmailEventType =
  | "accepted"
  | "assigned_technician"
  | "completed"
  | "rejected";

export type IssueEmailDispatchStatus = "queued" | "sent" | "failed" | "cancelled";

/** Denormalized list field on property_issues — no cancelled (row stays queued|sent|failed). */
export type PropertyIssueEmailDispatchStatus = "queued" | "sent" | "failed";

export type VendorEmailMatchMethod = "token" | "vendor_ref" | "template" | "thread" | "manual" | "unmatched";

export type VendorEmailInboundEventStatus =
  | "received"
  | "applied"
  | "unmatched"
  | "rejected"
  | "duplicate";

export type VendorEmailLifecycleEventType =
  | "email_queued"
  | "email_sent"
  | "email_accepted"
  | "email_assigned"
  | "email_completed"
  | "email_rejected"
  | "email_unmatched";

export interface VendorEmailChannel {
  vendorId: string;
  orgId: string;
  outboundToEmail: string | null;
  outboundCc: string[];
  outboundSubjectTemplate: string;
  outboundBodyTemplate: string;
  inboundFromAllowlist: string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorEmailInboundTemplate {
  id: string;
  vendorId: string;
  orgId: string;
  eventType: VendorEmailEventType;
  subjectPattern: string | null;
  bodyPattern: string;
  sampleBody: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueEmailDispatch {
  id: string;
  orgId: string;
  issueId: string;
  vendorId: string;
  correlationToken: string;
  outboundMessageId: string | null;
  vendorExternalRef: string | null;
  status: IssueEmailDispatchStatus;
  dispatchError: string | null;
  queuedAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorEmailInboundEvent {
  id: string;
  orgId: string | null;
  vendorId: string | null;
  issueId: string | null;
  dispatchId: string | null;
  messageId: string;
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  bodyText: string | null;
  matchedEventType: VendorEmailEventType | null;
  extracted: Record<string, unknown>;
  matchMethod: VendorEmailMatchMethod;
  status: VendorEmailInboundEventStatus;
  errorDetail: string | null;
  rawPayload: Record<string, unknown>;
  createdAt: string;
}

/** Payload n8n reads via get_issue_email_payload / queue_issue_email_dispatch. */
export interface VendorIssueEmailPayload {
  dispatchId: string;
  issueId: string;
  toEmail: string;
  toName?: string;
  cc?: string[];
  replyTo: string;
  subjectTemplate: string;
  bodyTemplate: string;
  variables: Record<string, string>;
  queued?: boolean;
}

export const VENDOR_EMAIL_DEFAULT_SUBJECT =
  "[DOMIO {{issue.token}}] Zgłoszenie: {{building.address}}";

export const VENDOR_EMAIL_DEFAULT_BODY = `Dzień dobry,

Przekazujemy zgłoszenie serwisowe do realizacji.

Budynek
{{building.name}}
{{building.address}}

Zgłoszenie
Kategoria: {{issue.category}}
Priorytet: {{issue.priority}}
Opis:
{{issue.description}}

Zgłaszający
{{reporter.name}}
Telefon: {{reporter.phone}}

Nadawca
{{org.name}}

Numer DOMIO: {{issue.id}}
Ref: {{issue.token}}

Prosimy o potwierdzenie przyjęcia zgłoszenia.`;

export const VENDOR_EMAIL_OUTBOUND_PLACEHOLDERS = [
  "{{issue.id}}",
  "{{issue.token}}",
  "{{issue.description}}",
  "{{issue.category}}",
  "{{issue.priority}}",
  "{{building.name}}",
  "{{building.address}}",
  "{{org.name}}",
  "{{reporter.name}}",
  "{{reporter.phone}}",
] as const;

export const VENDOR_EMAIL_INBOUND_CAPTURE_PLACEHOLDERS = [
  "{{address}}",
  "{{description}}",
  "{{vendor_ticket}}",
  "{{technician_name}}",
] as const;

export const VENDOR_DISPATCH_CHANNEL_LABEL: Record<VendorDispatchChannel, string> = {
  in_app: "Konto w DOMIO",
  email: "Most e-mail",
};

export const VENDOR_EMAIL_EVENT_LABEL: Record<VendorEmailEventType, string> = {
  accepted: "Przyjęcie zgłoszenia",
  assigned_technician: "Wydanie technikowi",
  completed: "Zrealizowane",
  rejected: "Odrzucone",
};

export const ISSUE_EMAIL_DISPATCH_STATUS_LABEL: Record<IssueEmailDispatchStatus, string> = {
  queued: "W kolejce wysyłki",
  sent: "Wysłane do firmy",
  failed: "Błąd wysyłki",
  cancelled: "Anulowane",
};

export const VENDOR_EMAIL_MATCH_METHOD_LABEL: Record<VendorEmailMatchMethod, string> = {
  token: "Numer DOMIO",
  vendor_ref: "Numer w systemie firmy",
  template: "Szablon wiadomości",
  thread: "Wątek e-mail",
  manual: "Przypisane ręcznie",
  unmatched: "Niedopasowane",
};

export const VENDOR_EMAIL_INBOUND_STATUS_LABEL: Record<VendorEmailInboundEventStatus, string> = {
  received: "Odebrane",
  applied: "Zastosowane",
  unmatched: "Do ręcznego przypisania",
  rejected: "Odrzucone",
  duplicate: "Duplikat",
};

export const VENDOR_EMAIL_LIFECYCLE_EVENT_LABEL: Record<VendorEmailLifecycleEventType, string> = {
  email_queued: "Zlecono wysyłkę e-mail",
  email_sent: "E-mail wysłany do firmy",
  email_accepted: "Firma przyjęła zgłoszenie",
  email_assigned: "Firma wydała technikowi",
  email_completed: "Firma zrealizowała zgłoszenie",
  email_rejected: "Firma odrzuciła zgłoszenie",
  email_unmatched: "Nie dopasowano wiadomości e-mail",
};
