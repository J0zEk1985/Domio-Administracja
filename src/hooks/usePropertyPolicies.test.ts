import { describe, expect, it } from "vitest";
import {
  PROPERTY_POLICIES_QUERY_ROOT,
  propertyPoliciesQueryKey,
} from "@/hooks/usePropertyPolicies";

describe("propertyPoliciesQueryKey", () => {
  it("uses a different third segment for community scope than the default key", () => {
    const locationId = "building-1";
    const defaultKey = propertyPoliciesQueryKey(locationId);
    const communityKey = propertyPoliciesQueryKey(locationId, {
      communityScope: { communityId: "community-1", buildingIds: ["building-1"] },
    });

    expect(defaultKey).not.toEqual(communityKey);
    expect(defaultKey[0]).toBe(PROPERTY_POLICIES_QUERY_ROOT);
    expect(communityKey[0]).toBe(PROPERTY_POLICIES_QUERY_ROOT);
  });
});
