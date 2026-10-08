/**
 * API Service dla modułu Zasobów Wspólnych i Giełdy Sąsiedzkiej
 * Wrapper dla RPC functions z Supabase
 */

import { supabase } from "@/lib/supabase";
import { buildMonthAvailability, monthQueryRange } from "@/lib/resourceAvailability";
import {
  mapBookingRow,
  mapResourceRow,
} from "@/types/sharedResources";
import type {
  SharedResource,
  SharedResourceRow,
  ResourceBooking,
  ResourceBookingRow,
  ResourceBookingWithDetails,
  ResourceAvailabilityCalendar,
  ResourceUsageStats,
  CreateCommunityResourceRequest,
  CreatePrivateResourceRequest,
  CreateBookingRequest,
  UpdateBookingStatusRequest,
  CheckAvailabilityResponse,
  ResourceFilters,
  BookingFilters,
  BookingStatus,
  ResourceType,
} from "@/types/sharedResources";

// ============================================================================
// HELPER TYPES
// ============================================================================

interface RpcResponse<T = unknown> {
  data: T | null;
  error: Error | null;
}

interface CreateBookingResponse {
  success: boolean;
  booking_id?: string;
  status?: BookingStatus;
  calculated_price?: number;
  message?: string;
  error?: string;
  details?: unknown;
}

interface ApproveRejectResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface AccessCodeResponse {
  success: boolean;
  access_code?: string;
  code_type?: string;
  is_temporary?: boolean;
  valid_from?: string;
  valid_until?: string;
  error?: string;
  message?: string;
}

// ============================================================================
// ZASOBY - CRUD
// ============================================================================

/**
 * Tworzy zasób wspólny (zarządzany przez administratora)
 */
export async function createCommunityResource(
  request: CreateCommunityResourceRequest
): Promise<RpcResponse<string>> {
  try {
    const { data, error } = await supabase.rpc("create_community_resource", {
      p_community_id: request.communityId || null,
      p_location_id: request.locationId || null,
      p_name: request.name,
      p_description: request.description || null,
      p_category: request.category || null,
      p_billing_unit: request.billingUnit,
      p_min_booking_duration: request.minBookingDuration || null,
      p_max_booking_duration: request.maxBookingDuration || null,
      p_max_advance_booking_days: request.maxAdvanceBookingDays || 30,
      p_max_bookings_per_unit_monthly:
        request.maxBookingsPerUnitMonthly || null,
      p_max_hours_per_unit_monthly: request.maxHoursPerUnitMonthly || null,
      p_requires_manager_approval: request.requiresManagerApproval || false,
      p_requires_check_in: request.requiresCheckIn || false,
      p_requires_check_out: request.requiresCheckOut || false,
      p_requires_check_out_photo: request.requiresCheckOutPhoto || false,
      p_requires_deposit: request.requiresDeposit || false,
      p_deposit_amount: request.depositAmount || null,
      p_price_per_hour: request.pricePerHour || 0,
      p_price_per_day: request.pricePerDay || 0,
      p_is_free: request.isFree ?? true,
      p_access_code_enabled: request.accessCodeEnabled || false,
      p_access_code_type: request.accessCodeType || null,
      p_static_access_code: request.staticAccessCode || null,
      p_images: request.images || [],
      p_rules: request.rules || {},
    });

    if (error) {
      console.error("[createCommunityResource] Error:", error);
      return { data: null, error };
    }

    return { data: data as string, error: null };
  } catch (err) {
    console.error("[createCommunityResource] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Tworzy zasób prywatny (P2P przez mieszkańca)
 */
export async function createPrivateResource(
  request: CreatePrivateResourceRequest
): Promise<RpcResponse<string>> {
  try {
    const { data, error } = await supabase.rpc("create_private_resource", {
      p_unit_id: request.unitId,
      p_name: request.name,
      p_description: request.description || null,
      p_category: request.category || null,
      p_billing_unit: request.billingUnit,
      p_max_advance_booking_days: request.maxAdvanceBookingDays || 14,
      p_requires_owner_approval: request.requiresOwnerApproval ?? true,
      p_price_per_hour: request.pricePerHour || 0,
      p_price_per_day: request.pricePerDay || 0,
      p_is_free: request.isFree ?? true,
      p_images: request.images || [],
      p_rules: request.rules || {},
    });

    if (error) {
      console.error("[createPrivateResource] Error:", error);
      return { data: null, error };
    }

    return { data: data as string, error: null };
  } catch (err) {
    console.error("[createPrivateResource] Exception:", err);
    return { data: null, error: err as Error };
  }
}

interface CommunityResourceQuery extends PromiseLike<{
  data: SharedResourceRow[] | null;
  error: { message: string } | null;
}> {
  eq(column: string, value: string): CommunityResourceQuery;
  order(
    column: string,
    options: { ascending: boolean }
  ): CommunityResourceQuery;
}

/**
 * Zasoby wspólnoty dla panelu zarządcy.
 * Odczyt po community_id, bez RPC get_available_resources.
 */
export async function getCommunityManagedResources(
  communityId: string
): Promise<RpcResponse<SharedResource[]>> {
  try {
    const client = supabase as unknown as {
      from(table: "shared_resources"): {
        select(columns: "*"): CommunityResourceQuery;
      };
    };

    const { data, error } = await client
      .from("shared_resources")
      .select("*")
      .eq("community_id", communityId)
      .eq("resource_type", "community_managed")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getCommunityManagedResources] Error:", error);
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: (data ?? []).map(mapResourceRow),
      error: null,
    };
  } catch (err) {
    console.error("[getCommunityManagedResources] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Pobiera dostępne zasoby dla zalogowanego użytkownika
 */
export async function getAvailableResources(
  filters?: ResourceFilters
): Promise<RpcResponse<SharedResource[]>> {
  if (filters?.communityId) {
    const listed = await getCommunityManagedResources(filters.communityId);
    if (listed.error || !listed.data) return listed;

    let filtered = listed.data;

    if (filters.resourceType) {
      filtered = filtered.filter((r) => r.resourceType === filters.resourceType);
    }
    if (filters.category) {
      filtered = filtered.filter((r) => r.category === filters.category);
    }
    if (filters.status) {
      filtered = filtered.filter((r) => r.status === filters.status);
    }
    if (filters.isFree !== undefined) {
      filtered = filtered.filter((r) => r.isFree === filters.isFree);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower)
      );
    }

    return { data: filtered, error: null };
  }

  try {
    const { data, error } = await supabase.rpc("get_available_resources", {
      p_resource_type: filters?.resourceType || null,
      p_category: filters?.category || null,
    });

    if (error) {
      console.error("[getAvailableResources] Error:", error);
      return { data: null, error };
    }

    const resources = (data as SharedResourceRow[]).map(mapResourceRow);

    // Filtrowanie po stronie klienta (jeśli potrzebne)
    let filtered = resources;

    if (filters?.status) {
      filtered = filtered.filter((r) => r.status === filters.status);
    }

    if (filters?.isFree !== undefined) {
      filtered = filtered.filter((r) => r.isFree === filters.isFree);
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower)
      );
    }

    return { data: filtered, error: null };
  } catch (err) {
    console.error("[getAvailableResources] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Pobiera pojedynczy zasób po ID
 */
export async function getResourceById(
  resourceId: string
): Promise<RpcResponse<SharedResource>> {
  try {
    const { data, error } = await supabase
      .from("shared_resources")
      .select("*")
      .eq("id", resourceId)
      .single();

    if (error) {
      console.error("[getResourceById] Error:", error);
      return { data: null, error };
    }

    return { data: mapResourceRow(data as SharedResourceRow), error: null };
  } catch (err) {
    console.error("[getResourceById] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Aktualizuje zasób
 */
export async function updateResource(
  resourceId: string,
  updates: Partial<SharedResourceRow>
): Promise<RpcResponse<SharedResource>> {
  try {
    const { data, error } = await supabase
      .from("shared_resources")
      .update(updates)
      .eq("id", resourceId)
      .select()
      .single();

    if (error) {
      console.error("[updateResource] Error:", error);
      return { data: null, error };
    }

    return { data: mapResourceRow(data as SharedResourceRow), error: null };
  } catch (err) {
    console.error("[updateResource] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Dezaktywuje zasób (soft delete)
 */
export async function deactivateResource(
  resourceId: string
): Promise<RpcResponse<void>> {
  try {
    const { error } = await supabase
      .from("shared_resources")
      .update({ status: "inactive" })
      .eq("id", resourceId);

    if (error) {
      console.error("[deactivateResource] Error:", error);
      return { data: null, error };
    }

    return { data: null, error: null };
  } catch (err) {
    console.error("[deactivateResource] Exception:", err);
    return { data: null, error: err as Error };
  }
}

// ============================================================================
// REZERWACJE - CRUD
// ============================================================================

/**
 * Tworzy rezerwację z pełną walidacją
 */
export async function createBooking(
  request: CreateBookingRequest
): Promise<RpcResponse<CreateBookingResponse>> {
  try {
    const { data, error } = await supabase.rpc("create_booking", {
      p_resource_id: request.resourceId,
      p_unit_id: request.unitId,
      p_starts_at: request.startsAt,
      p_ends_at: request.endsAt,
      p_booking_notes: request.bookingNotes || null,
    });

    if (error) {
      console.error("[createBooking] Error:", error);
      return { data: null, error };
    }

    return { data: data as CreateBookingResponse, error: null };
  } catch (err) {
    console.error("[createBooking] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Pobiera rezerwacje zalogowanego użytkownika
 */
export async function getMyBookings(
  status?: BookingStatus,
  includePast = false
): Promise<RpcResponse<ResourceBookingWithDetails[]>> {
  try {
    const { data, error } = await supabase.rpc("get_my_bookings", {
      p_status: status || null,
      p_include_past: includePast,
    });

    if (error) {
      console.error("[getMyBookings] Error:", error);
      return { data: null, error };
    }

    const bookings = (data as Array<{ booking: unknown; resource: unknown }>).map(
      (row) => {
        const booking = mapBookingRow(row.booking as ResourceBookingRow);
        const resource = row.resource as SharedResourceRow;

        return {
          ...booking,
          resource: {
            name: resource.name,
            category: resource.category,
            resourceType: resource.resource_type,
            images: Array.isArray(resource.images)
              ? (resource.images as string[])
              : [],
          },
          bookedByUserName: null,
          bookedByUnitNumber: null,
        } as ResourceBookingWithDetails;
      }
    );

    return { data: bookings, error: null };
  } catch (err) {
    console.error("[getMyBookings] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Pobiera rezerwacje dla zasobu (dla właściciela/zarządcy)
 */
export async function getResourceBookings(
  resourceId: string,
  filters?: BookingFilters
): Promise<RpcResponse<ResourceBooking[]>> {
  try {
    let query = supabase
      .from("resource_bookings")
      .select("*")
      .eq("resource_id", resourceId);

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in("status", filters.status);
      } else {
        query = query.eq("status", filters.status);
      }
    }

    if (filters?.startDate) {
      query = query.gte("starts_at", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("ends_at", filters.endDate);
    }

    query = query.order("starts_at", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("[getResourceBookings] Error:", error);
      return { data: null, error };
    }

    return {
      data: (data as ResourceBookingRow[]).map(mapBookingRow),
      error: null,
    };
  } catch (err) {
    console.error("[getResourceBookings] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Zatwierdza rezerwację
 */
export async function approveBooking(
  bookingId: string
): Promise<RpcResponse<ApproveRejectResponse>> {
  try {
    const { data, error } = await supabase.rpc("approve_booking", {
      p_booking_id: bookingId,
    });

    if (error) {
      console.error("[approveBooking] Error:", error);
      return { data: null, error };
    }

    return { data: data as ApproveRejectResponse, error: null };
  } catch (err) {
    console.error("[approveBooking] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Odrzuca rezerwację
 */
export async function rejectBooking(
  bookingId: string,
  reason: string
): Promise<RpcResponse<ApproveRejectResponse>> {
  try {
    const { data, error } = await supabase.rpc("reject_booking", {
      p_booking_id: bookingId,
      p_rejection_reason: reason,
    });

    if (error) {
      console.error("[rejectBooking] Error:", error);
      return { data: null, error };
    }

    return { data: data as ApproveRejectResponse, error: null };
  } catch (err) {
    console.error("[rejectBooking] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Anuluje rezerwację
 */
export async function cancelBooking(
  bookingId: string,
  reason?: string
): Promise<RpcResponse<ApproveRejectResponse>> {
  try {
    const { data, error } = await supabase.rpc("cancel_booking", {
      p_booking_id: bookingId,
      p_cancellation_reason: reason || null,
    });

    if (error) {
      console.error("[cancelBooking] Error:", error);
      return { data: null, error };
    }

    return { data: data as ApproveRejectResponse, error: null };
  } catch (err) {
    console.error("[cancelBooking] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Check-in do rezerwacji
 */
export async function checkInBooking(
  bookingId: string
): Promise<RpcResponse<ApproveRejectResponse>> {
  try {
    const { data, error } = await supabase.rpc("check_in_booking", {
      p_booking_id: bookingId,
    });

    if (error) {
      console.error("[checkInBooking] Error:", error);
      return { data: null, error };
    }

    return { data: data as ApproveRejectResponse, error: null };
  } catch (err) {
    console.error("[checkInBooking] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Check-out z rezerwacji
 */
export async function checkOutBooking(
  bookingId: string,
  photoUrl?: string,
  notes?: string
): Promise<RpcResponse<ApproveRejectResponse>> {
  try {
    const { data, error } = await supabase.rpc("check_out_booking", {
      p_booking_id: bookingId,
      p_check_out_photo_url: photoUrl || null,
      p_check_out_notes: notes || null,
    });

    if (error) {
      console.error("[checkOutBooking] Error:", error);
      return { data: null, error };
    }

    return { data: data as ApproveRejectResponse, error: null };
  } catch (err) {
    console.error("[checkOutBooking] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Generuje kod dostępu dla rezerwacji
 */
export async function generateAccessCode(
  bookingId: string
): Promise<RpcResponse<AccessCodeResponse>> {
  try {
    const { data, error } = await supabase.rpc("generate_access_code", {
      p_booking_id: bookingId,
    });

    if (error) {
      console.error("[generateAccessCode] Error:", error);
      return { data: null, error };
    }

    return { data: data as AccessCodeResponse, error: null };
  } catch (err) {
    console.error("[generateAccessCode] Exception:", err);
    return { data: null, error: err as Error };
  }
}

// ============================================================================
// DOSTĘPNOŚĆ I KALENDARZ
// ============================================================================

/**
 * Sprawdza dostępność zasobu w podanym przedziale czasowym
 */
export async function checkAvailability(
  resourceId: string,
  startsAt: string,
  endsAt: string
): Promise<RpcResponse<CheckAvailabilityResponse>> {
  try {
    // Pobierz konfliktujące rezerwacje
    const { data: bookings, error: bookingsError } = await supabase
      .from("resource_bookings")
      .select("id, starts_at, ends_at")
      .eq("resource_id", resourceId)
      .in("status", ["pending", "confirmed", "in_progress"])
      .or(
        `and(starts_at.lt.${endsAt},ends_at.gt.${startsAt})`
      );

    if (bookingsError) {
      console.error("[checkAvailability] Error:", bookingsError);
      return { data: null, error: bookingsError };
    }

    const available = !bookings || bookings.length === 0;

    return {
      data: {
        available,
        conflictingBookings: available
          ? undefined
          : bookings.map((b) => ({
              id: b.id,
              startsAt: b.starts_at,
              endsAt: b.ends_at,
            })),
      },
      error: null,
    };
  } catch (err) {
    console.error("[checkAvailability] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Pobiera kalendarz dostępności dla zasobu (cały miesiąc)
 */
export async function getResourceAvailabilityCalendar(
  resourceId: string,
  year: number,
  month: number
): Promise<RpcResponse<ResourceAvailabilityCalendar[]>> {
  try {
    const { start, end } = monthQueryRange(year, month);
    const { data: bookings, error } = await supabase
      .from("resource_bookings")
      .select("id, starts_at, ends_at, status, booked_by_unit_id")
      .eq("resource_id", resourceId)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .in("status", ["pending", "confirmed", "in_progress"]);

    if (error) {
      console.error("[getResourceAvailabilityCalendar] Error:", error);
      return { data: null, error };
    }

    const unitIds = [
      ...new Set(
        (bookings ?? [])
          .map((booking) => booking.booked_by_unit_id)
          .filter((unitId): unitId is string => Boolean(unitId)),
      ),
    ];
    const unitNumbers = new Map<string, string | null>();

    if (unitIds.length > 0) {
      const { data: units, error: unitsError } = await supabase
        .from("community_units")
        .select("id, unit_number")
        .in("id", unitIds);

      if (unitsError) {
        console.error("[getResourceAvailabilityCalendar] units:", unitsError);
      } else {
        for (const unit of units ?? []) {
          unitNumbers.set(unit.id, unit.unit_number);
        }
      }
    }

    return {
      data: buildMonthAvailability(
        resourceId,
        year,
        month,
        (bookings ?? []).map((booking) => ({
          id: booking.id,
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
          status: booking.status as BookingStatus,
          unitNumber: booking.booked_by_unit_id
            ? unitNumbers.get(booking.booked_by_unit_id) ?? null
            : null,
        })),
      ),
      error: null,
    };
  } catch (err) {
    console.error("[getResourceAvailabilityCalendar] Exception:", err);
    return { data: null, error: err as Error };
  }
}

// ============================================================================
// STATYSTYKI
// ============================================================================

/**
 * Pobiera statystyki wykorzystania zasobu (dla zarządcy)
 */
export async function getResourceUsageReport(
  resourceId: string,
  year?: number,
  month?: number
): Promise<RpcResponse<ResourceUsageStats[]>> {
  try {
    const { data, error } = await supabase.rpc("get_resource_usage_report", {
      p_resource_id: resourceId,
      p_year: year || new Date().getFullYear(),
      p_month: month || new Date().getMonth() + 1,
    });

    if (error) {
      console.error("[getResourceUsageReport] Error:", error);
      return { data: null, error };
    }

    return { data: data as ResourceUsageStats[], error: null };
  } catch (err) {
    console.error("[getResourceUsageReport] Exception:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Pobiera statystyki użytkownika (dla mieszkańca)
 */
export async function getMyUsageStats(
  unitId: string,
  resourceId?: string
): Promise<RpcResponse<ResourceUsageStats[]>> {
  try {
    let query = supabase
      .from("resource_usage_stats")
      .select("*")
      .eq("unit_id", unitId);

    if (resourceId) {
      query = query.eq("resource_id", resourceId);
    }

    query = query.order("year", { ascending: false }).order("month", {
      ascending: false,
    });

    const { data, error } = await query;

    if (error) {
      console.error("[getMyUsageStats] Error:", error);
      return { data: null, error };
    }

    return { data: data as ResourceUsageStats[], error: null };
  } catch (err) {
    console.error("[getMyUsageStats] Exception:", err);
    return { data: null, error: err as Error };
  }
}

// ============================================================================
// SUBSCRIPTION HELPERS (Real-time)
// ============================================================================

/**
 * Subskrybuj zmiany w rezerwacjach zasobu
 */
export function subscribeToResourceBookings(
  resourceId: string,
  callback: (payload: { new: ResourceBooking; old?: ResourceBooking }) => void
) {
  const channel = supabase
    .channel(`resource-bookings:${resourceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "resource_bookings",
        filter: `resource_id=eq.${resourceId}`,
      },
      (payload) => {
        callback({
          new: mapBookingRow(payload.new as ResourceBookingRow),
          old: payload.old ? mapBookingRow(payload.old as ResourceBookingRow) : undefined,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subskrybuj zmiany w moich rezerwacjach
 */
export function subscribeToMyBookings(
  userId: string,
  callback: (payload: { new: ResourceBooking; old?: ResourceBooking }) => void
) {
  const channel = supabase
    .channel(`user-bookings:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "resource_bookings",
        filter: `booked_by_user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          new: mapBookingRow(payload.new as ResourceBookingRow),
          old: payload.old ? mapBookingRow(payload.old as ResourceBookingRow) : undefined,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
