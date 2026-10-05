import { describe, expect, it } from "vitest";

import { compareUnitNumbers, sortPropertyOccupants } from "@/components/property/ResidentsTableSortableHead";
import type { PropertyOccupantRow } from "@/hooks/usePropertyResidents";

function occupant(id: string, unitId: string, fullName: string): PropertyOccupantRow {
  return { id, unitId, fullName, email: `${id}@example.com`, userId: null };
}

describe("sortPropertyOccupants", () => {
  const unitNumberById = new Map([
    ["u2", "2"],
    ["u10", "10"],
    ["u1", "1"],
  ]);
  const occupants = [
    occupant("a", "u10", "Jan Kowalski"),
    occupant("b", "u1", "Adam Nowak"),
    occupant("c", "u2", "Anna Nowak"),
  ];

  it("sorts by unit number numerically by default", () => {
    const sorted = sortPropertyOccupants(occupants, unitNumberById, { key: "unitNumber", dir: "asc" });
    expect(sorted.map((row) => row.fullName)).toEqual(["Adam Nowak", "Anna Nowak", "Jan Kowalski"]);
  });

  it("sorts by full name A-Z", () => {
    const sorted = sortPropertyOccupants(occupants, unitNumberById, { key: "fullName", dir: "asc" });
    expect(sorted.map((row) => row.fullName)).toEqual(["Adam Nowak", "Anna Nowak", "Jan Kowalski"]);
  });

  it("sorts by full name Z-A", () => {
    const sorted = sortPropertyOccupants(occupants, unitNumberById, { key: "fullName", dir: "desc" });
    expect(sorted.map((row) => row.fullName)).toEqual(["Jan Kowalski", "Anna Nowak", "Adam Nowak"]);
  });

  it("compares unit numbers numerically", () => {
    expect(compareUnitNumbers("2", "10")).toBeLessThan(0);
    expect(compareUnitNumbers("12A", "12B")).toBeLessThan(0);
  });
});
