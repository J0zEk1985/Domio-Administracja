/**
 * Typy TypeScript dla modułu Zasobów Wspólnych i Giełdy Sąsiedzkiej
 * Mapują strukturę bazy danych z migrations/001_shared_resources_and_neighbor_market.sql
 */

// ============================================================================
// ENUMS
// ============================================================================

export type ResourceType = "community_managed" | "private_peer";

export type BillingUnitType = "hourly" | "daily";

export type ResourceStatus = "active" | "inactive" | "archived";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rejected"
  | "no_show";

export type AccessCodeType = "pin" | "nfc" | "qr" | "manual";

export type BookingEventType =
  | "created"
  | "status_changed"
  | "checked_in"
  | "checked_out"
  | "modified"
  | "approved"
  | "rejected"
  | "cancelled";

// ============================================================================
// RESOURCE TYPES
// ============================================================================

/**
 * Zasób wspólny lub prywatny
 */
export interface SharedResource {
  id: string;
  orgId: string;
  communityId: string | null;
  locationId: string | null;
  resourceType: ResourceType;

  // Właściciel (tylko dla private_peer)
  ownerUnitId: string | null;
  ownerUserId: string | null;

  // Podstawowe informacje
  name: string;
  description: string | null;
  category: string | null;
  status: ResourceStatus;

  // Konfiguracja rezerwacji
  billingUnit: BillingUnitType;
  minBookingDuration: number | null;
  maxBookingDuration: number | null;
  maxAdvanceBookingDays: number;

  // Limity Fair-Play
  maxBookingsPerUnitMonthly: number | null;
  maxHoursPerUnitMonthly: number | null;

  // Wymagania
  requiresManagerApproval: boolean;
  requiresOwnerApproval: boolean;
  requiresCheckIn: boolean;
  requiresCheckOut: boolean;
  requiresCheckOutPhoto: boolean;
  requiresDeposit: boolean;
  depositAmount: number | null;

  // Koszty
  pricePerHour: number;
  pricePerDay: number;
  isFree: boolean;

  // Dostęp
  accessCodeEnabled: boolean;
  accessCodeType: AccessCodeType | null;
  staticAccessCode: string | null;

  // Metadane
  images: string[];
  rules: Record<string, unknown>;

  // Audyt
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

/**
 * Wiersz bazy danych - mapowanie z snake_case
 */
export interface SharedResourceRow {
  id: string;
  org_id: string;
  community_id: string | null;
  location_id: string | null;
  resource_type: ResourceType;

  owner_unit_id: string | null;
  owner_user_id: string | null;

  name: string;
  description: string | null;
  category: string | null;
  status: ResourceStatus;

  billing_unit: BillingUnitType;
  min_booking_duration: number | null;
  max_booking_duration: number | null;
  max_advance_booking_days: number;

  max_bookings_per_unit_monthly: number | null;
  max_hours_per_unit_monthly: number | null;

  requires_manager_approval: boolean;
  requires_owner_approval: boolean;
  requires_check_in: boolean;
  requires_check_out: boolean;
  requires_check_out_photo: boolean;
  requires_deposit: boolean;
  deposit_amount: number | null;

  price_per_hour: number;
  price_per_day: number;
  is_free: boolean;

  access_code_enabled: boolean;
  access_code_type: AccessCodeType | null;
  static_access_code: string | null;

  images: unknown;
  rules: unknown;

  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ============================================================================
// BOOKING TYPES
// ============================================================================

/**
 * Rezerwacja zasobu
 */
export interface ResourceBooking {
  id: string;
  resourceId: string;
  orgId: string;

  // Rezerwujący
  bookedByUserId: string;
  bookedByUnitId: string | null;

  // Czas
  startsAt: string;
  endsAt: string;

  // Status
  status: BookingStatus;

  // Koszty
  calculatedPrice: number;
  depositPaid: number;

  // Kod dostępu
  temporaryAccessCode: string | null;
  accessCodeValidFrom: string | null;
  accessCodeValidUntil: string | null;

  // Check-in / Check-out
  checkedInAt: string | null;
  checkedOutAt: string | null;
  checkOutPhotoUrl: string | null;
  checkOutNotes: string | null;

  // Akceptacja
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;

  // Anulowanie
  cancelledAt: string | null;
  cancellationReason: string | null;

  // Notatki
  bookingNotes: string | null;
  internalNotes: string | null;

  // Audyt
  createdAt: string;
  updatedAt: string;
}

/**
 * Wiersz bazy danych - rezerwacja
 */
export interface ResourceBookingRow {
  id: string;
  resource_id: string;
  org_id: string;

  booked_by_user_id: string;
  booked_by_unit_id: string | null;

  starts_at: string;
  ends_at: string;

  status: BookingStatus;

  calculated_price: number;
  deposit_paid: number;

  temporary_access_code: string | null;
  access_code_valid_from: string | null;
  access_code_valid_until: string | null;

  checked_in_at: string | null;
  checked_out_at: string | null;
  check_out_photo_url: string | null;
  check_out_notes: string | null;

  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;

  cancelled_at: string | null;
  cancellation_reason: string | null;

  booking_notes: string | null;
  internal_notes: string | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// ROZSZERZONE TYPY Z RELACJAMI
// ============================================================================

/**
 * Zasób z danymi właściciela (dla prywatnych)
 */
export interface SharedResourceWithOwner extends SharedResource {
  ownerName: string | null;
  ownerUnitNumber: string | null;
}

/**
 * Rezerwacja z danymi zasobu i użytkownika
 */
export interface ResourceBookingWithDetails extends ResourceBooking {
  resource: {
    name: string;
    category: string | null;
    resourceType: ResourceType;
    images: string[];
  };
  bookedByUserName: string | null;
  bookedByUnitNumber: string | null;
}

/**
 * Zdarzenie rezerwacji (audit log)
 */
export interface ResourceBookingEvent {
  id: string;
  bookingId: string;
  eventType: BookingEventType;
  eventData: Record<string, unknown>;
  performedBy: string | null;
  createdAt: string;
}

/**
 * Reguła dostępności zasobu
 */
export interface ResourceAvailabilityRule {
  id: string;
  resourceId: string;

  // Reguły czasowe
  dayOfWeek: number | null; // 0 = Niedziela, 6 = Sobota
  availableFrom: string | null; // TIME
  availableUntil: string | null; // TIME

  // Daty wyjątkowe
  specificDate: string | null; // DATE
  isAvailable: boolean;

  notes: string | null;
  createdAt: string;
}

/**
 * Statystyki wykorzystania zasobu per lokal
 */
export interface ResourceUsageStats {
  id: string;
  orgId: string;
  unitId: string;
  resourceId: string;

  year: number;
  month: number;

  totalBookings: number;
  totalHours: number;
  totalCost: number;

  updatedAt: string;
}

// ============================================================================
// REQUEST / RESPONSE TYPES (dla API)
// ============================================================================

/**
 * Request: Tworzenie zasobu wspólnego (przez zarządcę)
 */
export interface CreateCommunityResourceRequest {
  communityId: string | null;
  locationId: string | null;
  name: string;
  description?: string;
  category?: string;
  billingUnit: BillingUnitType;
  minBookingDuration?: number;
  maxBookingDuration?: number;
  maxAdvanceBookingDays?: number;
  maxBookingsPerUnitMonthly?: number;
  maxHoursPerUnitMonthly?: number;
  requiresManagerApproval?: boolean;
  requiresCheckIn?: boolean;
  requiresCheckOut?: boolean;
  requiresCheckOutPhoto?: boolean;
  requiresDeposit?: boolean;
  depositAmount?: number;
  pricePerHour?: number;
  pricePerDay?: number;
  isFree?: boolean;
  accessCodeEnabled?: boolean;
  accessCodeType?: AccessCodeType;
  staticAccessCode?: string;
  images?: string[];
  rules?: Record<string, unknown>;
}

/**
 * Request: Tworzenie zasobu prywatnego (przez mieszkańca)
 */
export interface CreatePrivateResourceRequest {
  unitId: string;
  name: string;
  description?: string;
  category?: string;
  billingUnit: BillingUnitType;
  maxAdvanceBookingDays?: number;
  requiresOwnerApproval?: boolean;
  pricePerHour?: number;
  pricePerDay?: number;
  isFree?: boolean;
  images?: string[];
  rules?: Record<string, unknown>;
}

/**
 * Request: Tworzenie rezerwacji
 */
export interface CreateBookingRequest {
  resourceId: string;
  unitId: string;
  startsAt: string; // ISO datetime
  endsAt: string; // ISO datetime
  bookingNotes?: string;
}

/**
 * Response: Sprawdzenie dostępności
 */
export interface CheckAvailabilityResponse {
  available: boolean;
  reason?: string;
  conflictingBookings?: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
  }>;
  fairPlayStatus?: {
    allowed: boolean;
    reason?: string;
    current?: number;
    limit?: number;
  };
}

/**
 * Request: Aktualizacja statusu rezerwacji
 */
export interface UpdateBookingStatusRequest {
  status: BookingStatus;
  rejectionReason?: string;
  cancellationReason?: string;
  checkOutPhotoUrl?: string;
  checkOutNotes?: string;
}

/**
 * Kalendarze dostępności (dla frontendu)
 */
export interface ResourceAvailabilityCalendar {
  resourceId: string;
  date: string; // YYYY-MM-DD
  slots: Array<{
    startsAt: string;
    endsAt: string;
    available: boolean;
    bookingId?: string;
  }>;
}

// ============================================================================
// FILTRY I PARAMETRY ZAPYTAŃ
// ============================================================================

export interface ResourceFilters {
  resourceType?: ResourceType;
  category?: string;
  status?: ResourceStatus;
  communityId?: string;
  locationId?: string;
  ownerUserId?: string;
  isFree?: boolean;
  search?: string; // Szukanie w nazwie/opisie
}

export interface BookingFilters {
  resourceId?: string;
  status?: BookingStatus | BookingStatus[];
  unitId?: string;
  userId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface UsageStatsFilters {
  unitId?: string;
  resourceId?: string;
  year?: number;
  month?: number;
}

// ============================================================================
// MAPOWANIE FUNKCJI (helpers)
// ============================================================================

/**
 * Mapuje wiersz bazy danych na obiekt TypeScript
 */
export function mapResourceRow(row: SharedResourceRow): SharedResource {
  return {
    id: row.id,
    orgId: row.org_id,
    communityId: row.community_id,
    locationId: row.location_id,
    resourceType: row.resource_type,
    ownerUnitId: row.owner_unit_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    description: row.description,
    category: row.category,
    status: row.status,
    billingUnit: row.billing_unit,
    minBookingDuration: row.min_booking_duration,
    maxBookingDuration: row.max_booking_duration,
    maxAdvanceBookingDays: row.max_advance_booking_days,
    maxBookingsPerUnitMonthly: row.max_bookings_per_unit_monthly,
    maxHoursPerUnitMonthly: row.max_hours_per_unit_monthly,
    requiresManagerApproval: row.requires_manager_approval,
    requiresOwnerApproval: row.requires_owner_approval,
    requiresCheckIn: row.requires_check_in,
    requiresCheckOut: row.requires_check_out,
    requiresCheckOutPhoto: row.requires_check_out_photo,
    requiresDeposit: row.requires_deposit,
    depositAmount: row.deposit_amount,
    pricePerHour: row.price_per_hour,
    pricePerDay: row.price_per_day,
    isFree: row.is_free,
    accessCodeEnabled: row.access_code_enabled,
    accessCodeType: row.access_code_type,
    staticAccessCode: row.static_access_code,
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    rules: (row.rules as Record<string, unknown>) || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

/**
 * Mapuje wiersz rezerwacji na obiekt TypeScript
 */
export function mapBookingRow(row: ResourceBookingRow): ResourceBooking {
  return {
    id: row.id,
    resourceId: row.resource_id,
    orgId: row.org_id,
    bookedByUserId: row.booked_by_user_id,
    bookedByUnitId: row.booked_by_unit_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    calculatedPrice: row.calculated_price,
    depositPaid: row.deposit_paid,
    temporaryAccessCode: row.temporary_access_code,
    accessCodeValidFrom: row.access_code_valid_from,
    accessCodeValidUntil: row.access_code_valid_until,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    checkOutPhotoUrl: row.check_out_photo_url,
    checkOutNotes: row.check_out_notes,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    bookingNotes: row.booking_notes,
    internalNotes: row.internal_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Pomocnicze funkcje walidacji
 */
export const ResourceValidation = {
  isValidDuration: (starts: Date, ends: Date): boolean => {
    return ends > starts;
  },

  calculateDurationHours: (starts: Date, ends: Date): number => {
    return (ends.getTime() - starts.getTime()) / (1000 * 60 * 60);
  },

  calculatePrice: (
    resource: SharedResource,
    starts: Date,
    ends: Date
  ): number => {
    if (resource.isFree) return 0;

    const durationHours = ResourceValidation.calculateDurationHours(
      starts,
      ends
    );

    if (resource.billingUnit === "hourly") {
      return resource.pricePerHour * durationHours;
    } else {
      const durationDays = Math.ceil(durationHours / 24);
      return resource.pricePerDay * durationDays;
    }
  },

  canBook: (resource: SharedResource, advanceDays: number): boolean => {
    return advanceDays <= resource.maxAdvanceBookingDays;
  },
};
