import { describe, expect, it } from "vitest";
import { formatIssueBuildingLabel, formatIssuePlaceLabels } from "@/lib/issueLocationLabel";

describe("formatIssueBuildingLabel", () => {
  it("falls back to address when the building has no display name", () => {
    expect(
      formatIssueBuildingLabel({
        name: null,
        address: "Pienista 51, 94-109 Łódź, Polska",
      }),
    ).toBe("Pienista 51, 94-109 Łódź, Polska");
  });
});

describe("formatIssuePlaceLabels", () => {
  it("keeps the street and the community when name is empty", () => {
    expect(
      formatIssuePlaceLabels({
        name: "  ",
        address: "Pienista 51A, 94-109 Łódź, Polska",
        community: { id: "c1", name: " NOWE POLESIE 3 " },
      }),
    ).toEqual({
      buildingName: "Pienista 51A, 94-109 Łódź, Polska",
      communityId: "c1",
      communityName: "NOWE POLESIE 3",
    });
  });

  it("reads a community embed returned as an array", () => {
    expect(
      formatIssuePlaceLabels({
        name: "Blok A",
        address: null,
        community: [{ id: "c2", name: "Osiedle" }],
      }).communityName,
    ).toBe("Osiedle");
  });

  it("returns no community when the building is unassigned", () => {
    expect(
      formatIssuePlaceLabels({
        name: null,
        address: "ul. Test 1",
        community: null,
      }),
    ).toEqual({
      buildingName: "ul. Test 1",
      communityId: null,
      communityName: null,
    });
  });
});
