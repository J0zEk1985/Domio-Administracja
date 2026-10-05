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
