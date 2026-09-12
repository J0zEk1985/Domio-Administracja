import { supabase } from "@/lib/supabase";
import {
  asBool,
  asString,
  asStringOrNull,
  mapCooperationLink,
  mapServiceMandate,
  mapSuccessionEvent,
} from "@/lib/mandateMappers";
import type {
  BuildingCooperationLink,
  DomioModule,
  MandateRole,
  ServiceMandate,
  SuccessionEvent,
  SuccessionMode,
  SuccessionResource,
} from "@/types/mandates";

export {
  mapCooperationLink,
  mapServiceMandate,
  mapSuccessionEvent,
  MANDATE_MODULE_LABEL,
  MANDATE_ROLE_LABEL,
  MANDATE_STATUS_LABEL,
  SUCCESSION_MODE_LABEL,
  SUCCESSION_STATUS_LABEL,
} from "@/lib/mandateMappers";

export class MandateApiError extends Error {
  readonly code: string;
  constructor(code: string, fallback: string) {
    super(mandateErrorMessage(code, fallback));
    this.name = "MandateApiError";
    this.code = code;
  }
}

function mandateErrorMessage(code: string, fallback: string): string {
  const map: Record<string, string> = {
    MANDATE_FORBIDDEN: "Brak uprawnień do tej operacji mandatu.",
    MANDATE_AUTH_REQUIRED: "Wymagane zalogowanie.",
    MANDATE_NOT_FOUND: "Nie znaleziono mandatu.",
    MANDATE_ADMIN_REQUIRED: "Wymagany aktywny mandat administracji.",
    MANDATE_PRIMARY_EXISTS: "Na tej wspólnocie jest już główny zarządca DOMIO.",
    MANDATE_NO_PRIMARY_ADMIN: "Najpierw musi istnieć główny mandat administracji.",
    MANDATE_ORG_REQUIRED: "Wskaż organizację DOMIO albo podmiot spoza systemu.",
    MANDATE_COMMUNITY_NOT_FOUND: "Nie znaleziono wspólnoty w rejestrze.",
    MANDATE_PARTNER_NOT_FOUND: "Nie znaleziono podmiotu prawnego.",
    MANDATE_ACCEPTANCE_REQUIRED: "Mandat wymaga akceptacji drugiej strony.",
    ILLEGAL_STATUS_TRANSITION: "Niedozwolone przejście statusu.",
    COOP_CLEANING_MANDATE_INACTIVE: "Firma sprzątająca nie ma aktywnego mandatu Cleaning.",
    COOP_CLEANING_NOT_ENROLLED: "Firma sprzątająca nie ma dopiętego tego adresu w Cleaning.",
    COOP_MAINTENANCE_MANDATE_INACTIVE: "Firma serwisowa nie ma aktywnego mandatu Serwis.",
    COOP_MAINTENANCE_NOT_ENROLLED: "Firma serwisowa nie ma dopiętego tego adresu w Serwis.",
    SUCCESSION_FORBIDDEN: "Brak uprawnień do sukcesji.",
    SUCCESSION_NOT_FOUND: "Nie znaleziono procesu sukcesji.",
    SUCCESSION_PARTNER_NOT_FOUND: "Nie znaleziono podmiotu następcy.",
  };
  const key = Object.keys(map).find((k) => code.includes(k));
  return key ? map[key] : fallback;
}

function throwRpc(error: { message?: string } | null, fallback: string): never {
  const msg = error?.message ?? fallback;
  console.error("[mandateApi]", msg);
  throw new MandateApiError(msg, fallback);
}

export type LocationModulePresence = {
  orgId: string;
  orgName: string;
  partnerLegalEntityId: string | null;
  isCleaning: boolean;
  isMaintenance: boolean;
  isAdmin: boolean;
};

export type LegalEntityOrgMatch = {
  orgId: string;
  orgName: string;
  isAdmin: boolean;
  isCleaning: boolean;
  isMaintenance: boolean;
};

export async function resolveOrgsForLegalEntity(
  legalEntityId: string,
): Promise<LegalEntityOrgMatch[]> {
  const { data, error } = await supabase.rpc("resolve_orgs_for_legal_entity", {
    p_legal_entity_id: legalEntityId,
  });
  if (error) throwRpc(error, "Nie udało się odnaleźć organizacji następcy.");
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      orgId: asString(r.org_id),
      orgName: asString(r.org_name),
      isAdmin: asBool(r.is_admin),
      isCleaning: asBool(r.is_cleaning),
      isMaintenance: asBool(r.is_maintenance),
    };
  });
}

export async function fetchOrgAdminLegalEntityId(orgId: string): Promise<string | null> {
  const { data, error } = await (
    supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string | boolean) => {
            eq: (column: string, value: string | boolean) => {
              eq: (column: string, value: string) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: Record<string, unknown> | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    }
  )
    .from("org_legal_entity_enrollments")
    .select("legal_entity_id")
    .eq("org_id", orgId)
    .eq("is_admin", true)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[mandateApi] org_legal_entity_enrollments:", error);
    throwRpc(error, "Nie udało się wczytać NIP organizacji.");
  }
  const id = data?.legal_entity_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function listLocationModulePresence(
  locationMasterId: string,
): Promise<LocationModulePresence[]> {
  const { data, error } = await supabase.rpc("list_location_module_presence", {
    p_location_master_id: locationMasterId,
  });
  if (error) throwRpc(error, "Nie udało się wczytać firm na adresie.");
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      orgId: asString(r.org_id),
      orgName: asString(r.org_name),
      partnerLegalEntityId: asStringOrNull(r.partner_legal_entity_id),
      isCleaning: asBool(r.is_cleaning),
      isMaintenance: asBool(r.is_maintenance),
      isAdmin: asBool(r.is_admin),
    };
  });
}

export async function listServiceMandates(communityLegalEntityId: string): Promise<ServiceMandate[]> {
  const { data, error } = await supabase
    .from("service_mandates")
    .select("*")
    .eq("community_legal_entity_id", communityLegalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwRpc(error, "Nie udało się wczytać mandatów.");
  return (data ?? []).map((row) => mapServiceMandate(row as Record<string, unknown>));
}

export async function listCooperationLinks(
  locationMasterId: string,
): Promise<BuildingCooperationLink[]> {
  const { data, error } = await supabase
    .from("building_cooperation_links")
    .select("*")
    .eq("location_master_id", locationMasterId)
    .order("created_at", { ascending: false });
  if (error) throwRpc(error, "Nie udało się wczytać powiązań ekosystemu.");
  return (data ?? []).map((row) => mapCooperationLink(row as Record<string, unknown>));
}

export async function listSuccessionEvents(
  communityLegalEntityId: string,
): Promise<SuccessionEvent[]> {
  const { data, error } = await supabase
    .from("succession_events")
    .select("*")
    .eq("community_legal_entity_id", communityLegalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwRpc(error, "Nie udało się wczytać sukcesji.");
  return (data ?? []).map((row) => mapSuccessionEvent(row as Record<string, unknown>));
}

async function rpcMandate<T>(
  name: string,
  args: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throwRpc(error, fallback);
  return data as T;
}

export async function inviteServiceMandate(args: {
  actingOrgId: string;
  communityLegalEntityId: string;
  locationMasterId: string | null;
  partnerOrgId: string | null;
  partnerLegalEntityId: string;
  module: DomioModule;
  role: MandateRole;
}): Promise<ServiceMandate> {
  const data = await rpcMandate<Record<string, unknown>>(
    "invite_service_mandate",
    {
      p_acting_org_id: args.actingOrgId,
      p_community_legal_entity_id: args.communityLegalEntityId,
      p_location_master_id: args.locationMasterId,
      p_partner_org_id: args.partnerOrgId,
      p_partner_legal_entity_id: args.partnerLegalEntityId,
      p_module: args.module,
      p_role: args.role,
    },
    "Nie udało się utworzyć mandatu.",
  );
  return mapServiceMandate(data);
}

export async function acceptServiceMandate(actingOrgId: string, mandateId: string) {
  const data = await rpcMandate<Record<string, unknown>>(
    "accept_service_mandate",
    { p_acting_org_id: actingOrgId, p_mandate_id: mandateId },
    "Nie udało się zaakceptować mandatu.",
  );
  return mapServiceMandate(data);
}

export async function declineServiceMandate(actingOrgId: string, mandateId: string) {
  const data = await rpcMandate<Record<string, unknown>>(
    "decline_service_mandate",
    { p_acting_org_id: actingOrgId, p_mandate_id: mandateId },
    "Nie udało się odrzucić mandatu.",
  );
  return mapServiceMandate(data);
}

export async function revokeServiceMandate(actingOrgId: string, mandateId: string) {
  const data = await rpcMandate<Record<string, unknown>>(
    "revoke_service_mandate",
    { p_acting_org_id: actingOrgId, p_mandate_id: mandateId },
    "Nie udało się zakończyć mandatu.",
  );
  return mapServiceMandate(data);
}

export async function upsertBuildingCooperationLink(args: {
  actingOrgId: string;
  locationMasterId: string;
  communityLegalEntityId: string;
  cleaningOrgId: string | null;
  maintenanceOrgId: string | null;
  cleaningIssuesToSerwis: boolean;
  skipAdminTriage: boolean;
}): Promise<BuildingCooperationLink> {
  const data = await rpcMandate<Record<string, unknown>>(
    "upsert_building_cooperation_link",
    {
      p_acting_org_id: args.actingOrgId,
      p_location_master_id: args.locationMasterId,
      p_community_legal_entity_id: args.communityLegalEntityId,
      p_cleaning_org_id: args.cleaningOrgId,
      p_maintenance_org_id: args.maintenanceOrgId,
      p_cleaning_issues_to_serwis: args.cleaningIssuesToSerwis,
      p_skip_admin_triage: args.skipAdminTriage,
    },
    "Nie udało się zapisać kooperacji.",
  );
  return mapCooperationLink(data);
}

export async function proposeSuccession(args: {
  actingOrgId: string;
  communityLegalEntityId: string;
  locationMasterId: string | null;
  toOrgId: string | null;
  toLegalEntityId: string;
  mode: SuccessionMode;
}): Promise<SuccessionEvent> {
  const data = await rpcMandate<Record<string, unknown>>(
    "propose_succession",
    {
      p_acting_org_id: args.actingOrgId,
      p_community_legal_entity_id: args.communityLegalEntityId,
      p_location_master_id: args.locationMasterId,
      p_to_org_id: args.toOrgId,
      p_to_legal_entity_id: args.toLegalEntityId,
      p_mode: args.mode,
      p_resource_scope: ["all"] as SuccessionResource[],
    },
    "Nie udało się rozpocząć sukcesji.",
  );
  return mapSuccessionEvent(data);
}

export async function acceptSuccession(actingOrgId: string, successionId: string) {
  const data = await rpcMandate<Record<string, unknown>>(
    "accept_succession",
    { p_acting_org_id: actingOrgId, p_succession_id: successionId },
    "Nie udało się zaakceptować sukcesji.",
  );
  return mapSuccessionEvent(data);
}

export async function completeSuccession(actingOrgId: string, successionId: string) {
  const data = await rpcMandate<Record<string, unknown>>(
    "complete_succession",
    { p_acting_org_id: actingOrgId, p_succession_id: successionId },
    "Nie udało się zakończyć sukcesji.",
  );
  return mapSuccessionEvent(data);
}

export async function cancelSuccession(actingOrgId: string, successionId: string) {
  const data = await rpcMandate<Record<string, unknown>>(
    "cancel_succession",
    { p_acting_org_id: actingOrgId, p_succession_id: successionId },
    "Nie udało się anulować sukcesji.",
  );
  return mapSuccessionEvent(data);
}

export async function rejectSuccession(actingOrgId: string, successionId: string) {
  const data = await rpcMandate<Record<string, unknown>>(
    "reject_succession",
    { p_acting_org_id: actingOrgId, p_succession_id: successionId },
    "Nie udało się odrzucić sukcesji.",
  );
  return mapSuccessionEvent(data);
}
