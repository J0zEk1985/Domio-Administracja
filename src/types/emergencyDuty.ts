/** Dispatch flags on property_issues. Not values of issue_status_enum. */
export interface PropertyIssueDutyFields {
  immediate_fulfillment: boolean;
  emergency_mode: boolean;
  emergency_vendor_id: string | null;
  emergency_trade_code: string | null;
}

export type DutyAlertStatus = "pending" | "accepted" | "exhausted" | "cancelled";

export const EMERGENCY_TRADES = [
  { code: "pogotowie_techniczne", label: "Pogotowie techniczne" },
  { code: "elektryczna", label: "Elektryczna" },
  { code: "hydrauliczna", label: "Hydrauliczna" },
  { code: "domofony", label: "Domofony" },
  { code: "slusarska", label: "Ślusarska" },
  { code: "sprzatanie", label: "Sprzątanie" },
  { code: "wezly_cieplne", label: "Węzły cieplne" },
  { code: "kotlownie", label: "Kotłownie" },
  { code: "piece_gazowe", label: "Piece gazowe" },
  { code: "ogolnobudowlana", label: "Ogólnobudowlana" },
] as const;

export type EmergencyTradeCode = (typeof EMERGENCY_TRADES)[number]["code"];

export interface CommunityEmergencyProvider {
  id: string;
  org_id: string;
  community_id: string;
  location_id: string | null;
  trade_code: EmergencyTradeCode | string;
  trade_category: string;
  vendor_partner_id: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Manual Home contact board row. Not joined to vendor_partners. */
export interface CommunityContactBoardEntry {
  id: string;
  org_id: string;
  community_id: string;
  label: string;
  phone: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface VendorEmergencyFields {
  is_emergency_24h: boolean;
  trade_categories: string[];
}
