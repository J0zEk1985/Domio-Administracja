/**
 * Funkcje pomocnicze dla modułu Zasobów Wspólnych
 * Formatowanie, walidacja, obliczenia
 */

import type {
  SharedResource,
  ResourceBooking,
  BookingStatus,
  BillingUnitType,
} from "@/types/sharedResources";
import { format, formatDistanceToNow, isPast, isFuture, isToday, isTomorrow, addMinutes, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { pl } from "date-fns/locale";

// ============================================================================
// FORMATOWANIE DAT I CZASU
// ============================================================================

/**
 * Formatuje datę i czas rezerwacji
 */
export function formatBookingDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM yyyy, HH:mm", { locale: pl });
}

/**
 * Formatuje datę bez godziny
 */
export function formatBookingDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM yyyy", { locale: pl });
}

/**
 * Formatuje tylko godzinę
 */
export function formatBookingTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "HH:mm", { locale: pl });
}

/**
 * Formatuje zakres czasowy rezerwacji
 */
export function formatBookingTimeRange(
  startsAt: string | Date,
  endsAt: string | Date
): string {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;

  // Jeśli ten sam dzień
  if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
    return `${format(start, "d MMMM yyyy", { locale: pl })}, ${format(
      start,
      "HH:mm"
    )} - ${format(end, "HH:mm")}`;
  }

  // Różne dni
  return `${format(start, "d MMM HH:mm", { locale: pl })} - ${format(
    end,
    "d MMM HH:mm",
    { locale: pl }
  )}`;
}

/**
 * Formatuje względny czas (np. "za 2 godziny", "5 minut temu")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { locale: pl, addSuffix: true });
}

/**
 * Formatuje opis dnia rezerwacji (Dziś, Jutro, data)
 */
export function formatBookingDay(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  
  if (isToday(d)) {
    return "Dziś";
  }
  if (isTomorrow(d)) {
    return "Jutro";
  }
  return format(d, "EEEE, d MMMM", { locale: pl });
}

// ============================================================================
// OBLICZENIA CZASU I CENY
// ============================================================================

/**
 * Oblicza długość rezerwacji w godzinach
 */
export function calculateDurationHours(
  startsAt: string | Date,
  endsAt: string | Date
): number {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  return differenceInHours(end, start);
}

/**
 * Oblicza długość rezerwacji w dniach (zaokrąglone w górę)
 */
export function calculateDurationDays(
  startsAt: string | Date,
  endsAt: string | Date
): number {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const days = differenceInDays(end, start);
  return days === 0 ? 1 : days; // Minimum 1 dzień
}

/**
 * Oblicza cenę rezerwacji
 */
export function calculateBookingPrice(
  resource: SharedResource,
  startsAt: string | Date,
  endsAt: string | Date
): number {
  if (resource.isFree) return 0;

  if (resource.billingUnit === "hourly") {
    const hours = calculateDurationHours(startsAt, endsAt);
    return resource.pricePerHour * hours;
  } else {
    const days = calculateDurationDays(startsAt, endsAt);
    return resource.pricePerDay * days;
  }
}

/**
 * Formatuje cenę (z walutą PLN)
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(price);
}

/**
 * Formatuje cenę za jednostkę czasu
 */
export function formatPricePerUnit(
  price: number,
  billingUnit: BillingUnitType
): string {
  const formattedPrice = formatPrice(price);
  const unit = billingUnit === "hourly" ? "godz." : "dobę";
  return `${formattedPrice} / ${unit}`;
}

// ============================================================================
// STATUS I KOLORY
// ============================================================================

/**
 * Mapuje status rezerwacji na etykietę PL
 */
export function getBookingStatusLabel(status: BookingStatus): string {
  const labels: Record<BookingStatus, string> = {
    pending: "Oczekuje",
    confirmed: "Potwierdzona",
    in_progress: "W trakcie",
    completed: "Zakończona",
    cancelled: "Anulowana",
    rejected: "Odrzucona",
    no_show: "Nieobecność",
  };
  return labels[status];
}

/**
 * Mapuje status na kolor (dla badge/chip)
 */
export function getBookingStatusColor(
  status: BookingStatus
): "default" | "success" | "warning" | "destructive" | "secondary" {
  const colors: Record<
    BookingStatus,
    "default" | "success" | "warning" | "destructive" | "secondary"
  > = {
    pending: "warning",
    confirmed: "success",
    in_progress: "default",
    completed: "secondary",
    cancelled: "destructive",
    rejected: "destructive",
    no_show: "destructive",
  };
  return colors[status];
}

/**
 * Sprawdza czy rezerwacja może być anulowana
 */
export function canCancelBooking(booking: ResourceBooking): boolean {
  if (!["pending", "confirmed"].includes(booking.status)) return false;
  const now = new Date();
  const startsAt = new Date(booking.startsAt);
  return startsAt > now; // Można anulować jeśli jeszcze się nie zaczęła
}

/**
 * Sprawdza czy można wykonać check-in
 */
export function canCheckIn(booking: ResourceBooking): boolean {
  if (booking.status !== "confirmed") return false;
  if (booking.checkedInAt) return false;

  const now = new Date();
  const startsAt = new Date(booking.startsAt);
  const allowedFrom = addMinutes(startsAt, -15); // 15 minut przed

  return now >= allowedFrom && now <= startsAt;
}

/**
 * Sprawdza czy można wykonać check-out
 */
export function canCheckOut(booking: ResourceBooking): boolean {
  if (booking.status !== "in_progress") return false;
  if (booking.checkedOutAt) return false;

  const now = new Date();
  const endsAt = new Date(booking.endsAt);

  return now <= endsAt;
}

/**
 * Sprawdza czy rezerwacja wymaga akcji użytkownika
 */
export function requiresUserAction(booking: ResourceBooking): {
  required: boolean;
  action?: "check_in" | "check_out" | "waiting_approval";
  message?: string;
} {
  if (booking.status === "pending") {
    return {
      required: true,
      action: "waiting_approval",
      message: "Oczekuje na zatwierdzenie",
    };
  }

  if (canCheckIn(booking)) {
    return {
      required: true,
      action: "check_in",
      message: "Możesz wykonać check-in",
    };
  }

  if (canCheckOut(booking)) {
    const minutesLeft = differenceInMinutes(
      new Date(booking.endsAt),
      new Date()
    );
    if (minutesLeft <= 15) {
      return {
        required: true,
        action: "check_out",
        message: `Zakończenie za ${minutesLeft} min. Wykonaj check-out!`,
      };
    }
  }

  return { required: false };
}

// ============================================================================
// WALIDACJE
// ============================================================================

/**
 * Waliduje czy zakres czasowy jest poprawny
 */
export function validateBookingTimeRange(
  startsAt: Date,
  endsAt: Date
): { valid: boolean; error?: string } {
  if (endsAt <= startsAt) {
    return {
      valid: false,
      error: "Data zakończenia musi być późniejsza niż rozpoczęcia",
    };
  }

  if (isPast(startsAt)) {
    return {
      valid: false,
      error: "Nie można rezerwować w przeszłości",
    };
  }

  return { valid: true };
}

/**
 * Waliduje długość rezerwacji względem limitów zasobu
 */
export function validateBookingDuration(
  resource: SharedResource,
  startsAt: Date,
  endsAt: Date
): { valid: boolean; error?: string } {
  const hours = calculateDurationHours(startsAt, endsAt);

  if (resource.minBookingDuration) {
    if (resource.billingUnit === "hourly" && hours < resource.minBookingDuration) {
      return {
        valid: false,
        error: `Minimalna długość rezerwacji: ${resource.minBookingDuration} godz.`,
      };
    }
    const days = calculateDurationDays(startsAt, endsAt);
    if (resource.billingUnit === "daily" && days < resource.minBookingDuration) {
      return {
        valid: false,
        error: `Minimalna długość rezerwacji: ${resource.minBookingDuration} dni`,
      };
    }
  }

  if (resource.maxBookingDuration) {
    if (resource.billingUnit === "hourly" && hours > resource.maxBookingDuration) {
      return {
        valid: false,
        error: `Maksymalna długość rezerwacji: ${resource.maxBookingDuration} godz.`,
      };
    }
    const days = calculateDurationDays(startsAt, endsAt);
    if (resource.billingUnit === "daily" && days > resource.maxBookingDuration) {
      return {
        valid: false,
        error: `Maksymalna długość rezerwacji: ${resource.maxBookingDuration} dni`,
      };
    }
  }

  return { valid: true };
}

/**
 * Waliduje wyprzedzenie rezerwacji
 */
export function validateAdvanceBooking(
  resource: SharedResource,
  startsAt: Date
): { valid: boolean; error?: string } {
  const days = differenceInDays(startsAt, new Date());

  if (days > resource.maxAdvanceBookingDays) {
    return {
      valid: false,
      error: `Można rezerwować maksymalnie ${resource.maxAdvanceBookingDays} dni z wyprzedzeniem`,
    };
  }

  return { valid: true };
}

/**
 * Pełna walidacja rezerwacji
 */
export function validateBooking(
  resource: SharedResource,
  startsAt: Date,
  endsAt: Date
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const timeRangeValidation = validateBookingTimeRange(startsAt, endsAt);
  if (!timeRangeValidation.valid && timeRangeValidation.error) {
    errors.push(timeRangeValidation.error);
  }

  const durationValidation = validateBookingDuration(resource, startsAt, endsAt);
  if (!durationValidation.valid && durationValidation.error) {
    errors.push(durationValidation.error);
  }

  const advanceValidation = validateAdvanceBooking(resource, startsAt);
  if (!advanceValidation.valid && advanceValidation.error) {
    errors.push(advanceValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// KATEGORIE I IKONY
// ============================================================================

/**
 * Mapuje kategorię zasobu na ikonę (Lucide React)
 */
export function getResourceCategoryIcon(category: string | null): string {
  const icons: Record<string, string> = {
    parking: "Car",
    storage: "Package",
    equipment: "Wrench",
    recreation: "PartyPopper",
    bike: "Bike",
    tool: "Hammer",
    garden: "Leaf",
    sport: "Dumbbell",
    kitchen: "UtensilsCrossed",
    cleaning: "SparkleIcon",
    other: "Box",
  };

  return icons[category?.toLowerCase() || ""] || "Box";
}

/**
 * Etykiety kategorii po polsku
 */
export function getCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    parking: "Parking",
    storage: "Magazyn/Komórka",
    equipment: "Sprzęt",
    recreation: "Rekreacja",
    bike: "Rowery",
    tool: "Narzędzia",
    garden: "Ogród",
    sport: "Sport",
    kitchen: "Kuchnia",
    cleaning: "Sprzątanie",
    other: "Inne",
  };

  return labels[category?.toLowerCase() || ""] || "Inne";
}

// ============================================================================
// SORTOWANIE I FILTROWANIE
// ============================================================================

/**
 * Sortuje zasoby według popularności (liczba rezerwacji)
 */
export function sortResourcesByPopularity(
  resources: SharedResource[]
): SharedResource[] {
  // TODO: Po dodaniu pola bookings_count do zasobu
  return [...resources];
}

/**
 * Grupuje rezerwacje według statusu
 */
export function groupBookingsByStatus(
  bookings: ResourceBooking[]
): Record<BookingStatus, ResourceBooking[]> {
  return bookings.reduce((acc, booking) => {
    if (!acc[booking.status]) {
      acc[booking.status] = [];
    }
    acc[booking.status].push(booking);
    return acc;
  }, {} as Record<BookingStatus, ResourceBooking[]>);
}

/**
 * Grupuje rezerwacje według daty (dzisiaj, jutro, później)
 */
export function groupBookingsByDate(bookings: ResourceBooking[]): {
  today: ResourceBooking[];
  tomorrow: ResourceBooking[];
  upcoming: ResourceBooking[];
  past: ResourceBooking[];
} {
  const today: ResourceBooking[] = [];
  const tomorrow: ResourceBooking[] = [];
  const upcoming: ResourceBooking[] = [];
  const past: ResourceBooking[] = [];

  bookings.forEach((booking) => {
    const startsAt = new Date(booking.startsAt);
    
    if (isPast(new Date(booking.endsAt))) {
      past.push(booking);
    } else if (isToday(startsAt)) {
      today.push(booking);
    } else if (isTomorrow(startsAt)) {
      tomorrow.push(booking);
    } else {
      upcoming.push(booking);
    }
  });

  return { today, tomorrow, upcoming, past };
}

// ============================================================================
// UTILS
// ============================================================================

/**
 * Generuje sugestie slotów czasowych dla rezerwacji
 */
export function generateTimeSlots(
  billingUnit: BillingUnitType,
  duration: number = 1
): Array<{ label: string; hours: number }> {
  if (billingUnit === "hourly") {
    return [
      { label: "1 godzina", hours: 1 },
      { label: "2 godziny", hours: 2 },
      { label: "3 godziny", hours: 3 },
      { label: "4 godziny", hours: 4 },
      { label: "Cały dzień (8h)", hours: 8 },
    ];
  } else {
    return [
      { label: "1 dzień", hours: 24 },
      { label: "2 dni", hours: 48 },
      { label: "3 dni", hours: 72 },
      { label: "1 tydzień", hours: 168 },
    ];
  }
}

/**
 * Sprawdza czy użytkownik może zarządzać zasobem
 */
export function canManageResource(
  resource: SharedResource,
  userId: string,
  isManager: boolean
): boolean {
  if (resource.resourceType === "community_managed") {
    return isManager;
  } else {
    // private_peer
    return resource.ownerUserId === userId;
  }
}

/**
 * Tworzy komunikat dla limitu Fair-Play
 */
export function formatFairPlayLimitMessage(
  current: number,
  limit: number,
  type: "bookings" | "hours"
): string {
  const remaining = limit - current;
  const unit = type === "bookings" ? "rezerwacji" : "godzin";
  
  if (remaining <= 0) {
    return `Wykorzystałeś miesięczny limit ${unit} (${limit})`;
  }
  
  const percentage = (current / limit) * 100;
  
  if (percentage >= 80) {
    return `Pozostało ${remaining} ${unit} z limitu ${limit} w tym miesiącu`;
  }
  
  return `Wykorzystano ${current} z ${limit} ${unit} w tym miesiącu`;
}
