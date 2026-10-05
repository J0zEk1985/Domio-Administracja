import { describe, expect, it } from "vitest";
import { contractPropertyDisplay } from "@/lib/contractPropertyLabel";

describe("contractPropertyDisplay", () => {
  it("shows community name and building address when building name is empty", () => {
    const d = contractPropertyDisplay({
      location_id: "loc-1",
      community_id: "com-1",
      community: { id: "com-1", name: "NOWE POLESIE 3" },
      location: { name: "", address: "Pienista 51, 94-109 Łódź, Polska" },
    });
    expect(d.title).toBe("NOWE POLESIE 3");
    expect(d.subtitle).toBe("Pienista 51, 94-109 Łódź, Polska");
    expect(d.href).toBe("/properties/loc-1");
    expect(d.searchText).toContain("nowe polesie 3");
    expect(d.searchText).toContain("pienista");
  });

  it("falls back to nested location.communities when contract.community is missing", () => {
    const d = contractPropertyDisplay({
      location_id: "loc-1",
      location: {
        name: "Klatka A",
        address: "Pienista 51",
        communities: { name: "NOWE POLESIE 3" },
      },
    });
    expect(d.title).toBe("NOWE POLESIE 3");
    expect(d.subtitle).toBe("Klatka A");
  });

  it("uses building address when there is no community and no name", () => {
    const d = contractPropertyDisplay({
      location_id: "loc-1",
      location: { name: "—", address: "Pienista 51" },
    });
    expect(d.title).toBe("Pienista 51");
    expect(d.subtitle).toBeNull();
    expect(d.href).toBe("/properties/loc-1");
  });

  it("links to community when there is no building", () => {
    const d = contractPropertyDisplay({
      community_id: "com-1",
      community: { name: "NOWE POLESIE 3" },
    });
    expect(d.title).toBe("NOWE POLESIE 3");
    expect(d.href).toBe("/communities/com-1");
  });
});
