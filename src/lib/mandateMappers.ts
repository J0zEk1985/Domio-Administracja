import type {
  BuildingCooperationLink,
  CooperationLinkStatus,
  DomioModule,
  MandateRole,
  MandateStatus,
  ServiceMandate,
  SuccessionEvent,
  SuccessionMode,
  SuccessionResource,
  SuccessionStatus,
} from "@/types/mandates";

export function asString(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

export function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

export function asBool(v: unknown): boolean {
  return v === true;
}

export function mapServiceMandate(row: Record<string, unknown>): ServiceMandate {
  return {
    id: asString(row.id),
    communityLegalEntityId: asString(row.community_legal_entity_id),
    locationMasterId: asStringOrNull(row.location_master_id),
    orgId: asStringOrNull(row.org_id),
    partnerLegalEntityId: asString(row.partner_legal_entity_id),
    module: asString(row.module) as DomioModule,
    role: asString(row.role) as MandateRole,
    status: asString(row.status) as MandateStatus,
    validFrom: asString(row.valid_from),
    validUntil: asStringOrNull(row.valid_until),
    appointedByOrgId: asStringOrNull(row.appointed_by_org_id),
    acceptedByOrgId: asStringOrNull(row.accepted_by_org_id),
    acceptedAt: asStringOrNull(row.accepted_at),
    notes: asStringOrNull(row.notes),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    revokedByOrgId: asStringOrNull(row.revoked_by_org_id),
    revokedAt: asStringOrNull(row.revoked_at),
  };
}

export function mapCooperationLink(row: Record<string, unknown>): BuildingCooperationLink {
  return {
    id: asString(row.id),
    locationMasterId: asString(row.location_master_id),
    adminOrgId: asString(row.admin_org_id),
    cleaningOrgId: asStringOrNull(row.cleaning_org_id),
    maintenanceOrgId: asStringOrNull(row.maintenance_org_id),
    cleaningIssuesToSerwis: asBool(row.cleaning_issues_to_serwis),
    skipAdminTriage: asBool(row.skip_admin_triage),
    status: asString(row.status) as CooperationLinkStatus,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export function mapSuccessionEvent(row: Record<string, unknown>): SuccessionEvent {
  const scope = Array.isArray(row.resource_scope)
    ? (row.resource_scope as SuccessionResource[])
    : (["all"] as SuccessionResource[]);
  return {
    id: asString(row.id),
    communityLegalEntityId: asString(row.community_legal_entity_id),
    locationMasterId: asStringOrNull(row.location_master_id),
    fromOrgId: asString(row.from_org_id),
    toOrgId: asStringOrNull(row.to_org_id),
    toLegalEntityId: asString(row.to_legal_entity_id),
    mode: asString(row.mode) as SuccessionMode,
    status: asString(row.status) as SuccessionStatus,
    resourceScope: scope,
    acceptedByFromOrgAt: asStringOrNull(row.accepted_by_from_org_at),
    acceptedByToOrgAt: asStringOrNull(row.accepted_by_to_org_at),
    completedAt: asStringOrNull(row.completed_at),
    notes: asStringOrNull(row.notes),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export const MANDATE_ROLE_LABEL: Record<MandateRole, string> = {
  primary_operator: "Główny operator",
  co_operator: "Współoperator",
  legacy_operator: "Poprzedni operator",
  external_designee: "Podmiot poza DOMIO",
};

export const MANDATE_STATUS_LABEL: Record<MandateStatus, string> = {
  invited: "Zaproszenie",
  active: "Aktywny",
  paused: "Wstrzymany",
  superseded: "Zakończony",
  declined: "Odrzucony",
};

export const MANDATE_MODULE_LABEL: Record<DomioModule, string> = {
  admin: "Administracja",
  cleaning: "Cleaning",
  maintenance: "Serwis",
};

export const SUCCESSION_MODE_LABEL: Record<SuccessionMode, string> = {
  share_read: "Udostępnienie (3 mies.)",
  clone_to_successor: "Kopia danych do następcy",
  transfer_custody: "Przeniesienie opiekuna",
};

export const SUCCESSION_STATUS_LABEL: Record<SuccessionStatus, string> = {
  proposed: "Oczekuje",
  accepted: "Zaakceptowana",
  completed: "Zakończona",
  rejected: "Odrzucona",
  cancelled: "Anulowana",
};
