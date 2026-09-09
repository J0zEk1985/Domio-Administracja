import type { Database } from "@/types/supabase";

type IssueStatusDb = Database["public"]["Enums"]["issue_status_enum"];
export type IssueStatus = IssueStatusDb | "cancelled";
export type IssuePriority = Database["public"]["Enums"]["issue_priority_enum"];

export const TRIAGE_ACTIVE_STATUSES: readonly IssueStatus[] = [
  "new",
  "open",
  "pending_admin_approval",
  "in_progress",
  "waiting_for_parts",
  "delegated",
] as const;

/** Closed / archive statuses (Linear-style “done” column). */
export const TERMINAL_ISSUE_STATUSES: readonly IssueStatus[] = [
  "resolved",
  "rejected",
  "cancelled",
] as const;

export const AWAITING_APPROVAL_STATUSES: readonly IssueStatus[] = [
  "new",
  "pending_admin_approval",
] as const;

export const IN_PROGRESS_BUCKET_STATUSES: readonly IssueStatus[] = [
  "open",
  "in_progress",
  "waiting_for_parts",
  "delegated",
] as const;

/** Coordinator-facing inbox buckets (filter + badges). Not a DB enum. */
export type IssueCoordinatorBucket =
  | "awaiting_approval"
  | "on_marketplace"
  | "in_progress"
  | "resolved"
  | "rejected"
  | "cancelled";

export type MarketplaceWaitingIssue = {
  is_public_broadcast?: boolean | null;
  claimed_by_org_id?: string | null;
  assigned_staff_id?: string | null;
  delegated_vendor_id?: string | null;
};

export function isMarketplaceWaiting(issue: MarketplaceWaitingIssue): boolean {
  if (issue.is_public_broadcast !== true) return false;
  if (issue.claimed_by_org_id) return false;
  if (issue.assigned_staff_id) return false;
  if (issue.delegated_vendor_id) return false;
  return true;
}

export function issueCoordinatorBucket(issue: {
  status?: IssueStatus | string | null;
} & MarketplaceWaitingIssue): IssueCoordinatorBucket | null {
  const st = issue.status ?? undefined;
  if (!st) return null;
  if ((AWAITING_APPROVAL_STATUSES as readonly string[]).includes(st)) return "awaiting_approval";
  if (st === "resolved") return "resolved";
  if (st === "rejected") return "rejected";
  if (st === "cancelled") return "cancelled";
  if (isMarketplaceWaiting(issue)) return "on_marketplace";
  if ((IN_PROGRESS_BUCKET_STATUSES as readonly string[]).includes(st)) return "in_progress";
  return null;
}

export function issueCoordinatorBucketLabelPl(
  bucket: IssueCoordinatorBucket | null | undefined,
): string {
  if (!bucket) return "—";
  const map: Record<IssueCoordinatorBucket, string> = {
    awaiting_approval: "Do akceptacji",
    on_marketplace: "Na giełdzie",
    in_progress: "W realizacji",
    resolved: "Zrealizowane",
    rejected: "Odrzucone",
    cancelled: "Anulowane",
  };
  return map[bucket];
}

/** Extra line under “W realizacji” when the DB status still matters. */
export function issueCoordinatorDetailPl(issue: {
  status?: IssueStatus | string | null;
  assigned_staff_id?: string | null;
  started_at?: string | null;
}): string | null {
  const st = issue.status ?? undefined;
  if (st === "waiting_for_parts") return "Czeka na części";
  if (st === "delegated") return "U partnera B2B";
  if (st === "open" && issue.assigned_staff_id && !issue.started_at) {
    return "Technik nie rozpoczął";
  }
  return null;
}

export function issueStatusLabelPl(status: IssueStatus | null | undefined): string {
  if (!status) return "—";
  const map: Record<IssueStatus, string> = {
    new: "Nowe",
    open: "Otwarte",
    pending_admin_approval: "Oczekuje na akceptację",
    pending_cleaning_review: "W module sprzątania",
    in_progress: "W realizacji",
    waiting_for_parts: "Oczekiwanie na części",
    delegated: "Delegowane (B2B)",
    resolved: "Rozwiązane",
    rejected: "Odrzucone",
    cancelled: "Anulowane",
  };
  return map[status] ?? status;
}

export function issuePriorityLabelPl(p: IssuePriority | null | undefined): string {
  if (!p) return "—";
  if (p === "high" || p === "critical") return "Pilny";
  return "Standardowy";
}

export function issueReporterTypeLabelPl(type: string | null | undefined): string {
  if (!type?.trim()) return "—";
  const key = type.trim().toLowerCase();
  const map: Record<string, string> = {
    administrator: "Dyspozytor",
    admin: "Administrator",
    tenant: "Mieszkaniec",
    cleaner: "Sprzątacz",
  };
  return map[key] ?? type;
}

/** Tailwind color class for status dot on list cards */
export function issueStatusDotClass(status: IssueStatus | null | undefined): string {
  if (!status) return "bg-muted-foreground";
  switch (status) {
    case "new":
      return "bg-sky-500";
    case "open":
      return "bg-blue-500";
    case "pending_admin_approval":
      return "bg-amber-500";
    case "pending_cleaning_review":
      return "bg-amber-500";
    case "in_progress":
      return "bg-emerald-500";
    case "waiting_for_parts":
      return "bg-orange-500";
    case "delegated":
      return "bg-violet-500";
    case "resolved":
      return "bg-muted-foreground";
    case "rejected":
      return "bg-destructive";
    case "cancelled":
      return "bg-muted-foreground";
    default:
      return "bg-muted-foreground";
  }
}

export function issueCoordinatorBucketDotClass(
  bucket: IssueCoordinatorBucket | null | undefined,
): string {
  if (!bucket) return "bg-muted-foreground";
  switch (bucket) {
    case "awaiting_approval":
      return "bg-amber-500";
    case "on_marketplace":
      return "bg-emerald-500";
    case "in_progress":
      return "bg-blue-500";
    case "resolved":
      return "bg-muted-foreground";
    case "rejected":
      return "bg-destructive";
    case "cancelled":
      return "bg-muted-foreground";
    default:
      return "bg-muted-foreground";
  }
}

export function issuePriorityBadgeVariant(
  p: IssuePriority | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (p === "critical" || p === "high") return "destructive";
  return "secondary";
}
