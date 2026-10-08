import type { BookingStatus, ResourceAvailabilityCalendar } from "@/types/sharedResources";

export interface MonthBookingInput {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  unitNumber: string | null;
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthQueryRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

export function bookingOverlapsLocalDay(startsAt: string, endsAt: string, day: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return new Date(startsAt) < dayEnd && new Date(endsAt) > dayStart;
}

export function buildMonthAvailability(
  resourceId: string,
  year: number,
  month: number,
  bookings: MonthBookingInput[],
): ResourceAvailabilityCalendar[] {
  const { start, end } = monthQueryRange(year, month);
  const calendar: ResourceAvailabilityCalendar[] = [];
  const cursor = new Date(start);

  while (cursor < end) {
    const day = new Date(cursor);
    const slots = bookings
      .filter((booking) => bookingOverlapsLocalDay(booking.startsAt, booking.endsAt, day))
      .map((booking) => ({
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        available: false as const,
        bookingId: booking.id,
        status: booking.status,
        unitNumber: booking.unitNumber,
      }));

    calendar.push({
      resourceId,
      date: localDateKey(day),
      slots,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return calendar;
}

export function uniqueMonthBookings(calendar: ResourceAvailabilityCalendar[]) {
  const bookings = new Map<string, ResourceAvailabilityCalendar["slots"][number]>();

  for (const day of calendar) {
    for (const slot of day.slots) {
      if (slot.bookingId && !bookings.has(slot.bookingId)) {
        bookings.set(slot.bookingId, slot);
      }
    }
  }

  return [...bookings.values()].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function datesFromKeys(keys: string[]): Date[] {
  return keys.map((key) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  });
}
