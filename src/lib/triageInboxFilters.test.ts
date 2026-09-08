import { describe, expect, it } from "vitest";
import {
  applyTriageInboxFilters,
  DEFAULT_TRIAGE_INBOX_FILTERS,
  uniqueAssigneeOptions,
} from "@/lib/triageInboxFilters";
import type { TriageIssue } from "@/hooks/useTriageIssues";

function issue(partial: Partial<TriageIssue> & Pick<TriageIssue, "id">): TriageIssue {
  return {
    id: partial.id,
    delegated_vendor_id: null,
    delegated_vendor: null,
    assigned_staff_id: null,
    assigned_staff: null,
    created_at: "2026-09-01T10:00:00.000Z",
    status: "open",
    ...partial,
  } as TriageIssue;
}

describe("uniqueAssigneeOptions", () => {
  it("lists contractor organizations, not technicians", () => {
    const options = uniqueAssigneeOptions([
      issue({
        id: "1",
        delegated_vendor_id: "v1",
        delegated_vendor: { name: "Firma Instalacyjna Sp. z o.o." },
        assigned_staff_id: "s1",
        assigned_staff: { full_name: "Testowy Technik" },
      }),
      issue({
        id: "2",
        assigned_staff_id: "s2",
        assigned_staff: { full_name: "Inny Technik" },
      }),
    ]);

    expect(options).toEqual([
      { kind: "vendor", id: "v1", label: "Firma Instalacyjna Sp. z o.o." },
    ]);
    expect(options.some((o) => o.label.includes("Technik"))).toBe(false);
  });
});

describe("applyTriageInboxFilters", () => {
  it("filters by delegated contractor id", () => {
    const issues = [
      issue({ id: "1", delegated_vendor_id: "v1", delegated_vendor: { name: "A" } }),
      issue({ id: "2", delegated_vendor_id: "v2", delegated_vendor: { name: "B" } }),
    ];
    const filtered = applyTriageInboxFilters(issues, {
      ...DEFAULT_TRIAGE_INBOX_FILTERS,
      assignee: { kind: "vendor", id: "v1" },
    });
    expect(filtered.map((i) => i.id)).toEqual(["1"]);
  });

  it("Otwarte excludes tickets already taken by Serwis", () => {
    const issues = [
      issue({ id: "free", status: "open", assigned_staff_id: null }),
      issue({ id: "taken", status: "open", assigned_staff_id: "tech-1" }),
      issue({ id: "b2b", status: "open", delegated_vendor_id: "v1" }),
      issue({ id: "market", status: "open", is_public_broadcast: true }),
    ];
    const filtered = applyTriageInboxFilters(issues, {
      ...DEFAULT_TRIAGE_INBOX_FILTERS,
      status: "open",
    });
    expect(filtered.map((i) => i.id)).toEqual(["free"]);
  });
});
