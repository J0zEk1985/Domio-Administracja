import { z } from "zod";

/** Board member row stored in `communities.board_members` JSONB array. */
export const communityBoardMemberSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string(),
});

export type CommunityBoardMemberForm = z.infer<typeof communityBoardMemberSchema>;

export const communityAccessCodesSchema = z
  .object({
    intercom: z.string().optional(),
    keypad: z.string().optional(),
    gate: z.string().optional(),
    legacyText: z.string().optional(),
    legacySingle: z.string().optional(),
  })
  .passthrough();

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

export function parseJsonToAccessCodes(raw: unknown): CommunityAccessCodesForm {
  const p = communityAccessCodesSchema.safeParse(raw);
  return p.success ? p.data : {};
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
