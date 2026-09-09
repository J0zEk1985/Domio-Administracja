import type { TriageIssue } from "@/hooks/useTriageIssues";
import { formatIssueBuildingLabel } from "@/lib/issueLocationLabel";
import {
  issueCoordinatorBucket,
  isMarketplaceWaiting,
  type IssueCoordinatorBucket,
} from "@/lib/triageIssueUi";
import type { DateRange } from "react-day-picker";
import { endOfDay, startOfDay } from "date-fns";

/** Status dropdown — coordinator buckets, not raw DB enum values. */
export type TriageInboxStatusFilter = "all" | IssueCoordinatorBucket;

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
  status: "awaiting_approval",
  building: "all",
  assignee: { kind: "all" },
  dateRange: undefined,
};

function matchesStatusFilter(issue: TriageIssue, status: TriageInboxStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "on_marketplace") return isMarketplaceWaiting(issue);
  return issueCoordinatorBucket(issue) === status;
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
    const name = formatIssueBuildingLabel(i.location);
    map.set(lid, name);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

export type AssigneeOption = { kind: "vendor"; id: string; label: string };

/** Contractor organizations (vendor_partners), never individual technicians. */
export function uniqueAssigneeOptions(issues: TriageIssue[]): AssigneeOption[] {
  const vendors = new Map<string, string>();

  for (const i of issues) {
    const vid = i.delegated_vendor_id;
    const vname = i.delegated_vendor?.name?.trim();
    if (vid && vname) vendors.set(vid, vname);
  }

  return [...vendors.entries()]
    .map(([id, label]) => ({ kind: "vendor" as const, id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));
}
