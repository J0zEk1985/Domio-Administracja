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

  it("hides Serwis tickets until they are sent to Administracja", () => {
    expect(isIssueVisibleInAdminModule({ source: "dispatcher", status: "open" })).toBe(false);
    expect(isIssueVisibleInAdminModule({ source: "serwis", status: "new" })).toBe(false);
    expect(
      isIssueVisibleInAdminModule({
        source: "dispatcher",
        status: "pending_admin_approval",
      }),
    ).toBe(true);
  });

  it("shows Administracja tickets immediately", () => {
    expect(isIssueVisibleInAdminModule({ source: "admin_ui", status: "new" })).toBe(true);
  });

  it("hides Serwis email tickets even when the building is also enrolled in Administracja", () => {
    expect(
      isIssueVisibleInAdminModule({
        source: "email_ai",
        status: "new",
        intake_module: "serwis",
      }),
    ).toBe(false);
  });

  it("shows an Administracja email ticket that still needs a building", () => {
    expect(
      isIssueVisibleInAdminModule({
        source: "email_ai",
        status: "new",
        intake_module: "administracja",
      }),
    ).toBe(true);
  });
});
