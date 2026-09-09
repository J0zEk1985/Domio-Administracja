import { describe, expect, it } from "vitest";
import { getTriageRoutingLock } from "@/types/issueLifecycle";

describe("getTriageRoutingLock", () => {
  it("treats company marketplace claim as claimed", () => {
    expect(
      getTriageRoutingLock({
        status: "open",
        claimed_by_org_id: "org-1",
        assigned_staff_id: null,
      }),
    ).toBe("claimed_internal");
  });

  it("locks in_progress after start even if claimed by org", () => {
    expect(
      getTriageRoutingLock({
        status: "in_progress",
        claimed_by_org_id: "org-1",
        assigned_staff_id: "tech-1",
        started_at: "2026-09-01T12:00:00.000Z",
      }),
    ).toBe("in_progress");
  });

  it("stays unlocked without staff, vendor or org claim", () => {
    expect(
      getTriageRoutingLock({
        status: "open",
        assigned_staff_id: null,
        claimed_by_org_id: null,
        delegated_vendor_id: null,
      }),
    ).toBe("unlocked");
  });
});
