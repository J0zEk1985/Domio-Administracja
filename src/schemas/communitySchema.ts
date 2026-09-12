import { z } from "zod";

/** Board member row stored in `communities.board_members` JSONB array. */
export const communityBoardMemberSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string(),
});

export type CommunityBoardMemberForm = z.infer<typeof communityBoardMemberSchema>;

export const ACCESS_CODE_KINDS = ["intercom", "keypad", "gate", "other"] as const;
export type AccessCodeKind = (typeof ACCESS_CODE_KINDS)[number];

export const ACCESS_CODE_KIND_LABELS: Record<AccessCodeKind, string> = {
  intercom: "Domofon",
  keypad: "Szyfrator",
  gate: "Brama",
  other: "Inny",
};

export const communityAccessCodeKindSchema = z.enum(ACCESS_CODE_KINDS);

export const communityAccessCodeEntrySchema = z.object({
  id: z.string().min(1),
  kind: communityAccessCodeKindSchema,
  code: z.string().max(80),
  location: z.string().max(120),
});

export type CommunityAccessCodeEntry = z.infer<typeof communityAccessCodeEntrySchema>;

/** Canonical `communities.access_codes` JSONB: `{ entries: [...] }`. */
export const communityAccessCodesSchema = z.object({
  entries: z.array(communityAccessCodeEntrySchema),
});

export type CommunityAccessCodesForm = z.infer<typeof communityAccessCodesSchema>;

export const communityFinancialDetailsSchema = z
  .object({
    usableAreaM2: z.number().nullable().optional(),
    garageAreaM2: z.number().nullable().optional(),
    rateUsablePerM2: z.number().nullable().optional(),
    rateGaragePerM2: z.number().nullable().optional(),
    contractAmendmentDate: z.string().nullable().optional(),
    billingDetailsLegacy: z.string().nullable().optional(),
  })
  .passthrough();

export type CommunityFinancialDetailsForm = z.infer<typeof communityFinancialDetailsSchema>;

export const communityOperationalNotesSchema = z
  .object({
    administration: z.string().optional(),
    cleaning: z.string().optional(),
    serwis: z.string().optional(),
    adminContactsLegacy: z.unknown().optional(),
  })
  .passthrough();

export type CommunityOperationalNotesForm = z.infer<typeof communityOperationalNotesSchema>;

const optionalEmail = z
  .union([z.string(), z.null()])
  .optional()
  .refine((v) => v == null || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Niepoprawny adres e-mail",
  });

/**
 * Full domain form for `communities` (PropTech pivot — JSONB + text columns).
 */
export const communityDomainFormSchema = z.object({
  name: z.string().min(1, "Wymagana nazwa skrócona"),
  legal_name: z.union([z.string(), z.null()]).optional(),
  nip: z.union([z.string(), z.null()]).optional(),
  regon: z.union([z.string(), z.null()]).optional(),
  board_email: optionalEmail,
  financial_details: communityFinancialDetailsSchema,
  access_codes: communityAccessCodesSchema,
  operational_notes: communityOperationalNotesSchema,
  board_members: z.array(communityBoardMemberSchema),
});

export type CommunityDomainFormValues = z.infer<typeof communityDomainFormSchema>;

export function computeCommunityContractNetPln(f: CommunityFinancialDetailsForm): number {
  const u = f.usableAreaM2 ?? 0;
  const g = f.garageAreaM2 ?? 0;
  const ru = f.rateUsablePerM2 ?? 0;
  const rg = f.rateGaragePerM2 ?? 0;
  return u * ru + g * rg;
}

export function parseJsonToFinancialDetails(raw: unknown): CommunityFinancialDetailsForm {
  const p = communityFinancialDetailsSchema.safeParse(raw);
  return p.success ? p.data : {};
}

function trimCode(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAccessCodeEntry(item: unknown): CommunityAccessCodeEntry | null {
  if (!isRecord(item)) return null;
  const kindRaw = item.kind;
  const kind = ACCESS_CODE_KINDS.includes(kindRaw as AccessCodeKind)
    ? (kindRaw as AccessCodeKind)
    : "other";
  const code = trimCode(item.code);
  if (!code) return null;
  const location = typeof item.location === "string" ? item.location.trim() : "";
  const id =
    typeof item.id === "string" && item.id.length > 0 ? item.id : crypto.randomUUID();
  const parsed = communityAccessCodeEntrySchema.safeParse({
    id,
    kind,
    code: code.slice(0, 80),
    location: location.slice(0, 120),
  });
  return parsed.success ? parsed.data : null;
}

function entriesFromLegacyObject(raw: Record<string, unknown>): CommunityAccessCodeEntry[] {
  const entries: CommunityAccessCodeEntry[] = [];
  const push = (kind: AccessCodeKind, value: unknown, id: string) => {
    const code = trimCode(value).slice(0, 80);
    if (!code) return;
    entries.push({ id, kind, code, location: "" });
  };
  push("intercom", raw.intercom, "legacy-intercom");
  push("keypad", raw.keypad, "legacy-keypad");
  push("gate", raw.gate, "legacy-gate");
  if (entries.length > 0) return entries;
  push("other", raw.legacyText, "legacy-text");
  if (entries.length > 0) return entries;
  push("other", raw.legacySingle, "legacy-single");
  return entries;
}

export function parseJsonToAccessCodes(raw: unknown): CommunityAccessCodesForm {
  if (Array.isArray(raw)) {
    return { entries: raw.map(parseAccessCodeEntry).filter((e): e is CommunityAccessCodeEntry => e != null) };
  }
  if (!isRecord(raw)) return { entries: [] };
  if (Array.isArray(raw.entries)) {
    const entries = raw.entries
      .map(parseAccessCodeEntry)
      .filter((e): e is CommunityAccessCodeEntry => e != null);
    if (entries.length > 0) return { entries };
  }
  return { entries: entriesFromLegacyObject(raw) };
}

export function serializeAccessCodesForSave(form: CommunityAccessCodesForm): CommunityAccessCodesForm {
  return {
    entries: form.entries
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        code: entry.code.trim().slice(0, 80),
        location: entry.location.trim().slice(0, 120),
      }))
      .filter((entry) => entry.code.length > 0),
  };
}

export function formatAccessCodeEntry(entry: CommunityAccessCodeEntry): string {
  const label = ACCESS_CODE_KIND_LABELS[entry.kind];
  const location = entry.location.trim();
  const code = entry.code.trim();
  return location ? `${label} (${location}): ${code}` : `${label}: ${code}`;
}

export function formatCommunityAccessCodesDisplay(raw: unknown): string | null {
  const { entries } = parseJsonToAccessCodes(raw);
  if (entries.length === 0) return null;
  return entries.map(formatAccessCodeEntry).join("\n");
}

export function parseJsonToOperationalNotes(raw: unknown): CommunityOperationalNotesForm {
  const p = communityOperationalNotesSchema.safeParse(raw);
  return p.success ? p.data : {};
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseJsonToBoardMembers(raw: unknown): CommunityBoardMemberForm[] {
  if (!Array.isArray(raw)) return [];
  const out: CommunityBoardMemberForm[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const withId = {
      ...item,
      id: typeof item.id === "string" && item.id.length > 0 ? item.id : crypto.randomUUID(),
      fullName: typeof item.fullName === "string" ? item.fullName : "",
      email: typeof item.email === "string" ? item.email : "",
      phone: typeof item.phone === "string" ? item.phone : "",
    };
    const r = communityBoardMemberSchema.safeParse(withId);
    if (r.success) out.push(r.data);
  }
  return out;
}
