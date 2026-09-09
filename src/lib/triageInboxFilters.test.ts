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
    claimed_by_org_id: null,
    is_public_broadcast: false,
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
      status: "all",
      assignee: { kind: "vendor", id: "v1" },
    });
    expect(filtered.map((i) => i.id)).toEqual(["1"]);
  });

  it("Do akceptacji includes new and pending approval only", () => {
    const issues = [
      issue({ id: "new", status: "new" }),
      issue({ id: "pending", status: "pending_admin_approval" }),
      issue({ id: "open", status: "open" }),
    ];
    const filtered = applyTriageInboxFilters(issues, {
      ...DEFAULT_TRIAGE_INBOX_FILTERS,
      status: "awaiting_approval",
    });
    expect(filtered.map((i) => i.id)).toEqual(["new", "pending"]);
  });

  it("Na giełdzie is only an unclaimed broadcast", () => {
    const issues = [
      issue({ id: "waiting", status: "open", is_public_broadcast: true }),
      issue({
        id: "claimed",
        status: "open",
        is_public_broadcast: true,
        claimed_by_org_id: "org-1",
      }),
      issue({
        id: "staff",
        status: "open",
        is_public_broadcast: true,
        assigned_staff_id: "tech-1",
      }),
      issue({ id: "free", status: "open" }),
    ];
    const onMarket = applyTriageInboxFilters(issues, {
      ...DEFAULT_TRIAGE_INBOX_FILTERS,
      status: "on_marketplace",
    });
    const inProgress = applyTriageInboxFilters(issues, {
      ...DEFAULT_TRIAGE_INBOX_FILTERS,
      status: "in_progress",
    });
    expect(onMarket.map((i) => i.id)).toEqual(["waiting"]);
    expect(inProgress.map((i) => i.id).sort()).toEqual(["claimed", "free", "staff"]);
  });

  it("Wszystkie includes terminal statuses", () => {
    const issues = [
      issue({ id: "open", status: "open" }),
      issue({ id: "done", status: "resolved" }),
      issue({ id: "rej", status: "rejected" }),
      issue({ id: "can", status: "cancelled" }),
    ];
    const filtered = applyTriageInboxFilters(issues, {
      ...DEFAULT_TRIAGE_INBOX_FILTERS,
      status: "all",
    });
    expect(filtered.map((i) => i.id)).toEqual(["open", "done", "rej", "can"]);
  });
});
