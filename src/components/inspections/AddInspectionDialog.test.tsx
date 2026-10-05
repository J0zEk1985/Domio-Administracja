import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Calendar } from "@/components/ui/calendar";
import { AddInspectionDialog } from "@/components/inspections/AddInspectionDialog";
import { validUntilFromPreset } from "@/components/inspections/InspectionDateFields";

vi.mock("@/hooks/usePropertyInspections", () => ({
  useAddInspection: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/components/companies/CompanyComboBox", () => ({
  CompanyComboBox: () => <div data-testid="company-combo" />,
}));

describe("validUntilFromPreset", () => {
  it("adds 3 months, 6 months, 1 year and 5 years from execution date", () => {
    expect(validUntilFromPreset("2026-10-05", 3, 0)).toBe("2027-01-05");
    expect(validUntilFromPreset("2026-10-05", 6, 0)).toBe("2027-04-05");
    expect(validUntilFromPreset("2026-10-05", 0, 1)).toBe("2027-10-05");
    expect(validUntilFromPreset("2026-10-05", 0, 5)).toBe("2031-10-05");
  });
});

describe("AddInspectionDialog", () => {
  it("lets a community inspection cover every building or a chosen subset", () => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    render(
      <AddInspectionDialog
        locationId="loc-1"
        open
        onOpenChange={vi.fn()}
        communityBuildings={[
          { id: "loc-1", name: "—", address: "Pienista 51" },
          { id: "loc-2", name: "Klatka B", address: "Pienista 53" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Wszystkie budynki we wspólnocie")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Tylko wybrane budynki"));
    expect(screen.getByLabelText("Pienista 51")).toBeChecked();
    expect(screen.getByLabelText("Klatka B — Pienista 53")).toBeChecked();
  });

  it("fills valid-until from a preset and offers year dropdown in the calendar", () => {
    render(<AddInspectionDialog locationId="loc-1" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "1 rok" }));
    const validUntil = screen.getByRole("button", { name: "Data ważności" });
    expect(validUntil).toHaveTextContent(/2027/);

    fireEvent.click(validUntil);
    const yearSelect = screen
      .getAllByRole("combobox")
      .find((el) => el instanceof HTMLSelectElement && Array.from(el.options).some((o) => o.value === "2031"));
    expect(yearSelect).toBeTruthy();
  });
});

describe("Calendar", () => {
  it("renders month and year dropdowns", () => {
    render(<Calendar mode="single" />);
    const selects = screen.getAllByRole("combobox").filter((el) => el instanceof HTMLSelectElement);
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const years = selects.find((el) => el instanceof HTMLSelectElement && Array.from(el.options).some((o) => o.value === String(new Date().getFullYear())));
    expect(years).toBeTruthy();
  });
});
