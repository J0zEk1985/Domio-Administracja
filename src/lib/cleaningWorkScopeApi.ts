import { supabase } from "@/lib/supabase";
import type {
  CleaningFrequencyConfig,
  CleaningFrequencyType,
  CleaningScopeDocument,
  CleaningScopeDocumentSource,
  PartnerCleaningScopeItem,
  PartnerCleaningWorkScope,
} from "@/types/cleaningWorkScope";

export class CleaningScopeApiError extends Error {
  readonly code: string;
  constructor(code: string, fallback: string) {
    super(cleaningScopeErrorMessage(code, fallback));
    this.name = "CleaningScopeApiError";
    this.code = code;
  }
}

function cleaningScopeErrorMessage(code: string, fallback: string): string {
  const map: Record<string, string> = {
    CLEANING_SCOPE_AUTH_REQUIRED: "Wymagane zalogowanie.",
    CLEANING_SCOPE_FORBIDDEN: "Brak uprawnień do podglądu zakresu prac Cleaning.",
    CLEANING_SCOPE_NO_PARTNER: "Brak powiązanej firmy Cleaning na tym budynku.",
    CLEANING_SCOPE_CONTRACT_INVALID:
      "Wybrana umowa nie należy do tej wspólnoty albo nie ma załączonego dokumentu.",
  };
  const key = Object.keys(map).find((k) => code.includes(k));
  return key ? map[key] : fallback;
}

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function rpcClient(): RpcClient {
  return supabase as unknown as RpcClient;
}

function throwRpc(error: { message?: string } | null, fallback: string): never {
  const msg = error?.message ?? fallback;
  console.error("[cleaningWorkScopeApi]", msg);
  throw new CleaningScopeApiError(msg, fallback);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asInt(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const FREQUENCY_TYPES: readonly CleaningFrequencyType[] = [
  "daily",
  "work_days",
  "specific_days",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "custom",
];

function parseFrequencyConfig(value: unknown): CleaningFrequencyConfig | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.type !== "string") return null;
  const type = FREQUENCY_TYPES.find((t) => t === rec.type);
  if (!type) return null;
  return {
    type,
    days: Array.isArray(rec.days)
      ? rec.days.filter((day): day is number => typeof day === "number")
      : undefined,
    text: typeof rec.text === "string" ? rec.text : undefined,
  };
}

const DOCUMENT_SOURCES: readonly CleaningScopeDocumentSource[] = [
  "explicit",
  "location",
  "community",
  "none",
];

function mapDocument(row: Record<string, unknown> | null): CleaningScopeDocument {
  const sourceRaw = asStringOrNull(row?.source);
  const source = DOCUMENT_SOURCES.find((s) => s === sourceRaw) ?? "none";
  return {
    contractId: asStringOrNull(row?.contract_id),
    contractNumber: asStringOrNull(row?.contract_number),
    contractType: asStringOrNull(row?.contract_type),
    companyName: asStringOrNull(row?.company_name),
    documentUrl: asStringOrNull(row?.document_url),
    source,
  };
}

function mapScopeItem(row: Record<string, unknown>): PartnerCleaningScopeItem {
  return {
    sectionId: asStringOrNull(row.section_id),
    sectionName: asStringOrNull(row.section_name),
    sectionIsActive: asBool(row.section_is_active),
    sectionSortOrder: asInt(row.section_sort_order),
    checklistId: asStringOrNull(row.checklist_id),
    checklistName: asStringOrNull(row.checklist_name),
    frequency: asStringOrNull(row.frequency),
    frequencyConfig: parseFrequencyConfig(row.frequency_config),
    baselineDate: asStringOrNull(row.baseline_date),
    requiresPhoto: asBool(row.requires_photo),
    isActive: asBool(row.is_active),
  };
}

function mapWorkScope(rows: unknown): PartnerCleaningWorkScope | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = asRecord(rows[0]);
  if (!first) return null;
  const cleaningOrgId = asStringOrNull(first.cleaning_org_id);
  const cleaningLocationId = asStringOrNull(first.cleaning_location_id);
  if (!cleaningOrgId || !cleaningLocationId) return null;

  const items: PartnerCleaningScopeItem[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const item = mapScopeItem(row);
    if (!item.sectionId && !item.checklistId) continue;
    items.push(item);
  }

  return {
    cleaningOrgId,
    cleaningOrgName: asString(first.cleaning_org_name) || cleaningOrgId,
    partnerLegalEntityId: asStringOrNull(first.partner_legal_entity_id),
    cleaningLocationId,
    hasActiveMandate: asBool(first.has_active_mandate),
    hasActiveCooperation: asBool(first.has_active_cooperation),
    items,
  };
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return asRecord(data[0] ?? null);
  return asRecord(data);
}

export function contractHasScopeDocument(documentUrl: string | null | undefined): boolean {
  return (documentUrl ?? "").trim().length > 0;
}

export async function fetchPartnerCleaningWorkScope(
  locationMasterId: string,
): Promise<PartnerCleaningWorkScope | null> {
  const { data, error } = await rpcClient().rpc("get_partner_cleaning_work_scope", {
    p_location_master_id: locationMasterId,
  });
  if (error) {
    if ((error.message ?? "").includes("CLEANING_SCOPE_NO_PARTNER")) {
      return null;
    }
    throwRpc(error, "Nie udało się wczytać zakresu prac Cleaning.");
  }
  return mapWorkScope(data);
}

export async function fetchCleaningScopeDocument(
  adminLocationId: string,
): Promise<CleaningScopeDocument> {
  const { data, error } = await rpcClient().rpc("resolve_cleaning_scope_document", {
    p_admin_location_id: adminLocationId,
  });
  if (error) throwRpc(error, "Nie udało się ustalić dokumentu umowy.");
  return mapDocument(firstRow(data));
}

export async function setBuildingCleaningScopeContract(
  adminLocationId: string,
  contractId: string | null,
): Promise<CleaningScopeDocument> {
  const { data, error } = await rpcClient().rpc("set_building_cleaning_scope_contract", {
    p_admin_location_id: adminLocationId,
    p_contract_id: contractId,
  });
  if (error) throwRpc(error, "Nie udało się zapisać wskazania umowy.");
  return mapDocument(firstRow(data));
}
