import { describe, expect, it } from "vitest";
import { matchServedAddress, type ServedPlace } from "@/lib/inboundAddressMatch";

const warsaw: ServedPlace = {
  id: "admin-1",
  address: "ul. Przykładowa 1",
  name: "Budynek A",
};

const otherStreet: ServedPlace = {
  id: "admin-2",
  address: "ul. Kwiatowa 5, Warszawa",
  name: "Kwiatowa",
};

describe("matchServedAddress", () => {
  it("auto-assigns only an exact folded address in the given module list", () => {
    const result = matchServedAddress("ul. Przykładowa 1", [warsaw, otherStreet]);
    expect(result).toEqual({ outcome: "exact", locationId: "admin-1", candidateIds: [] });
  });

  it("auto-assigns an exact building name", () => {
    const result = matchServedAddress("Budynek A", [warsaw]);
    expect(result.outcome).toBe("exact");
    expect(result.locationId).toBe("admin-1");
  });

  it("holds a longer form of the same premise for an administrator", () => {
    const result = matchServedAddress("ul. Przykładowa 1, 00-001 Warszawa", [warsaw, otherStreet]);
    expect(result.outcome).toBe("review");
    expect(result.locationId).toBeNull();
    expect(result.candidateIds).toEqual(["admin-1"]);
  });

  it("holds a one-letter typo and does not auto-assign it", () => {
    const result = matchServedAddress("ul. Przykładow 1, 00-001 Warszawa", [warsaw]);
    expect(result.outcome).toBe("review");
    expect(result.locationId).toBeNull();
    expect(result.candidateIds).toEqual(["admin-1"]);
  });

  it("rejects a different premise instead of treating it as a typo", () => {
    const result = matchServedAddress("ul. Przykładowa 12, 00-001 Warszawa", [warsaw, otherStreet]);
    expect(result).toEqual({ outcome: "reject", locationId: null, candidateIds: [] });
  });

  it("rejects an address the supplied module does not enroll", () => {
    const result = matchServedAddress("ul. Serwisowa 9", [warsaw, otherStreet]);
    expect(result.outcome).toBe("reject");
  });

  it("holds a missing address for correction instead of accepting it", () => {
    const result = matchServedAddress("  ", [warsaw]);
    expect(result).toEqual({ outcome: "review", locationId: null, candidateIds: [] });
  });

  it("does not auto-assign when two places fold to the same text", () => {
    const duplicate: ServedPlace = { ...warsaw, id: "admin-3", name: "Inny" };
    const result = matchServedAddress("ul. Przykładowa 1", [warsaw, duplicate]);
    expect(result.outcome).toBe("review");
    expect(result.locationId).toBeNull();
    expect(result.candidateIds).toEqual(["admin-1", "admin-3"]);
  });
});
