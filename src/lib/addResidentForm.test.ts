import { describe, expect, it } from "vitest";

import { parseAddResidentForm } from "@/lib/addResidentForm";

const units = [
  {
    kind: "residential" as const,
    unitNumber: "12",
    normalizedUnitNumber: "12",
  },
  {
    kind: "technical" as const,
    unitNumber: "99",
    normalizedUnitNumber: "99",
  },
];

describe("parseAddResidentForm", () => {
  it("assigns an existing residential unit", () => {
    const result = parseAddResidentForm(
      { fullName: "Jan Kowalski", email: "jan@example.com", unitNumber: "12" },
      units
    );
    expect(result).toEqual({
      ok: true,
      fullName: "Jan Kowalski",
      email: "jan@example.com",
      unitNumber: "12",
      willCreateUnit: false,
    });
  });

  it("marks a missing unit for automatic creation", () => {
    const result = parseAddResidentForm(
      { fullName: "Anna Nowak", email: "anna@example.com", unitNumber: "m. 7" },
      units
    );
    expect(result).toEqual({
      ok: true,
      fullName: "Anna Nowak",
      email: "anna@example.com",
      unitNumber: "7",
      willCreateUnit: true,
    });
  });

  it("rejects a technical room number", () => {
    const result = parseAddResidentForm(
      { fullName: "Jan Kowalski", email: "jan@example.com", unitNumber: "99" },
      units
    );
    expect(result).toEqual({ ok: false, error: "Ten numer jest pomieszczeniem technicznym." });
  });

  it("rejects an invalid email", () => {
    const result = parseAddResidentForm(
      { fullName: "Jan Kowalski", email: "nie-email", unitNumber: "12" },
      units
    );
    expect(result.ok).toBe(false);
  });
});
