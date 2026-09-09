import { supabase } from "@/lib/supabase";
import {
  legalEntityErrorMessage,
  type AddressOwner,
  type LegalEntityKind,
} from "@/lib/legalEntityMessages";

export type { AddressOwner, LegalEntityKind };

export class LegalEntityApiError extends Error {
  readonly code: string;
  readonly owner: AddressOwner | null;

  constructor(code: string, owner?: AddressOwner | null) {
    super(legalEntityErrorMessage(code, owner));
    this.name = "LegalEntityApiError";
    this.code = code;
    this.owner = owner ?? null;
  }
}

export type LegalEntityPublic = {
  id: string;
  kind: LegalEntityKind;
  status: string;
  nip: string;
  regon: string | null;
  krs: string | null;
  shortName: string;
  legalName: string;
  city: string;
  postalCode: string;
  seatFullAddress: string;
};

export type GusPreview = {
  nip: string;
  regon: string | null;
  krs: string | null;
  legalName: string;
  city: string;
  postalCode: string;
  street: string | null;
  buildingNumber: string | null;
  seatFullAddress: string;
  legalFormName: string | null;
  endedAt: string | null;
};

export type LookupResult = {
  status:
    | "invalid_nip"
    | "exists_in_domio"
    | "not_in_domio"
    | "not_in_gus"
    | "gus_inactive"
    | "found_in_gus";
  entity: LegalEntityPublic | null;
  gusPreview: GusPreview | null;
  suggestedKind?: LegalEntityKind;
  alreadyEnrolledInThisOrg: boolean;
};

export type EnrollBuildingResult = {
  status: "created" | "enrolled" | "duplicate";
  cleaningLocationId: string;
  locationMasterId: string;
  address: string;
  legalEntityId: string | null;
  contractorRecommended: boolean;
};

type FunctionPayload = Record<string, unknown>;

function asRecord(value: unknown): FunctionPayload | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as FunctionPayload;
  }
  return null;
}

function parseOwner(raw: unknown): AddressOwner | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  return {
    ownerNip: typeof rec.ownerNip === "string" ? rec.ownerNip : undefined,
    ownerName: typeof rec.ownerName === "string" ? rec.ownerName : undefined,
  };
}

async function invokeLookup(body: FunctionPayload): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("lookup-legal-entity", {
    body,
  });

  let payload = asRecord(data);
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        payload = asRecord(await context.json()) ?? payload;
      } catch {
        console.error("[legalEntityApi] parse invoke error body failed");
      }
    }
    const code =
      (typeof payload?.error === "string" && payload.error) ||
      (typeof payload?.status === "string" && payload.status) ||
      "RPC_FAILED";
    console.error("[legalEntityApi]", code, error);
    throw new LegalEntityApiError(code, parseOwner(payload?.owner));
  }

  if (payload && typeof payload.error === "string") {
    throw new LegalEntityApiError(payload.error, parseOwner(payload.owner));
  }

  return data;
}

export async function lookupLegalEntity(orgId: string, nip: string): Promise<LookupResult> {
  const data = await invokeLookup({ action: "lookup", orgId, nip });
  const rec = asRecord(data);
  if (!rec) {
    throw new LegalEntityApiError("RPC_FAILED");
  }
  return rec as unknown as LookupResult;
}

export async function enrollLegalEntity(args: {
  orgId: string;
  legalEntityId: string;
  isCleaning?: boolean;
  isMaintenance?: boolean;
  isAdmin?: boolean;
}): Promise<{ entity: LegalEntityPublic }> {
  const data = await invokeLookup({
    action: "enroll",
    orgId: args.orgId,
    legalEntityId: args.legalEntityId,
    isCleaning: args.isCleaning === true,
    isMaintenance: args.isMaintenance === true,
    isAdmin: args.isAdmin === true,
  });
  return data as { entity: LegalEntityPublic };
}

export async function createLegalEntityFromGus(args: {
  orgId: string;
  nip: string;
  kind: LegalEntityKind;
  email: string;
  phone: string;
  shortName?: string;
  isCleaning?: boolean;
  isMaintenance?: boolean;
  isAdmin?: boolean;
}): Promise<{ entity: LegalEntityPublic }> {
  const data = await invokeLookup({
    action: "create",
    orgId: args.orgId,
    nip: args.nip,
    kind: args.kind,
    email: args.email,
    phone: args.phone,
    shortName: args.shortName ?? "",
    isCleaning: args.isCleaning === true,
    isMaintenance: args.isMaintenance === true,
    isAdmin: args.isAdmin === true,
  });
  return data as { entity: LegalEntityPublic };
}

export async function enrollBuilding(args: {
  orgId: string;
  legalEntityId: string | null;
  googlePlaceId: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  module: "cleaning" | "maintenance" | "admin";
}): Promise<EnrollBuildingResult> {
  const data = await invokeLookup({
    action: "enrollBuilding",
    orgId: args.orgId,
    legalEntityId: args.legalEntityId,
    googlePlaceId: args.googlePlaceId,
    address: args.address,
    latitude: args.latitude,
    longitude: args.longitude,
    module: args.module,
  });
  return data as EnrollBuildingResult;
}

function looseDb() {
  return supabase as unknown as {
    from: (relation: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export async function fetchCommunityLegalEntityId(communityId: string): Promise<string | null> {
  const { data, error } = await looseDb()
    .from("communities")
    .select("legal_entity_id")
    .eq("id", communityId)
    .maybeSingle();
  if (error) throw error;
  const id = data?.legal_entity_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function fetchAttachedLegalEntity(
  cleaningLocationId: string,
): Promise<LegalEntityPublic | null> {
  const db = looseDb();
  const loc = await db
    .from("cleaning_locations")
    .select("location_master_id")
    .eq("id", cleaningLocationId)
    .maybeSingle();
  if (loc.error) throw loc.error;
  const masterId = loc.data?.location_master_id;
  if (typeof masterId !== "string" || !masterId) return null;

  const master = await db
    .from("locations")
    .select("legal_entity_id")
    .eq("id", masterId)
    .maybeSingle();
  if (master.error) throw master.error;
  const entityId = master.data?.legal_entity_id;
  if (typeof entityId !== "string" || !entityId) return null;

  const entity = await db
    .from("legal_entities")
    .select("id, short_name, legal_name, nip_normalized, kind, status, regon_normalized, krs_normalized, city, postal_code, seat_full_address")
    .eq("id", entityId)
    .maybeSingle();
  if (entity.error) throw entity.error;
  const row = entity.data;
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    kind: row.kind as LegalEntityKind,
    status: typeof row.status === "string" ? row.status : "active",
    nip: typeof row.nip_normalized === "string" ? row.nip_normalized : "",
    regon: typeof row.regon_normalized === "string" ? row.regon_normalized : null,
    krs: typeof row.krs_normalized === "string" ? row.krs_normalized : null,
    shortName: typeof row.short_name === "string" ? row.short_name : "",
    legalName: typeof row.legal_name === "string" ? row.legal_name : "",
    city: typeof row.city === "string" ? row.city : "",
    postalCode: typeof row.postal_code === "string" ? row.postal_code : "",
    seatFullAddress: typeof row.seat_full_address === "string" ? row.seat_full_address : "",
  };
}

export async function attachLegalEntityToBuilding(args: {
  orgId: string;
  cleaningLocationId: string;
  legalEntityId: string;
}): Promise<{ legalEntityId: string }> {
  const data = await invokeLookup({
    action: "attachBuilding",
    orgId: args.orgId,
    cleaningLocationId: args.cleaningLocationId,
    legalEntityId: args.legalEntityId,
  });
  return data as { legalEntityId: string };
}
