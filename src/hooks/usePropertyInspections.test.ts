import { describe, expect, it } from "vitest";
import {
  PROPERTY_INSPECTIONS_QUERY_ROOT,
  propertyInspectionsQueryKey,
} from "@/hooks/usePropertyInspections";

describe("propertyInspectionsQueryKey", () => {
  it("uses a different third segment for community buildings than the default key", () => {
    const locationId = "building-1";
    const defaultKey = propertyInspectionsQueryKey(locationId);
    const communityKey = propertyInspectionsQueryKey(locationId, {
      communityBuildingIds: ["building-1", "building-2"],
    });

    expect(defaultKey).not.toEqual(communityKey);
    expect(defaultKey[0]).toBe(PROPERTY_INSPECTIONS_QUERY_ROOT);
    expect(communityKey[0]).toBe(PROPERTY_INSPECTIONS_QUERY_ROOT);
  });
});
