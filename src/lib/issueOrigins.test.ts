import { describe, expect, it } from "vitest";
import { issueSourceLabelPl, isIssueFromCleaningModule, shouldShowCleaningOriginBadge } from "@/lib/issueOrigins";

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

describe("issueSourceLabelPl", () => {
  it("maps known sources to Polish labels", () => {
    expect(issueSourceLabelPl({ source: "serwis" })).toBe("Technik");
    expect(issueSourceLabelPl({ source: "tenant_qr" })).toBe("Kod QR");
    expect(issueSourceLabelPl({ source: "public_qr" })).toBe("Kod QR");
    expect(issueSourceLabelPl({ source: "cleaning" })).toBe("Sprzątanie");
    expect(issueSourceLabelPl({ source: "admin_ui" })).toBe("Administrator");
    expect(issueSourceLabelPl({ source: "dispatcher" })).toBe("Administrator");
    expect(issueSourceLabelPl({ source: "email_ai" })).toBe("E-mail");
    expect(issueSourceLabelPl({ source: "manual" })).toBe("Ręcznie");
  });

  it("falls back to Cleaning when reporter is a cleaner", () => {
    expect(issueSourceLabelPl({ source: "manual", reporter_type: "cleaner" })).toBe("Sprzątanie");
  });
});
