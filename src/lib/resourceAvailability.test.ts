import { describe, expect, it } from "vitest";

import {
  bookingOverlapsLocalDay,
  buildMonthAvailability,
  localDateKey,
  monthQueryRange,
  uniqueMonthBookings,
} from "@/lib/resourceAvailability";

describe("buildMonthAvailability", () => {
  it("keeps a booking on the local calendar day it occupies", () => {
    const startsAt = "2026-10-09T07:00:00.000Z";
    const endsAt = "2026-10-09T08:00:00.000Z";
    const start = new Date(startsAt);
    const calendar = buildMonthAvailability("res-1", start.getFullYear(), start.getMonth() + 1, [
      {
        id: "booking-1",
        startsAt,
        endsAt,
        status: "confirmed",
        unitNumber: "12",
      },
    ]);

    const occupied = calendar.find((day) => day.date === localDateKey(start));
    expect(occupied?.slots).toEqual([
      expect.objectContaining({
        bookingId: "booking-1",
        status: "confirmed",
        unitNumber: "12",
      }),
    ]);
    expect(calendar.filter((day) => day.date !== localDateKey(start)).every((day) => day.slots.length === 0)).toBe(true);
  });

  it("marks both local days when a booking crosses midnight", () => {
    const startsAt = new Date(2026, 9, 9, 23, 0, 0).toISOString();
    const endsAt = new Date(2026, 9, 10, 1, 0, 0).toISOString();
    const calendar = buildMonthAvailability("res-1", 2026, 10, [
      {
        id: "booking-2",
        startsAt,
        endsAt,
        status: "pending",
        unitNumber: null,
      },
    ]);

    expect(calendar.find((day) => day.date === "2026-10-09")?.slots).toHaveLength(1);
    expect(calendar.find((day) => day.date === "2026-10-10")?.slots).toHaveLength(1);
    expect(uniqueMonthBookings(calendar)).toHaveLength(1);
  });

  it("treats the month range as a local half-open interval", () => {
    const { start, end } = monthQueryRange(2026, 10);
    const bookingStart = new Date("2026-10-09T07:00:00.000Z");
    expect(bookingStart >= start && bookingStart < end).toBe(true);
    expect(bookingOverlapsLocalDay("2026-10-09T07:00:00.000Z", "2026-10-09T08:00:00.000Z", new Date(bookingStart))).toBe(true);
  });
});
