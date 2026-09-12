/**
 * Partner Cleaning SOP (read-only) vs community/building contract PDF.
 * Writes for the contract pointer go through SECURITY DEFINER RPCs.
 */

export type CleaningFrequencyType =
  | "daily"
  | "work_days"
  | "specific_days"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "custom";

export interface CleaningFrequencyConfig {
  type: CleaningFrequencyType;
  days?: number[];
  text?: string;
}

export interface PartnerCleaningScopeItem {
  sectionId: string | null;
  sectionName: string | null;
  sectionIsActive: boolean;
  sectionSortOrder: number;
  checklistId: string | null;
  checklistName: string | null;
  frequency: string | null;
  frequencyConfig: CleaningFrequencyConfig | null;
  baselineDate: string | null;
  requiresPhoto: boolean;
  isActive: boolean;
}

export interface PartnerCleaningWorkScope {
  cleaningOrgId: string;
  cleaningOrgName: string;
  partnerLegalEntityId: string | null;
  cleaningLocationId: string;
  hasActiveMandate: boolean;
  hasActiveCooperation: boolean;
  items: PartnerCleaningScopeItem[];
}

export type CleaningScopeDocumentSource = "explicit" | "location" | "community" | "none";

export interface CleaningScopeDocument {
  contractId: string | null;
  contractNumber: string | null;
  contractType: string | null;
  companyName: string | null;
  documentUrl: string | null;
  source: CleaningScopeDocumentSource;
}
