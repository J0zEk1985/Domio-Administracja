import { describe, expect, it } from "vitest";

import { propertyBuildingLabel, propertyBuildingParts } from "@/hooks/useProperties";

describe("propertyBuildingLabel", () => {
  it("hides the empty-name placeholder instead of rendering dash + address", () => {
    expect(propertyBuildingLabel("—", "Pienista 51, 94-108 Łódź, Polska")).toBe(
      "Pienista 51, 94-108 Łódź, Polska",
    );
    expect(propertyBuildingParts("—", "Pienista 51").subtitle).toBeNull();
  });

  it("keeps name and address joined when both are real and distinct", () => {
    expect(propertyBuildingLabel("Klatka B", "Pienista 53")).toBe("Klatka B — Pienista 53");
    expect(propertyBuildingParts("Klatka B", "Pienista 53")).toEqual({
      title: "Klatka B",
      subtitle: "Pienista 53",
    });
  });
});
