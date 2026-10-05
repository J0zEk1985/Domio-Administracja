import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PropertyContractsListCard } from "@/components/property/PropertyContractsListCard";
import type { PropertyContract } from "@/types/contracts";

vi.mock("@/components/contracts/ContractDialog", () => ({
  ContractDialog: () => null,
}));

vi.mock("@/hooks/usePropertyContracts", () => ({
  useDeleteContract: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

function row(partial: Partial<PropertyContract> & Pick<PropertyContract, "id">): PropertyContract {
  return {
    location_id: "loc-1",
    company_id: "co-1",
    type: "cleaning",
    contract_number: "1",
    start_date: "2024-01-01",
    end_date: "2030-12-31",
    net_value: 100,
    vat_rate: 23,
    gross_value: 123,
    custom_type_name: null,
    notice_period_months: null,
    currency: "PLN",
    document_url: "",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    community_id: null,
    ...partial,
  } as PropertyContract;
}

const rows: PropertyContract[] = [
  row({
    id: "expired",
    type: "maintenance",
    company_id: "co-exp",
    company: { name: "Zeta Wygasła" },
    gross_value: 10,
    end_date: "2020-01-01",
  }),
  row({
    id: "active",
    type: "cleaning",
    company_id: "co-act",
    company: { name: "Alfa Aktualna" },
    gross_value: 900,
    end_date: "2030-01-01",
  }),
];

function renderCard(data = rows) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PropertyContractsListCard locationId="loc-1" contractRows={data} isLoading={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PropertyContractsListCard", () => {
  it("highlights expired contracts and can hide them", () => {
    renderCard();

    expect(screen.getByText("Zeta Wygasła")).toBeVisible();
    expect(screen.getByText("Alfa Aktualna")).toBeVisible();
    const expiredRow = screen.getByText("Zeta Wygasła").closest("tr");
    expect(expiredRow?.className).toMatch(/bg-red-50/);

    fireEvent.click(screen.getByLabelText(/Ukryj nieaktualne/));
    expect(screen.queryByText("Zeta Wygasła")).not.toBeInTheDocument();
    expect(screen.getByText("Alfa Aktualna")).toBeVisible();
  });

  it("sorts by company name when the column header is clicked", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /Nazwa firmy/ }));
    const names = screen.getAllByRole("link").map((el) => el.textContent);
    expect(names[0]).toBe("Alfa Aktualna");
    expect(names[1]).toBe("Zeta Wygasła");

    fireEvent.click(screen.getByRole("button", { name: /Nazwa firmy/ }));
    const reversed = screen.getAllByRole("link").map((el) => el.textContent);
    expect(reversed[0]).toBe("Zeta Wygasła");
    expect(reversed[1]).toBe("Alfa Aktualna");
  });
});
