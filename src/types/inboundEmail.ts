export type InboundModule = "serwis" | "cleaning" | "administracja";

export type InboundIngestMode = "redacted_template" | "ai_auto";

export type InboundParseMethod = "template" | "ai" | "manual";

export type InboundIngestStatus =
  | "received"
  | "parsed"
  | "created"
  | "needs_review"
  | "rejected"
  | "duplicate";

export type IssueCategoryFromEmail =
  | "Hydrauliczna"
  | "Elektryczna"
  | "Ślusarska"
  | "Ogólnobudowlana"
  | "Inna";

/** Payload n8n → ingest_email_issue(p_parsed). */
export interface ParsedEmailIssue {
  location_id: string | null;
  address_text: string | null;
  category: IssueCategoryFromEmail | null;
  priority: "medium" | "critical" | "low" | "high";
  reporter_name: string | null;
  reporter_phone: string | null;
  reporter_email: string | null;
  description: string;
  confidence: number;
  parse_method: InboundParseMethod;
  prompt_tokens?: number;
  output_tokens?: number;
  photos?: string[];
}

export interface ResolveInboundMailboxResult {
  found: boolean;
  mailbox_id?: string;
  org_id?: string;
  module?: InboundModule;
  alias_local_part?: string;
  ingest_mode?: InboundIngestMode;
  is_enabled?: boolean;
  auto_create_threshold?: number;
  has_ai_auto?: boolean;
  ai_parses_limit?: number;
  ai_parses_used?: number;
  ai_parses_remaining?: number;
  allow_ai_parse?: boolean;
}

export interface IngestEmailIssueResult {
  ingest_id: string;
  issue_id: string | null;
  status: InboundIngestStatus;
  ai_consumed: boolean;
  is_ai_draft?: boolean;
}
