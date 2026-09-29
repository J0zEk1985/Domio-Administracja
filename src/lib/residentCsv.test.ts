import { describe, expect, it } from "vitest";
import { normalizeUnitNumber, parseResidentCsv } from "@/lib/residentCsv";

describe("normalizeUnitNumber", () => {
  it("strips a unit prefix and spaces", () => {
    expect(normalizeUnitNumber("  m. 12 ")).toBe("12");
    expect(normalizeUnitNumber("lok. 4")).toBe("4");
  });

  it("returns null for an empty label", () => {
    expect(normalizeUnitNumber("  m. ")).toBeNull();
  });
});

describe("parseResidentCsv", () => {
  it("marks a missing residential unit as one that will be created", () => {
    const result = parseResidentCsv(
      "email,full_name,unit_number\nAnna@Example.com,Anna Nowak,m. 7\n",
      new Set(["1"])
    );
    expect(result.fileError).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowIndex: 2,
      email: "anna@example.com",
      fullName: "Anna Nowak",
      normalizedUnit: "7",
      willCreateUnit: true,
      error: null,
    });
  });

  it("keeps a format error on the source row", () => {
    const result = parseResidentCsv(
      "email,full_name,unit_number\nnie-email,Jan Kowalski,3\n",
      new Set()
    );
    expect(result.rows[0]?.error).toBe("Niepoprawny format e-mail.");
    expect(result.rows[0]?.rowIndex).toBe(2);
  });
});
