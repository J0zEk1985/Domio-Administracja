import { describe, expect, it } from "vitest";
import {
  issueCoordinatorBucket,
  issueCoordinatorDetailPl,
  isMarketplaceWaiting,
} from "@/lib/triageIssueUi";

describe("issueCoordinatorBucket", () => {
  it("maps approval statuses", () => {
    expect(issueCoordinatorBucket({ status: "new" })).toBe("awaiting_approval");
    expect(issueCoordinatorBucket({ status: "pending_admin_approval" })).toBe("awaiting_approval");
  });

  it("puts unclaimed broadcast on marketplace, not in progress", () => {
    const waiting = { status: "open" as const, is_public_broadcast: true };
    expect(isMarketplaceWaiting(waiting)).toBe(true);
    expect(issueCoordinatorBucket(waiting)).toBe("on_marketplace");
  });

  it("keeps waiting_for_parts in realization with a detail", () => {
    const issue = { status: "waiting_for_parts" as const };
    expect(issueCoordinatorBucket(issue)).toBe("in_progress");
    expect(issueCoordinatorDetailPl(issue)).toBe("Czeka na części");
  });
});
