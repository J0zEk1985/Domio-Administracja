import type { TriageIssue } from "@/hooks/useTriageIssues";
import type { IssueStatus } from "@/lib/triageIssueUi";
import { TERMINAL_ISSUE_STATUSES } from "@/lib/triageIssueUi";
import type { DateRange } from "react-day-picker";
import { endOfDay, startOfDay } from "date-fns";

/** Status dropdown (includes aggregate “active only”). */
export type TriageInboxStatusFilter =
  | "all_active"
  | IssueStatus;

export type TriageInboxBuildingFilter = "all" | string;

export type TriageInboxAssigneeFilter =
  | { kind: "all" }
  | { kind: "vendor"; id: string }
  | { kind: "staff"; id: string };

export type TriageInboxFiltersState = {
  status: TriageInboxStatusFilter;
  building: TriageInboxBuildingFilter;
  assignee: TriageInboxAssigneeFilter;
  dateRange: DateRange | undefined;
};

export const DEFAULT_TRIAGE_INBOX_FILTERS: TriageInboxFiltersState = {
  status: "all_active",
  building: "all",
  assignee: { kind: "all" },
  dateRange: undefined,
};

function isTerminalStatus(s: IssueStatus | null | undefined): boolean {
  if (!s) return false;
  return (TERMINAL_ISSUE_STATUSES as readonly string[]).includes(s);
}

function matchesStatusFilter(issue: TriageIssue, status: TriageInboxStatusFilter): boolean {
  const st = issue.status ?? undefined;

  if (status === "all_active") {
    if (!st) return true;
    return !isTerminalStatus(st);
  }

  if (!st) return false;
  return st === status;
}

function matchesBuilding(issue: TriageIssue, building: TriageInboxBuildingFilter): boolean {
  if (building === "all") return true;
  return issue.location_id === building;
}

function matchesAssignee(issue: TriageIssue, assignee: TriageInboxAssigneeFilter): boolean {
  if (assignee.kind === "all") return true;
  if (assignee.kind === "vendor") {
    return issue.delegated_vendor_id === assignee.id;
  }
  return issue.assigned_staff_id === assignee.id;
}

function matchesCreatedRange(issue: TriageIssue, range: DateRange | undefined): boolean {
  if (!range?.from) return true;
  const raw = issue.created_at;
  if (!raw?.trim()) return false;
  const created = new Date(raw);
  if (Number.isNaN(created.getTime())) return false;

  const from = startOfDay(range.from);
  const to = range.to ? endOfDay(range.to) : endOfDay(range.from);
  return created >= from && created <= to;
}

export function applyTriageInboxFilters(
  issues: TriageIssue[],
  filters: TriageInboxFiltersState,
): TriageIssue[] {
  return issues.filter(
    (i) =>
      matchesStatusFilter(i, filters.status) &&
      matchesBuilding(i, filters.building) &&
      matchesAssignee(i, filters.assignee) &&
      matchesCreatedRange(i, filters.dateRange),
  );
}

export type BuildingOption = { id: string; name: string };

export function uniqueBuildingOptions(issues: TriageIssue[]): BuildingOption[] {
  const map = new Map<string, string>();
  for (const i of issues) {
    const lid = i.location_id;
    if (!lid) continue;
    if (map.has(lid)) continue;
    const name = i.location?.name?.trim() || "Budynek";
    map.set(lid, name);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

export type AssigneeOption =
  | { kind: "vendor"; id: string; label: string }
  | { kind: "staff"; id: string; label: string };

export function uniqueAssigneeOptions(issues: TriageIssue[]): AssigneeOption[] {
  const vendors = new Map<string, string>();
  const staff = new Map<string, string>();

  for (const i of issues) {
    const vid = i.delegated_vendor_id;
    const vname = i.delegated_vendor?.name?.trim();
    if (vid && vname) vendors.set(vid, vname);

    const sid = i.assigned_staff_id;
    const sname = i.assigned_staff?.full_name?.trim();
    if (sid && sname) staff.set(sid, sname);
  }

  const out: AssigneeOption[] = [
    ...[...vendors.entries()].map(([id, label]) => ({
      kind: "vendor" as const,
      id,
      label,
    })),
    ...[...staff.entries()].map(([id, label]) => ({
      kind: "staff" as const,
      id,
      label,
    })),
  ];

  out.sort((a, b) => a.label.localeCompare(b.label, "pl"));
  return out;
}
