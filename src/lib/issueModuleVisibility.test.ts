import { describe, expect, it } from "vitest";
import { isIssueVisibleInAdminModule } from "@/lib/issueModuleVisibility";

describe("isIssueVisibleInAdminModule", () => {
  it("hides unreleased Cleaning tickets", () => {
    expect(
      isIssueVisibleInAdminModule({
        source: "cleaning",
        released_from_cleaning_at: null,
      }),
    ).toBe(false);
  });

  it("shows Cleaning tickets after hand-off", () => {
    expect(
      isIssueVisibleInAdminModule({
        source: "cleaning",
        released_from_cleaning_at: "2026-09-08T20:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("shows Serwis and Administracja tickets immediately", () => {
    expect(isIssueVisibleInAdminModule({ source: "dispatcher" })).toBe(true);
    expect(isIssueVisibleInAdminModule({ source: "admin_ui" })).toBe(true);
  });
});
