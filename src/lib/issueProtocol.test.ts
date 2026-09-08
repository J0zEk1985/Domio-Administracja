import { describe, expect, it } from "vitest";
import {
  materialsUsedTotal,
  parseMaterialsUsed,
  parseProtocolFields,
  parseSurchargeKind,
  suggestedInvoiceAmount,
} from "@/lib/issueProtocol";

describe("parseMaterialsUsed", () => {
  it("reads the technician materials array instead of dumping JSON", () => {
    expect(
      parseMaterialsUsed([{ name: "Świetlówka", quantity: 2, unit_cost: 35 }]),
    ).toEqual([{ name: "Świetlówka", quantity: 2, unit_cost: 35 }]);
  });

  it("ignores incomplete rows and non-arrays", () => {
    expect(parseMaterialsUsed(null)).toEqual([]);
    expect(parseMaterialsUsed({ name: "x" })).toEqual([]);
    expect(parseMaterialsUsed([{ name: "", quantity: 1, unit_cost: 1 }])).toEqual([]);
  });
});

describe("protocol totals", () => {
  it("sums materials, labor and surcharge", () => {
    expect(materialsUsedTotal([{ name: "Świetlówka", quantity: 2, unit_cost: 35 }])).toBe(70);
    expect(suggestedInvoiceAmount(70, 150, 0)).toBe(220);
  });
});

describe("parseProtocolFields", () => {
  it("maps billing columns added in the Serwis protocol migration", () => {
    expect(
      parseProtocolFields({
        protocol_number: "0001/2026/TESTOWAFIRMA",
        surcharge_kind: "on_call",
        surcharge_amount: "40.00",
        hourly_rate_applied: 150,
      }),
    ).toEqual({
      protocol_number: "0001/2026/TESTOWAFIRMA",
      surcharge_kind: "on_call",
      surcharge_amount: 40,
      hourly_rate_applied: 150,
    });
    expect(parseSurchargeKind("urgent")).toBe("urgent");
    expect(parseSurchargeKind("standard")).toBeNull();
  });
});
