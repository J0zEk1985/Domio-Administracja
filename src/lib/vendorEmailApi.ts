import { supabase } from "@/lib/supabase";
import type {
  VendorDispatchChannel,
  VendorEmailChannel,
  VendorEmailEventType,
  VendorEmailInboundEvent,
  VendorEmailInboundEventStatus,
  VendorEmailInboundTemplate,
  VendorEmailMatchMethod,
} from "@/types/vendorEmail";
import {
  VENDOR_EMAIL_DEFAULT_BODY,
  VENDOR_EMAIL_DEFAULT_SUBJECT,
} from "@/types/vendorEmail";

type ChannelRow = {
  vendor_id: string;
  org_id: string;
  outbound_to_email: string | null;
  outbound_cc: string[] | null;
  outbound_subject_template: string;
  outbound_body_template: string;
  inbound_from_allowlist: string[] | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type TemplateRow = {
  id: string;
  vendor_id: string;
  org_id: string;
  event_type: string;
  subject_pattern: string | null;
  body_pattern: string;
  sample_body: string | null;
  created_at: string;
  updated_at: string;
};

type InboundEventRow = {
  id: string;
  org_id: string | null;
  vendor_id: string | null;
  issue_id: string | null;
  dispatch_id: string | null;
  message_id: string;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body_text: string | null;
  matched_event_type: string | null;
  extracted: Record<string, unknown> | null;
  match_method: string;
  status: string;
  error_detail: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

export type VendorEmailSaveInput = {
  vendorId: string;
  outboundToEmail: string;
  outboundCc: string[];
  outboundSubjectTemplate: string;
  outboundBodyTemplate: string;
  inboundFromAllowlist: string[];
  isEnabled: boolean;
};

export type VendorEmailTemplateSaveInput = {
  vendorId: string;
  eventType: VendorEmailEventType;
  subjectPattern: string | null;
  bodyPattern: string;
  sampleBody: string | null;
};

function fromTable(table: string) {
  return supabase.from(table as never);
}

function rpcError(context: string, error: { message?: string }): never {
  console.error(`[vendorEmailApi] ${context}:`, error);
  throw new Error(error.message?.trim() || "Operacja e-mail partnera nie powiodła się.");
}

async function requireOrgId(): Promise<string> {
  const { data, error } = await supabase.rpc("get_my_org_id_safe");
  if (error) rpcError("get_my_org_id_safe", error);
  const orgId = data == null ? "" : String(data).trim();
  if (!orgId) throw new Error("Brak organizacji.");
  return orgId;
}

function mapChannel(row: ChannelRow): VendorEmailChannel {
  return {
    vendorId: row.vendor_id,
    orgId: row.org_id,
    outboundToEmail: row.outbound_to_email,
    outboundCc: row.outbound_cc ?? [],
    outboundSubjectTemplate: row.outbound_subject_template,
    outboundBodyTemplate: row.outbound_body_template,
    inboundFromAllowlist: row.inbound_from_allowlist ?? [],
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTemplate(row: TemplateRow): VendorEmailInboundTemplate {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    orgId: row.org_id,
    eventType: row.event_type as VendorEmailEventType,
    subjectPattern: row.subject_pattern,
    bodyPattern: row.body_pattern,
    sampleBody: row.sample_body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInboundEvent(row: InboundEventRow): VendorEmailInboundEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    vendorId: row.vendor_id,
    issueId: row.issue_id,
    dispatchId: row.dispatch_id,
    messageId: row.message_id,
    fromAddress: row.from_address,
    toAddress: row.to_address,
    subject: row.subject,
    bodyText: row.body_text,
    matchedEventType: (row.matched_event_type as VendorEmailEventType | null) ?? null,
    extracted: row.extracted ?? {},
    matchMethod: row.match_method as VendorEmailMatchMethod,
    status: row.status as VendorEmailInboundEventStatus,
    errorDetail: row.error_detail,
    rawPayload: row.raw_payload ?? {},
    createdAt: row.created_at,
  };
}

export function emptyVendorEmailChannel(vendorId: string, orgId: string): VendorEmailChannel {
  return {
    vendorId,
    orgId,
    outboundToEmail: null,
    outboundCc: [],
    outboundSubjectTemplate: VENDOR_EMAIL_DEFAULT_SUBJECT,
    outboundBodyTemplate: VENDOR_EMAIL_DEFAULT_BODY,
    inboundFromAllowlist: [],
    isEnabled: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export async function fetchVendorEmailChannel(vendorId: string): Promise<VendorEmailChannel | null> {
  const { data, error } = await fromTable("vendor_email_channels")
    .select(
      "vendor_id, org_id, outbound_to_email, outbound_cc, outbound_subject_template, outbound_body_template, inbound_from_allowlist, is_enabled, created_at, updated_at",
    )
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (error) rpcError("fetchVendorEmailChannel", error);
  return data ? mapChannel(data as ChannelRow) : null;
}

export async function fetchVendorEmailTemplates(
  vendorId: string,
): Promise<VendorEmailInboundTemplate[]> {
  const { data, error } = await fromTable("vendor_email_inbound_templates")
    .select(
      "id, vendor_id, org_id, event_type, subject_pattern, body_pattern, sample_body, created_at, updated_at",
    )
    .eq("vendor_id", vendorId)
    .order("event_type", { ascending: true });
  if (error) rpcError("fetchVendorEmailTemplates", error);
  return ((data ?? []) as TemplateRow[]).map(mapTemplate);
}

export async function saveVendorEmailChannel(input: VendorEmailSaveInput): Promise<VendorEmailChannel> {
  const orgId = await requireOrgId();
  const email = input.outboundToEmail.trim();
  if (input.isEnabled && (email.length < 3 || !email.includes("@"))) {
    throw new Error("Podaj prawidłowy adres e-mail, zanim włączysz most.");
  }

  const channel: VendorDispatchChannel = input.isEnabled ? "email" : "in_app";
  const { error: vendorErr } = await supabase
    .from("vendor_partners")
    .update({
      dispatch_channel: channel,
      has_system_access: !input.isEnabled,
      contact_email: email || null,
    } as never)
    .eq("id", input.vendorId);
  if (vendorErr) rpcError("saveVendorEmailChannel.vendor", vendorErr);

  const { data, error } = await fromTable("vendor_email_channels")
    .upsert(
      {
        vendor_id: input.vendorId,
        org_id: orgId,
        outbound_to_email: email || null,
        outbound_cc: input.outboundCc,
        outbound_subject_template: input.outboundSubjectTemplate.trim(),
        outbound_body_template: input.outboundBodyTemplate.trim(),
        inbound_from_allowlist: input.inboundFromAllowlist,
        is_enabled: input.isEnabled,
      },
      { onConflict: "vendor_id" },
    )
    .select(
      "vendor_id, org_id, outbound_to_email, outbound_cc, outbound_subject_template, outbound_body_template, inbound_from_allowlist, is_enabled, created_at, updated_at",
    )
    .single();
  if (error) rpcError("saveVendorEmailChannel.channel", error);
  return mapChannel(data as ChannelRow);
}

export async function saveVendorEmailTemplate(
  input: VendorEmailTemplateSaveInput,
): Promise<VendorEmailInboundTemplate> {
  const orgId = await requireOrgId();
  const body = input.bodyPattern.trim();
  if (!body) throw new Error("Wzorzec treści nie może być pusty.");

  const { data, error } = await fromTable("vendor_email_inbound_templates")
    .upsert(
      {
        vendor_id: input.vendorId,
        org_id: orgId,
        event_type: input.eventType,
        subject_pattern: input.subjectPattern?.trim() || null,
        body_pattern: body,
        sample_body: input.sampleBody?.trim() || null,
      },
      { onConflict: "vendor_id,event_type" },
    )
    .select(
      "id, vendor_id, org_id, event_type, subject_pattern, body_pattern, sample_body, created_at, updated_at",
    )
    .single();
  if (error) rpcError("saveVendorEmailTemplate", error);
  return mapTemplate(data as TemplateRow);
}

export async function fetchUnmatchedVendorEmails(): Promise<VendorEmailInboundEvent[]> {
  const orgId = await requireOrgId();
  const { data, error } = await fromTable("vendor_email_inbound_events")
    .select(
      "id, org_id, vendor_id, issue_id, dispatch_id, message_id, from_address, to_address, subject, body_text, matched_event_type, extracted, match_method, status, error_detail, raw_payload, created_at",
    )
    .eq("org_id", orgId)
    .in("status", ["unmatched", "received"])
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) rpcError("fetchUnmatchedVendorEmails", error);
  return ((data ?? []) as InboundEventRow[]).map(mapInboundEvent);
}

export function splitCsv(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
