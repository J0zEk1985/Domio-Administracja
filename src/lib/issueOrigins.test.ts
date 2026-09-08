import { describe, expect, it } from "vitest";
import { isIssueFromCleaningModule, shouldShowCleaningOriginBadge } from "@/lib/issueOrigins";

describe("isIssueFromCleaningModule", () => {
  it("tags Cleaning source and cleaner reporter", () => {
    expect(isIssueFromCleaningModule({ source: "cleaning", reporter_type: "tenant" })).toBe(true);
    expect(isIssueFromCleaningModule({ source: "manual", reporter_type: "cleaner" })).toBe(true);
  });

  it("does not tag dispatcher or Serwis tickets", () => {
    expect(isIssueFromCleaningModule({ source: "dispatcher", reporter_type: "cleaner" })).toBe(false);
    expect(isIssueFromCleaningModule({ source: "cleaning", reporter_type: "administrator" })).toBe(false);
    expect(isIssueFromCleaningModule({ source: "serwis", reporter_type: "technik" })).toBe(false);
  });
});

describe("shouldShowCleaningOriginBadge", () => {
  it("follows the same Cleaning origin rule", () => {
    expect(shouldShowCleaningOriginBadge({ source: "cleaning" })).toBe(true);
    expect(shouldShowCleaningOriginBadge({ source: "admin_ui" })).toBe(false);
  });
});
