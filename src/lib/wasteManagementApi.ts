/**
 * DOMIO Home - Waste Management API
 * Funkcje do komunikacji z bazą danych dla modułu gospodarki odpadami
 */

import { supabase } from "@/lib/supabase";
import type {
  WasteCollectionSchedule,
  WasteCollectionScheduleRow,
  WasteGuideItem,
  WasteGuideItemRow,
  WasteScheduleSyncLog,
  WasteScheduleSyncLogRow,
  WasteSyncResult,
  WasteType,
  CityAdapterResponse,
} from "@/types/wasteManagement";
import {
  mapScheduleRowToSchedule,
  mapGuideItemRowToGuideItem,
  mapSyncLogRowToSyncLog,
} from "@/types/wasteManagement";
import {
  planWasteScheduleInserts,
  todayIsoInWarsaw,
} from "@/lib/wasteScheduleSyncPlan";

// ============================================================================
// Waste Collection Schedules
// ============================================================================

/**
 * Pobierz harmonogram odbioru odpadów dla lokalizacji
 */
export async function fetchWasteSchedule(
  locationId: string,
  fromDate?: string,
  toDate?: string
): Promise<WasteCollectionSchedule[]> {
  let query = supabase
    .from("waste_collection_schedules")
    .select("*")
    .eq("location_id", locationId)
    .eq("is_cancelled", false)
    .order("collection_date", { ascending: true });

  if (fromDate) {
    query = query.gte("collection_date", fromDate);
  }

  if (toDate) {
    query = query.lte("collection_date", toDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[fetchWasteSchedule]", error);
    throw new Error(error.message);
  }

  return (data as WasteCollectionScheduleRow[]).map(mapScheduleRowToSchedule);
}

/**
 * Pobierz najbliższe terminy odbioru dla lokalizacji
 */
export async function fetchUpcomingWasteSchedule(
  locationId: string,
  limit: number = 10
): Promise<WasteCollectionSchedule[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("waste_collection_schedules")
    .select("*")
    .eq("location_id", locationId)
    .eq("is_cancelled", false)
    .gte("collection_date", today)
    .order("collection_date", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[fetchUpcomingWasteSchedule]", error);
    throw new Error(error.message);
  }

  return (data as WasteCollectionScheduleRow[]).map(mapScheduleRowToSchedule);
}

/**
 * Dodaj nowy termin odbioru (admin)
 */
export async function createWasteSchedule(
  locationId: string,
  orgId: string,
  wasteType: WasteType,
  collectionDate: string,
  options?: {
    collectionTimeFrom?: string;
    collectionTimeUntil?: string;
    notes?: string;
  }
): Promise<WasteCollectionSchedule> {
  const { data, error } = await supabase
    .from("waste_collection_schedules")
    .insert({
      location_id: locationId,
      org_id: orgId,
      waste_type: wasteType,
      collection_date: collectionDate,
      collection_time_from: options?.collectionTimeFrom || null,
      collection_time_until: options?.collectionTimeUntil || null,
      notes: options?.notes || null,
      data_source: "manual",
    })
    .select()
    .single();

  if (error) {
    console.error("[createWasteSchedule]", error);
    throw new Error(error.message);
  }

  return mapScheduleRowToSchedule(data as WasteCollectionScheduleRow);
}

export type CreateWasteScheduleInput = {
  locationId: string;
  orgId: string;
  wasteType: WasteType;
  collectionDate: string;
  collectionTimeFrom?: string;
  collectionTimeUntil?: string;
  notes?: string;
};

/**
 * Dodaj wiele terminów odbioru naraz (admin).
 * Aktywne terminy o tym samym typie i dacie są pomijane.
 * Unique index covers only non-manual rows, so manual series use insert.
 */
export async function createWasteSchedules(
  schedules: CreateWasteScheduleInput[],
): Promise<{ created: WasteCollectionSchedule[]; skipped: number }> {
  if (schedules.length === 0) {
    throw new Error("Brak terminów do dodania");
  }

  const seen = new Set<string>();
  const uniqueSchedules = schedules.filter((schedule) => {
    const key = `${schedule.locationId}|${schedule.wasteType}|${schedule.collectionDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const locationIds = [...new Set(uniqueSchedules.map((schedule) => schedule.locationId))];
  const wasteTypes = [...new Set(uniqueSchedules.map((schedule) => schedule.wasteType))];
  const collectionDates = uniqueSchedules.map((schedule) => schedule.collectionDate);

  const { data: existingRows, error: existingError } = await supabase
    .from("waste_collection_schedules")
    .select("location_id, waste_type, collection_date")
    .in("location_id", locationIds)
    .in("waste_type", wasteTypes)
    .in("collection_date", collectionDates)
    .eq("is_cancelled", false);

  if (existingError) {
    console.error("[createWasteSchedules] existing", existingError);
    throw new Error(existingError.message);
  }

  const existingKeys = new Set(
    (existingRows ?? []).map(
      (row) => `${row.location_id}|${row.waste_type}|${row.collection_date}`,
    ),
  );

  const rows = uniqueSchedules
    .filter(
      (schedule) =>
        !existingKeys.has(`${schedule.locationId}|${schedule.wasteType}|${schedule.collectionDate}`),
    )
    .map((schedule) => ({
      location_id: schedule.locationId,
      org_id: schedule.orgId,
      waste_type: schedule.wasteType,
      collection_date: schedule.collectionDate,
      collection_time_from: schedule.collectionTimeFrom || null,
      collection_time_until: schedule.collectionTimeUntil || null,
      notes: schedule.notes || null,
      data_source: "manual" as const,
    }));

  if (rows.length === 0) {
    return { created: [], skipped: uniqueSchedules.length };
  }

  const { data, error } = await supabase.from("waste_collection_schedules").insert(rows).select();

  if (error) {
    console.error("[createWasteSchedules]", error);
    throw new Error(error.message);
  }

  const created = ((data ?? []) as WasteCollectionScheduleRow[]).map(mapScheduleRowToSchedule);

  return {
    created,
    skipped: uniqueSchedules.length - created.length,
  };
}

/**
 * Aktualizuj termin odbioru (admin)
 */
export async function updateWasteSchedule(
  scheduleId: string,
  updates: Partial<{
    collectionDate: string;
    collectionTimeFrom: string | null;
    collectionTimeUntil: string | null;
    notes: string | null;
    isCancelled: boolean;
    cancellationNote: string | null;
  }>
): Promise<WasteCollectionSchedule> {
  const dbUpdates: Record<string, unknown> = {};
  
  if (updates.collectionDate !== undefined) dbUpdates.collection_date = updates.collectionDate;
  if (updates.collectionTimeFrom !== undefined) dbUpdates.collection_time_from = updates.collectionTimeFrom;
  if (updates.collectionTimeUntil !== undefined) dbUpdates.collection_time_until = updates.collectionTimeUntil;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.isCancelled !== undefined) dbUpdates.is_cancelled = updates.isCancelled;
  if (updates.cancellationNote !== undefined) dbUpdates.cancellation_note = updates.cancellationNote;

  const { data, error } = await supabase
    .from("waste_collection_schedules")
    .update(dbUpdates)
    .eq("id", scheduleId)
    .select()
    .single();

  if (error) {
    console.error("[updateWasteSchedule]", error);
    throw new Error(error.message);
  }

  return mapScheduleRowToSchedule(data as WasteCollectionScheduleRow);
}

/**
 * Usuń termin odbioru (admin)
 */
export async function deleteWasteSchedule(scheduleId: string): Promise<void> {
  const { error } = await supabase
    .from("waste_collection_schedules")
    .delete()
    .eq("id", scheduleId);

  if (error) {
    console.error("[deleteWasteSchedule]", error);
    throw new Error(error.message);
  }
}

// ============================================================================
// Waste Guide
// ============================================================================

/**
 * Pobierz przewodnik segregacji odpadów
 */
export async function fetchWasteGuide(
  orgId?: string | null,
  searchQuery?: string
): Promise<WasteGuideItem[]> {
  let query = supabase
    .from("waste_guide_items")
    .select("*")
    .eq("is_active", true);

  // Pobierz globalny przewodnik (org_id IS NULL)
  if (!orgId) {
    query = query.is("org_id", null);
  } else {
    // Pobierz globalny + organizacyjny
    query = query.or(`org_id.is.null,org_id.eq.${orgId}`);
  }

  // Wyszukiwanie po nazwie lub słowach kluczowych
  if (searchQuery && searchQuery.trim()) {
    const searchTerm = searchQuery.trim().toLowerCase();
    // Użyj trigram similarity dla lepszego wyszukiwania
    query = query.or(
      `item_name_pl.ilike.%${searchTerm}%,item_keywords.cs.{${searchTerm}}`
    );
  }

  query = query.order("is_popular", { ascending: false })
    .order("display_order", { ascending: true })
    .order("item_name_pl", { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error("[fetchWasteGuide]", error);
    throw new Error(error.message);
  }

  return (data as WasteGuideItemRow[]).map(mapGuideItemRowToGuideItem);
}

/**
 * Pobierz najpopularniejsze elementy przewodnika
 */
export async function fetchPopularWasteGuideItems(
  orgId?: string | null,
  limit: number = 12
): Promise<WasteGuideItem[]> {
  let query = supabase
    .from("waste_guide_items")
    .select("*")
    .eq("is_active", true)
    .eq("is_popular", true);

  if (!orgId) {
    query = query.is("org_id", null);
  } else {
    query = query.or(`org_id.is.null,org_id.eq.${orgId}`);
  }

  query = query.order("display_order", { ascending: true }).limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error("[fetchPopularWasteGuideItems]", error);
    throw new Error(error.message);
  }

  return (data as WasteGuideItemRow[]).map(mapGuideItemRowToGuideItem);
}

// ============================================================================
// City Adapter Sync
// ============================================================================

/**
 * Synchronizuj harmonogram z adapterem miasta (admin)
 */
export async function syncWasteScheduleFromCity(
  locationId: string,
  orgId: string,
  cityAdapter: string,
  street: string,
  buildingNumber: string,
  adapterResponse: CityAdapterResponse
): Promise<WasteSyncResult> {
  if (!adapterResponse.success || !adapterResponse.schedules?.length) {
    return finishWasteSync(locationId, cityAdapter, {
      success: false,
      recordsAdded: 0,
      recordsUpdated: 0,
      error: adapterResponse.error || "Nie znaleziono terminów do zapisania.",
    });
  }

  const collectionDates = [
    ...new Set(adapterResponse.schedules.map((schedule) => schedule.collectionDate)),
  ];
  const wasteTypes = [...new Set(adapterResponse.schedules.map((schedule) => schedule.wasteType))];

  const { data: existingRows, error: existingError } = await supabase
    .from("waste_collection_schedules")
    .select("waste_type, collection_date")
    .eq("location_id", locationId)
    .in("waste_type", wasteTypes)
    .in("collection_date", collectionDates)
    .eq("is_cancelled", false);

  if (existingError) {
    console.error("[syncWasteScheduleFromCity] existing", existingError);
    return finishWasteSync(locationId, cityAdapter, {
      success: false,
      recordsAdded: 0,
      recordsUpdated: 0,
      error: existingError.message,
    });
  }

  const existingKeys = new Set(
    (existingRows ?? []).map((row) => `${row.waste_type}|${row.collection_date}`),
  );
  const plan = planWasteScheduleInserts(
    adapterResponse.schedules,
    existingKeys,
    todayIsoInWarsaw(),
  );

  if (plan.toInsert.length === 0) {
    const error =
      plan.skippedExisting === 0 && plan.skippedTooOld > 0
        ? "Znalezione terminy są starsze niż 7 dni i nie można ich zapisać."
        : undefined;
    return finishWasteSync(locationId, cityAdapter, {
      success: !error,
      recordsAdded: 0,
      recordsUpdated: 0,
      error,
    });
  }

  const syncedAt = new Date().toISOString();
  const rows = plan.toInsert.map((schedule) => ({
    location_id: locationId,
    org_id: orgId,
    waste_type: schedule.wasteType,
    collection_date: schedule.collectionDate,
    collection_time_from: schedule.collectionTimeFrom || null,
    collection_time_until: schedule.collectionTimeUntil || null,
    data_source: "city_scraper" as const,
    city_adapter: cityAdapter,
    street_name: street,
    building_number: buildingNumber,
    last_synced_at: syncedAt,
  }));

  const { data, error } = await supabase.from("waste_collection_schedules").insert(rows).select("id");

  if (error) {
    console.error("[syncWasteScheduleFromCity] insert", error);
    return finishWasteSync(locationId, cityAdapter, {
      success: false,
      recordsAdded: 0,
      recordsUpdated: 0,
      error: error.message,
    });
  }

  return finishWasteSync(locationId, cityAdapter, {
    success: true,
    recordsAdded: data?.length ?? rows.length,
    recordsUpdated: 0,
  });
}

async function finishWasteSync(
  locationId: string,
  cityAdapter: string,
  result: WasteSyncResult,
): Promise<WasteSyncResult> {
  const { data: logData, error: logError } = await supabase
    .from("waste_schedule_sync_log")
    .insert({
      location_id: locationId,
      city_adapter: cityAdapter,
      sync_status: result.success ? "success" : "error",
      records_added: result.recordsAdded,
      records_updated: result.recordsUpdated,
      error_message: result.error ?? null,
    })
    .select()
    .single();

  if (logError) {
    console.error("[syncWasteScheduleFromCity] log", logError);
  }

  return {
    ...result,
    logId: (logData as WasteScheduleSyncLogRow | null)?.id,
  };
}

/**
 * Pobierz logi synchronizacji dla lokalizacji (admin)
 */
export async function fetchWasteSyncLogs(
  locationId: string,
  limit: number = 10
): Promise<WasteScheduleSyncLog[]> {
  const { data, error } = await supabase
    .from("waste_schedule_sync_log")
    .select("*")
    .eq("location_id", locationId)
    .order("synced_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[fetchWasteSyncLogs]", error);
    throw new Error(error.message);
  }

  return ((data ?? []) as WasteScheduleSyncLogRow[]).map(mapSyncLogRowToSyncLog);
}
