import type { IssueStatus } from "@/lib/triageIssueUi";
import type { PropertyIssue } from "@/hooks/usePropertyIssues";

export const PROPERTY_ISSUE_GROUP_KEYS = ["triage", "active", "done"] as const;
export type PropertyIssueGroupKey = (typeof PROPERTY_ISSUE_GROUP_KEYS)[number];

export const TRIAGE_QUEUE_STATUSES: readonly IssueStatus[] = ["new", "pending_admin_approval"];
export const IN_FLIGHT_STATUSES: readonly IssueStatus[] = [
  "open",
  "in_progress",
  "waiting_for_parts",
  "delegated",
];
export const ARCHIVE_STATUSES: readonly IssueStatus[] = ["resolved", "rejected"];

export function issueGroupKey(status: IssueStatus | null | undefined): PropertyIssueGroupKey | null {
  if (!status) return null;
  if ((TRIAGE_QUEUE_STATUSES as readonly string[]).includes(status)) return "triage";
  if ((IN_FLIGHT_STATUSES as readonly string[]).includes(status)) return "active";
  if ((ARCHIVE_STATUSES as readonly string[]).includes(status)) return "done";
  return null;
}

/** Search in description and category (property_issues has no title column). */
export function matchesPropertyIssueSearch(issue: PropertyIssue, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const desc = (issue.description ?? "").toLowerCase();
  const cat = (issue.category ?? "").toLowerCase();
  return desc.includes(q) || cat.includes(q);
}

export function filterPropertyIssuesBySearch(
  issues: PropertyIssue[],
  query: string,
): PropertyIssue[] {
  if (!query.trim()) return issues;
  return issues.filter((i) => matchesPropertyIssueSearch(i, query));
}

export function groupPropertyIssues(issues: PropertyIssue[]): Record<PropertyIssueGroupKey, PropertyIssue[]> {
  const grouped: Record<PropertyIssueGroupKey, PropertyIssue[]> = {
    triage: [],
    active: [],
    done: [],
  };
  for (const issue of issues) {
    const g = issueGroupKey(issue.status ?? undefined);
    if (g) grouped[g].push(issue);
    else grouped.triage.push(issue);
  }
  return grouped;
}

/** Single-line preview: category + truncated description */
export function propertyIssuePreviewLine(issue: PropertyIssue, maxLen = 120): string {
  const cat = issue.category?.trim();
  const desc = issue.description?.trim() ?? "";
  const snippet = desc.length > maxLen ? `${desc.slice(0, maxLen).trim()}…` : desc;
  if (cat && snippet) return `${cat} — ${snippet}`;
  if (snippet) return snippet;
  if (cat) return cat;
  return "Zgłoszenie bez opisu";
}
