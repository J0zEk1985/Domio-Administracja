import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddWasteScheduleSeriesDialog } from "@/components/communities/AddWasteScheduleSeriesDialog";

const mutate = vi.fn();

vi.mock("@/hooks/useWasteManagement", () => ({
  useCreateWasteSchedules: () => ({ isPending: false, mutate }),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("AddWasteScheduleSeriesDialog", () => {
  it("builds a six-month weekly series and skips unchecked dates", () => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    mutate.mockClear();

    render(
      <AddWasteScheduleSeriesDialog
        locationId="loc-1"
        orgId="org-1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Pierwszy odbiór"), {
      target: { value: "2026-10-08" },
    });

    expect(screen.getByLabelText("Ostatni odbiór")).toHaveValue("2027-04-08");
    expect(screen.getByRole("button", { name: "Dodaj 27 terminów" })).toBeEnabled();
    expect(screen.getByText(/czwartek, 8 października 2026/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /8 października 2026/i }));

    expect(screen.getByRole("button", { name: "Dodaj 26 terminów" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Dodaj 26 terminów" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0] as { collectionDate: string; wasteType: string }[];
    expect(payload).toHaveLength(26);
    expect(payload[0]).toMatchObject({
      locationId: "loc-1",
      orgId: "org-1",
      wasteType: "mixed",
      collectionDate: "2026-10-15",
    });
    expect(payload.some((item) => item.collectionDate === "2026-10-08")).toBe(false);
  });
});
