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

  it("saves irregular dates typed by hand", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Wybrane daty" }));

    fireEvent.change(screen.getByLabelText("Albo wpisz datę"), { target: { value: "2026-10-08" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj datę" }));
    fireEvent.change(screen.getByLabelText("Albo wpisz datę"), { target: { value: "2026-10-17" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj datę" }));
    fireEvent.change(screen.getByLabelText("Albo wpisz datę"), { target: { value: "2026-10-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj datę" }));

    expect(screen.getByText(/8 października 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/17 października 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/27 października 2026/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Usuń czwartek, 8 października 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Dodaj 2 terminy" }));

    const payload = mutate.mock.calls[0][0] as { collectionDate: string; wasteType: string }[];
    expect(payload.map((item) => item.collectionDate)).toEqual(["2026-10-17", "2026-10-27"]);
    expect(payload[0].wasteType).toBe("mixed");
  });

  it("opens hand-picked dates when the waste type is gabaryty", () => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    render(
      <AddWasteScheduleSeriesDialog
        locationId="loc-1"
        orgId="org-1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Typ odpadu"));
    fireEvent.click(screen.getByRole("option", { name: "Gabaryty" }));

    expect(screen.getByRole("button", { name: "Wybrane daty" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Zaznacz daty w kalendarzu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("gridcell", { name: "15" }));
    expect(screen.getByRole("button", { name: /^Usuń / })).toBeInTheDocument();
  });
});
