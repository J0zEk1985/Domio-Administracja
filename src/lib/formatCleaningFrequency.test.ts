import { describe, expect, it } from "vitest";
import { formatCleaningFrequency } from "@/lib/formatCleaningFrequency";

describe("formatCleaningFrequency", () => {
  it("uses frequency text when config is missing", () => {
    expect(formatCleaningFrequency("Codziennie", null)).toBe("Codziennie");
    expect(formatCleaningFrequency(null, null)).toBe("—");
  });

  it("maps known types", () => {
    expect(formatCleaningFrequency(null, { type: "daily" })).toBe("Codziennie");
    expect(formatCleaningFrequency(null, { type: "work_days" })).toBe(
      "Codziennie w dni robocze (Pn–Pt)",
    );
  });

  it("lists specific weekdays", () => {
    expect(formatCleaningFrequency(null, { type: "specific_days", days: [0, 2, 4] })).toBe(
      "Pon, Śr, Pt",
    );
  });

  it("prefers custom text", () => {
    expect(formatCleaningFrequency(null, { type: "custom", text: "Co 10 dni" })).toBe("Co 10 dni");
  });
});
