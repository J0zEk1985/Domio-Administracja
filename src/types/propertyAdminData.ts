import type { Json } from "@/types/supabase";

export const PROPERTY_ADMIN_DATA_VERSION = 1 as const;

/** UUID tokens on `cleaning_locations` for guest portals (database columns, not `visibility_config`). */
export type PropertyLocationPortalTokens = {
  boardPortalToken: string;
  publicReportToken: string;
};

export type CommunityBoardMember = {
  id: string;
  fullName: string;
  email?: string;
  phone: string;
};

export type PropertyAccessCodes = {
  intercom?: string;
  keypad?: string;
  gate?: string;
};

export type PropertyAdminData = {
  version: number;
  /** Globalny e-mail do zarządu (wspólnoty). */
  boardEmail?: string;
  finance: {
    usableAreaM2: number | null;
    garageAreaM2: number | null;
    rateUsablePerM2: number | null;
    rateGaragePerM2: number | null;
    contractAmendmentDate: string | null;
  };
  formal: {
    communityName: string;
    nip: string;
    regon: string;
  };
  accessCodes?: PropertyAccessCodes;
  board: CommunityBoardMember[];
  notes: {
    administration: string;
    cleaning: string;
    serwis: string;
  };
};

export function createDefaultPropertyAdminData(): PropertyAdminData {
  return {
    version: PROPERTY_ADMIN_DATA_VERSION,
    boardEmail: "",
    finance: {
      usableAreaM2: null,
      garageAreaM2: null,
      rateUsablePerM2: null,
      rateGaragePerM2: null,
      contractAmendmentDate: null,
    },
    formal: {
      communityName: "",
      nip: "",
      regon: "",
    },
    accessCodes: {
      intercom: "",
      keypad: "",
      gate: "",
    },
    board: [],
    notes: {
      administration: "",
      cleaning: "",
      serwis: "",
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseAccessCodes(v: unknown): NonNullable<PropertyAdminData["accessCodes"]> {
  const base = { intercom: "", keypad: "", gate: "" };
  if (!isRecord(v)) return base;
  return {
    intercom: typeof v.intercom === "string" ? v.intercom : "",
    keypad: typeof v.keypad === "string" ? v.keypad : "",
    gate: typeof v.gate === "string" ? v.gate : "",
  };
}

function parseBoard(v: unknown): CommunityBoardMember[] {
  if (!Array.isArray(v)) return [];
  const out: CommunityBoardMember[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const id =
      typeof item.id === "string" && item.id ? item.id : `board-${Math.random().toString(36).slice(2, 11)}`;
    out.push({
      id,
      fullName: typeof item.fullName === "string" ? item.fullName : "",
      email: typeof item.email === "string" ? item.email : "",
      phone: typeof item.phone === "string" ? item.phone : "",
    });
  }
  return out;
}

/**
 * Reads `admin_data` from `visibility_config` and merges with column fallbacks (e.g. square_meters).
 */
export function parsePropertyAdminData(
  visibilityConfig: Json | null | undefined,
  squareMetersColumn: number | null | undefined,
): PropertyAdminData {
  const base = createDefaultPropertyAdminData();
  if (!isRecord(visibilityConfig)) {
    if (squareMetersColumn != null && Number.isFinite(squareMetersColumn)) {
      base.finance.usableAreaM2 = squareMetersColumn;
    }
    return base;
  }

  const raw = visibilityConfig.admin_data;
  if (!isRecord(raw)) {
    if (squareMetersColumn != null && Number.isFinite(squareMetersColumn)) {
      base.finance.usableAreaM2 = squareMetersColumn;
    }
    return base;
  }

  const ver = parseNumber(raw.version);
  base.version = ver != null && ver >= 1 ? Math.floor(ver) : PROPERTY_ADMIN_DATA_VERSION;

  base.boardEmail = typeof raw.boardEmail === "string" ? raw.boardEmail : "";

  const fin = isRecord(raw.finance) ? raw.finance : {};
  base.finance.usableAreaM2 = parseNumber(fin.usableAreaM2) ?? (squareMetersColumn != null ? squareMetersColumn : null);
  base.finance.garageAreaM2 = parseNumber(fin.garageAreaM2);
  base.finance.rateUsablePerM2 = parseNumber(fin.rateUsablePerM2);
  base.finance.rateGaragePerM2 = parseNumber(fin.rateGaragePerM2);
  base.finance.contractAmendmentDate =
    typeof fin.contractAmendmentDate === "string" && fin.contractAmendmentDate ? fin.contractAmendmentDate : null;

  const form = isRecord(raw.formal) ? raw.formal : {};
  base.formal.communityName = typeof form.communityName === "string" ? form.communityName : "";
  base.formal.nip = typeof form.nip === "string" ? form.nip : "";
  base.formal.regon = typeof form.regon === "string" ? form.regon : "";

  base.accessCodes = parseAccessCodes(raw.accessCodes);

  base.board = parseBoard(raw.board);

  const notes = isRecord(raw.notes) ? raw.notes : {};
  base.notes.administration = typeof notes.administration === "string" ? notes.administration : "";
  base.notes.cleaning = typeof notes.cleaning === "string" ? notes.cleaning : "";
  base.notes.serwis = typeof notes.serwis === "string" ? notes.serwis : "";

  return base;
}

export function mergeVisibilityConfigWithAdminData(
  existing: Json | null | undefined,
  adminData: PropertyAdminData,
): Json {
  const prev =
    existing !== null &&
    existing !== undefined &&
    typeof existing === "object" &&
    !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  prev.admin_data = adminData as unknown as Record<string, unknown>;
  return prev as Json;
}

/** Pusty lub poprawny format e-mail (prosta walidacja UI). */
export function isValidOptionalEmail(value: string): boolean {
  const t = value.trim();
  if (t === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/** Net contract value from finance fields (PLN, informational). */
export function computeContractNetPln(data: PropertyAdminData["finance"]): number {
  const u = data.usableAreaM2 ?? 0;
  const g = data.garageAreaM2 ?? 0;
  const ru = data.rateUsablePerM2 ?? 0;
  const rg = data.rateGaragePerM2 ?? 0;
  return u * ru + g * rg;
}
