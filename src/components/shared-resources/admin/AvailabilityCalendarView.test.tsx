import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AvailabilityCalendarView } from "@/components/shared-resources/admin/AvailabilityCalendarView";

vi.mock("@/hooks/useSharedResources", () => ({
  useAvailableResources: () => ({
    data: [{ id: "res-1", name: "Miejsce parkingowe nr 1 dla gości" }],
  }),
  useResourceAvailability: () => ({
    data: [
      {
        resourceId: "res-1",
        date: "2026-10-09",
        slots: [
          {
            startsAt: "2026-10-09T07:00:00.000Z",
            endsAt: "2026-10-09T08:00:00.000Z",
            available: false,
            bookingId: "booking-1",
            status: "confirmed",
            unitNumber: "12",
          },
        ],
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

describe("AvailabilityCalendarView", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("lists a confirmed booking for the selected resource", () => {
    render(<AvailabilityCalendarView communityId="community-1" />);

    expect(screen.getByText("Rezerwacje w tym miesiącu")).toBeInTheDocument();
    expect(screen.getByText("Potwierdzona · Lokal 12")).toBeInTheDocument();
  });
});
