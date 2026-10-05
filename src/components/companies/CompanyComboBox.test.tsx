import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompanyComboBox } from "@/components/companies/CompanyComboBox";

const LONG_NAME = "SOLID SECURITY SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ";

vi.mock("@/hooks/useCompanies", () => ({
  useCompanies: () => ({ data: [], isPending: false, isFetching: false }),
  useCompanyById: () => ({
    data: {
      id: "company-1",
      name: LONG_NAME,
      tax_id: "5252671234",
    },
    isPending: false,
  }),
}));

vi.mock("@/components/companies/CompanyDialog", () => ({
  CompanyDialog: () => null,
}));

describe("CompanyComboBox", () => {
  it("keeps a long company name inside the trigger instead of expanding the form", () => {
    render(
      <div style={{ width: 320 }}>
        <CompanyComboBox value="company-1" onChange={vi.fn()} />
      </div>,
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger.className).toMatch(/overflow-hidden/);
    expect(trigger.className).toMatch(/min-w-0/);
    expect(trigger.className).toMatch(/max-w-full/);
    expect(screen.getByText(LONG_NAME)).toHaveClass("truncate");
  });
});
