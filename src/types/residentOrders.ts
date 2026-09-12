/**
 * Resident catalog orders (keys, remotes, fobs).
 * Catalog starts empty — administration CRUD-s items per community.
 */

export type ResidentOrderPriceKind = "exact" | "approximate";

export type ResidentOrderStatus =
  | "pending"
  | "stock_delivery"
  | "delivered"
  | "ordered_offline"
  | "dispatch_queued"
  | "dispatch_sent"
  | "dispatch_failed"
  | "cancelled";

export type ResidentOrderEventType =
  | "created"
  | "stock_assigned"
  | "handover_completed"
  | "ordered_offline"
  | "company_changed"
  | "dispatch_queued"
  | "dispatch_sent"
  | "dispatch_failed"
  | "cancelled";

export interface ResidentOrderCatalogItem {
  id: string;
  orgId: string;
  communityId: string;
  name: string;
  description: string | null;
  priceAmount: number | null;
  priceKind: ResidentOrderPriceKind | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  locationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResidentOrderSettings {
  communityId: string;
  orgId: string;
  defaultCompanyId: string | null;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ResidentOrder {
  id: string;
  orgId: string;
  communityId: string;
  locationId: string;
  unitNumber: string | null;
  residentUserId: string;
  catalogItemId: string | null;
  itemName: string;
  itemPriceAmount: number | null;
  itemPriceKind: ResidentOrderPriceKind | null;
  quantity: number;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  status: ResidentOrderStatus;
  fulfillmentCompanyId: string | null;
  handedOverAt: string | null;
  handedOverBy: string | null;
  handoverPhotoUrls: string[];
  dispatchedAt: string | null;
  dispatchError: string | null;
  createdAt: string;
  updatedAt: string;
  residentFullName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  companyName?: string | null;
}

export interface ResidentOrderEvent {
  id: string;
  orderId: string;
  actorId: string | null;
  eventType: ResidentOrderEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ResidentOrderEmailPayload {
  orderId: string;
  toEmail: string;
  toName: string;
  subjectTemplate: string;
  bodyTemplate: string;
  variables: Record<string, string>;
}

export const RESIDENT_ORDER_STATUS_LABEL: Record<ResidentOrderStatus, string> = {
  pending: "Nowe",
  stock_delivery: "Do przekazania",
  delivered: "Przekazane",
  ordered_offline: "Zamówione poza systemem",
  dispatch_queued: "Wysyłka do kontrahenta",
  dispatch_sent: "Wysłane do kontrahenta",
  dispatch_failed: "Błąd wysyłki",
  cancelled: "Anulowane",
};

export const RESIDENT_ORDER_EVENT_LABEL: Record<ResidentOrderEventType, string> = {
  created: "Złożono zamówienie",
  stock_assigned: "Realizacja ze stanu",
  handover_completed: "Przekazano mieszkańcowi",
  ordered_offline: "Zamówiono poza systemem",
  company_changed: "Zmieniono podmiot realizacji",
  dispatch_queued: "Zlecono wysyłkę e-mail",
  dispatch_sent: "E-mail wysłany",
  dispatch_failed: "Błąd wysyłki e-mail",
  cancelled: "Anulowano",
};

export const RESIDENT_ORDER_TEMPLATE_PLACEHOLDERS = [
  "{{org.name}}",
  "{{org.nip}}",
  "{{org.address}}",
  "{{org.support_email}}",
  "{{community.name}}",
  "{{community.legal_name}}",
  "{{community.nip}}",
  "{{community.board_email}}",
  "{{building.name}}",
  "{{building.address}}",
  "{{unit.number}}",
  "{{resident.full_name}}",
  "{{resident.email}}",
  "{{resident.phone}}",
  "{{order.contact_name}}",
  "{{order.contact_phone}}",
  "{{order.contact_email}}",
  "{{order.id}}",
  "{{order.notes}}",
  "{{order.quantity}}",
  "{{order.created_at}}",
  "{{item.name}}",
  "{{item.description}}",
  "{{item.price_label}}",
] as const;

export function formatResidentOrderPrice(
  amount: number | null,
  kind: ResidentOrderPriceKind | null,
): string | null {
  if (amount == null) return null;
  const formatted = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(amount);
  return kind === "approximate" ? `ok. ${formatted}` : formatted;
}
