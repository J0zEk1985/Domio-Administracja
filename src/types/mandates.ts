/**
 * DOMIO ecosystem mandates, cooperation links, and succession (Warstwa 1).
 * Writes go through SECURITY DEFINER RPCs — do not insert these rows from the client.
 */

export type DomioModule = "admin" | "cleaning" | "maintenance";

export type MandateRole =
  | "primary_operator"
  | "co_operator"
  | "legacy_operator"
  | "external_designee";

export type MandateStatus =
  | "invited"
  | "active"
  | "paused"
  | "superseded"
  | "declined";

export type CooperationLinkStatus = "active" | "paused";

export type SuccessionMode =
  | "share_read"
  | "clone_to_successor"
  | "transfer_custody";

export type SuccessionStatus =
  | "proposed"
  | "accepted"
  | "completed"
  | "rejected"
  | "cancelled";

export type SuccessionResource =
  | "issues"
  | "inspections"
  | "unit_inspections"
  | "contracts"
  | "residents"
  | "all";

export type SuccessionGrantAccess = "read" | "write";

export interface ServiceMandate {
  id: string;
  communityLegalEntityId: string;
  locationMasterId: string | null;
  orgId: string | null;
  partnerLegalEntityId: string;
  module: DomioModule;
  role: MandateRole;
  status: MandateStatus;
  validFrom: string;
  validUntil: string | null;
  appointedByOrgId: string | null;
  acceptedByOrgId: string | null;
  acceptedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  revokedByOrgId: string | null;
  revokedAt: string | null;
}

export interface BuildingCooperationLink {
  id: string;
  locationMasterId: string;
  adminOrgId: string;
  cleaningOrgId: string | null;
  maintenanceOrgId: string | null;
  cleaningIssuesToSerwis: boolean;
  skipAdminTriage: boolean;
  status: CooperationLinkStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SuccessionEvent {
  id: string;
  communityLegalEntityId: string;
  locationMasterId: string | null;
  fromOrgId: string;
  toOrgId: string | null;
  toLegalEntityId: string;
  mode: SuccessionMode;
  status: SuccessionStatus;
  resourceScope: SuccessionResource[];
  acceptedByFromOrgAt: string | null;
  acceptedByToOrgAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuccessionShareGrant {
  id: string;
  successionId: string;
  granteeOrgId: string;
  resourceType: SuccessionResource;
  locationMasterId: string;
  access: SuccessionGrantAccess;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string;
}

/** Denormalized ACL on operational rows. RLS (Warstwa 2) uses this, not JOINs. */
export type SharedAclColumns = {
  locationMasterId: string | null;
  originOrgId: string | null;
  sharedWithOrgIds: string[];
};

export const MANDATE_STATUS_TRANSITIONS: Record<MandateStatus, MandateStatus[]> = {
  invited: ["active", "declined"],
  active: ["paused", "superseded"],
  paused: ["active", "superseded"],
  superseded: [],
  declined: [],
};

export const SUCCESSION_STATUS_TRANSITIONS: Record<
  SuccessionStatus,
  SuccessionStatus[]
> = {
  proposed: ["accepted", "rejected", "cancelled"],
  accepted: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};
