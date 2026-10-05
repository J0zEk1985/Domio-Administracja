import { describe, expect, it } from "vitest";
import type { PropertyContract } from "@/types/contracts";
import {
  comparePropertyContracts,
  filterAndSortPropertyContracts,
  isContractOutdated,
  nextPropertyContractSort,
} from "@/lib/propertyContractsTable";

function row(partial: Partial<PropertyContract> & Pick<PropertyContract, "id">): PropertyContract {
  return {
    location_id: "loc-1",
    company_id: "co-1",
    type: "cleaning",
    contract_number: "1",
    start_date: "2024-01-01",
    end_date: null,
    net_value: 100,
    vat_rate: 23,
    gross_value: 123,
    custom_type_name: null,
    notice_period_months: null,
    currency: "PLN",
    document_url: "",
    created_at: "2024-01-01T00:00:00Z",
    community_id: null,
    ...partial,
  } as PropertyContract;
}

describe("isContractOutdated", () => {
  it("treats open-ended contracts as current", () => {
    expect(isContractOutdated(null, "2026-10-05")).toBe(false);
    expect(isContractOutdated("  ", "2026-10-05")).toBe(false);
  });

  it("treats today as still current", () => {
    expect(isContractOutdated("2026-10-05", "2026-10-05")).toBe(false);
  });

  it("flags dates before today", () => {
    expect(isContractOutdated("2026-10-04", "2026-10-05")).toBe(true);
  });
});

describe("filterAndSortPropertyContracts", () => {
  const rows = [
    row({ id: "a", type: "elevator", company: { name: "Beta" }, gross_value: 100, end_date: "2020-01-01" }),
    row({ id: "b", type: "cleaning", company: { name: "Alfa" }, gross_value: 500, end_date: "2030-01-01" }),
    row({ id: "c", type: "other", custom_type_name: "Ochrona", company: { name: "Ceta" }, gross_value: 250, end_date: null }),
  ];

  it("hides outdated rows when requested", () => {
    const visible = filterAndSortPropertyContracts(rows, {
      hideOutdated: true,
      sortKey: null,
      sortDir: "asc",
      today: "2026-10-05",
    });
    expect(visible.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("sorts by company, type, gross and end date", () => {
    const byCompany = filterAndSortPropertyContracts(rows, {
      hideOutdated: false,
      sortKey: "company",
      sortDir: "asc",
    });
    expect(byCompany.map((r) => r.id)).toEqual(["b", "a", "c"]);

    const byGrossDesc = filterAndSortPropertyContracts(rows, {
      hideOutdated: false,
      sortKey: "gross",
      sortDir: "desc",
    });
    expect(byGrossDesc.map((r) => r.id)).toEqual(["b", "c", "a"]);

    const byEnd = filterAndSortPropertyContracts(rows, {
      hideOutdated: false,
      sortKey: "endDate",
      sortDir: "asc",
    });
    expect(byEnd.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("nextPropertyContractSort", () => {
  it("starts with asc on a new column and toggles direction", () => {
    expect(nextPropertyContractSort(null, "asc", "type")).toEqual({ sortKey: "type", sortDir: "asc" });
    expect(nextPropertyContractSort("type", "asc", "type")).toEqual({ sortKey: "type", sortDir: "desc" });
    expect(nextPropertyContractSort("type", "desc", "company")).toEqual({ sortKey: "company", sortDir: "asc" });
  });
});

describe("comparePropertyContracts", () => {
  it("uses custom type name for other contracts", () => {
    const a = row({ id: "1", type: "other", custom_type_name: "Aaa" });
    const b = row({ id: "2", type: "other", custom_type_name: "Zzz" });
    expect(comparePropertyContracts(a, b, "type")).toBeLessThan(0);
  });
});
