import { supabase } from "@/lib/supabase";
import type {
  ResidentOrder,
  ResidentOrderCatalogItem,
  ResidentOrderEmailPayload,
  ResidentOrderEvent,
  ResidentOrderEventType,
  ResidentOrderPriceKind,
  ResidentOrderSettings,
  ResidentOrderStatus,
} from "@/types/residentOrders";

type CatalogItemRow = {
  id: string;
  org_id: string;
  community_id: string;
  name: string;
  description: string | null;
  price_amount: number | string | null;
  price_kind: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SettingsRow = {
  community_id: string;
  org_id: string;
  default_company_id: string | null;
  email_subject_template: string;
  email_body_template: string;
  updated_at: string;
  updated_by: string | null;
};

type OrderRow = {
  id: string;
  org_id: string;
  community_id: string;
  location_id: string;
  unit_number: string | null;
  resident_user_id: string;
  catalog_item_id: string | null;
  item_name: string;
  item_price_amount: number | string | null;
  item_price_kind: string | null;
  quantity: number;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  status: string;
  fulfillment_company_id: string | null;
  handed_over_at: string | null;
  handed_over_by: string | null;
  handover_photo_urls: string[] | null;
  dispatched_at: string | null;
  dispatch_error: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
  cleaning_locations?: { name: string | null; address: string | null } | { name: string | null; address: string | null }[] | null;
  companies?: { name: string | null } | { name: string | null }[] | null;
};

type EventRow = {
  id: string;
  order_id: string;
  actor_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function asNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asPriceKind(value: string | null): ResidentOrderPriceKind | null {
  return value === "exact" || value === "approximate" ? value : null;
}

function asStatus(value: string): ResidentOrderStatus {
  return value as ResidentOrderStatus;
}

function asEventType(value: string): ResidentOrderEventType {
  return value as ResidentOrderEventType;
}

function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapCatalogItem(row: CatalogItemRow, locationIds: string[]): ResidentOrderCatalogItem {
  return {
    id: row.id,
    orgId: row.org_id,
    communityId: row.community_id,
    name: row.name,
    description: row.description,
    priceAmount: asNumber(row.price_amount),
    priceKind: asPriceKind(row.price_kind),
    imageUrl: row.image_url,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    locationIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettings(row: SettingsRow): ResidentOrderSettings {
  return {
    communityId: row.community_id,
    orgId: row.org_id,
    defaultCompanyId: row.default_company_id,
    emailSubjectTemplate: row.email_subject_template,
    emailBodyTemplate: row.email_body_template,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function mapOrder(row: OrderRow): ResidentOrder {
  const profile = embedOne(row.profiles);
  const location = embedOne(row.cleaning_locations);
  const company = embedOne(row.companies);
  return {
    id: row.id,
    orgId: row.org_id,
    communityId: row.community_id,
    locationId: row.location_id,
    unitNumber: row.unit_number,
    residentUserId: row.resident_user_id,
    catalogItemId: row.catalog_item_id,
    itemName: row.item_name,
    itemPriceAmount: asNumber(row.item_price_amount),
    itemPriceKind: asPriceKind(row.item_price_kind),
    quantity: row.quantity,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    notes: row.notes,
    status: asStatus(row.status),
    fulfillmentCompanyId: row.fulfillment_company_id,
    handedOverAt: row.handed_over_at,
    handedOverBy: row.handed_over_by,
    handoverPhotoUrls: row.handover_photo_urls ?? [],
    dispatchedAt: row.dispatched_at,
    dispatchError: row.dispatch_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    residentFullName: profile?.full_name ?? null,
    locationName: location?.name ?? null,
    locationAddress: location?.address ?? null,
    companyName: company?.name ?? null,
  };
}

function mapEvent(row: EventRow): ResidentOrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    actorId: row.actor_id,
    eventType: asEventType(row.event_type),
    payload: row.payload ?? {},
    createdAt: row.created_at,
  };
}

function rpcError(context: string, error: { message?: string } | null): never {
  console.error(`[residentOrderApi] ${context}:`, error);
  throw new Error(error?.message?.trim() || "Nie udało się wykonać operacji.");
}

function fromTable(table: string) {
  return supabase.from(table as never);
}

async function invokeRpc(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) rpcError(fn, error);
  return data;
}

export async function listResidentOrderCatalog(communityId: string): Promise<ResidentOrderCatalogItem[]> {
  const { data, error } = await fromTable("resident_order_catalog_items")
    .select(
      "id, org_id, community_id, name, description, price_amount, price_kind, image_url, is_active, sort_order, created_at, updated_at",
    )
    .eq("community_id", communityId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) rpcError("listResidentOrderCatalog", error);
  const rows = (data ?? []) as CatalogItemRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { data: locRows, error: locErr } = await fromTable("resident_order_catalog_item_locations")
    .select("item_id, location_id")
    .in("item_id", ids);

  if (locErr) rpcError("listResidentOrderCatalog locations", locErr);

  const byItem = new Map<string, string[]>();
  for (const loc of locRows ?? []) {
    const itemId = String((loc as { item_id: string }).item_id);
    const locationId = String((loc as { location_id: string }).location_id);
    const list = byItem.get(itemId) ?? [];
    list.push(locationId);
    byItem.set(itemId, list);
  }

  return rows.map((row) => mapCatalogItem(row, byItem.get(row.id) ?? []));
}

export type UpsertCatalogItemInput = {
  communityId: string;
  orgId: string;
  name: string;
  description: string | null;
  priceAmount: number | null;
  priceKind: ResidentOrderPriceKind | null;
  isActive: boolean;
  locationIds: string[];
  itemId?: string;
};

export async function upsertResidentOrderCatalogItem(
  input: UpsertCatalogItemInput,
): Promise<string> {
  const payload = {
    community_id: input.communityId,
    org_id: input.orgId,
    name: input.name.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    price_amount: input.priceAmount,
    price_kind: input.priceKind,
    is_active: input.isActive,
  };

  let itemId = input.itemId ?? null;
  if (itemId) {
    const { error } = await fromTable("resident_order_catalog_items")
      .update(payload)
      .eq("id", itemId);
    if (error) rpcError("upsertResidentOrderCatalogItem update", error);
  } else {
    const { data, error } = await fromTable("resident_order_catalog_items")
      .insert(payload)
      .select("id")
      .single();
    if (error) rpcError("upsertResidentOrderCatalogItem insert", error);
    itemId = String((data as { id: string }).id);
  }

  const { error: delErr } = await fromTable("resident_order_catalog_item_locations")
    .delete()
    .eq("item_id", itemId);
  if (delErr) rpcError("upsertResidentOrderCatalogItem clear locations", delErr);

  if (input.locationIds.length > 0) {
    const { error: insErr } = await fromTable("resident_order_catalog_item_locations").insert(
      input.locationIds.map((locationId) => ({ item_id: itemId, location_id: locationId })),
    );
    if (insErr) rpcError("upsertResidentOrderCatalogItem locations", insErr);
  }

  return itemId;
}

export async function deleteResidentOrderCatalogItem(itemId: string): Promise<void> {
  const { error } = await fromTable("resident_order_catalog_items").delete().eq("id", itemId);
  if (error) rpcError("deleteResidentOrderCatalogItem", error);
}

export async function ensureResidentOrderSettings(communityId: string): Promise<ResidentOrderSettings> {
  const data = await invokeRpc("ensure_resident_order_settings", {
    p_community_id: communityId,
  });
  return mapSettings(data as SettingsRow);
}

export async function saveResidentOrderSettings(input: {
  communityId: string;
  defaultCompanyId: string | null;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
}): Promise<ResidentOrderSettings> {
  const data = await invokeRpc("save_resident_order_settings", {
    p_community_id: input.communityId,
    p_default_company_id: input.defaultCompanyId,
    p_email_subject_template: input.emailSubjectTemplate,
    p_email_body_template: input.emailBodyTemplate,
  });
  return mapSettings(data as SettingsRow);
}

const ORDER_SELECT =
  "id, org_id, community_id, location_id, unit_number, resident_user_id, catalog_item_id, item_name, item_price_amount, item_price_kind, quantity, contact_name, contact_phone, contact_email, notes, status, fulfillment_company_id, handed_over_at, handed_over_by, handover_photo_urls, dispatched_at, dispatch_error, created_at, updated_at, profiles!resident_orders_resident_user_id_fkey(full_name), cleaning_locations!resident_orders_location_id_fkey(name, address), companies!resident_orders_fulfillment_company_id_fkey(name)";

export async function listCommunityResidentOrders(communityId: string): Promise<ResidentOrder[]> {
  const { data, error } = await fromTable("resident_orders")
    .select(ORDER_SELECT)
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) rpcError("listCommunityResidentOrders", error);
  return ((data ?? []) as OrderRow[]).map(mapOrder);
}

export async function listResidentOrderEvents(orderId: string): Promise<ResidentOrderEvent[]> {
  const { data, error } = await fromTable("resident_order_events")
    .select("id, order_id, actor_id, event_type, payload, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) rpcError("listResidentOrderEvents", error);
  return ((data ?? []) as EventRow[]).map(mapEvent);
}

export async function setResidentOrderStockDelivery(orderId: string): Promise<void> {
  await invokeRpc("set_resident_order_stock_delivery", { p_order_id: orderId });
}

export async function markResidentOrderOffline(orderId: string): Promise<void> {
  await invokeRpc("mark_resident_order_offline", { p_order_id: orderId });
}

export async function setResidentOrderCompany(orderId: string, companyId: string): Promise<void> {
  await invokeRpc("set_resident_order_company", {
    p_order_id: orderId,
    p_company_id: companyId,
  });
}

function resolveWebhookUrl(): string | null {
  const fromEnv = (import.meta.env.VITE_N8N_RESIDENT_ORDER_WEBHOOK_URL as string | undefined)?.trim();
  return fromEnv || null;
}

export async function queueResidentOrderDispatch(
  orderId: string,
  companyId?: string | null,
): Promise<ResidentOrderEmailPayload> {
  const data = await invokeRpc("queue_resident_order_dispatch", {
    p_order_id: orderId,
    p_company_id: companyId ?? null,
  });

  const payload = data as ResidentOrderEmailPayload;
  const webhook = resolveWebhookUrl();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new Error(bodyText.trim() || `Webhook n8n: ${res.status}`);
      }
    } catch (err) {
      console.error("[residentOrderApi] n8n webhook:", err);
      throw err instanceof Error ? err : new Error("Nie udało się wywołać automatyzacji n8n.");
    }
  }

  return payload;
}
