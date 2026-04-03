import type { Database } from "@/types/supabase";

export type IssueStatus = Database["public"]["Enums"]["issue_status_enum"];
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
export const TERMINAL_ISSUE_STATUSES: readonly IssueStatus[] = ["resolved", "rejected"] as const;

export function issueStatusLabelPl(status: IssueStatus | null | undefined): string {
  if (!status) return "—";
  const map: Record<IssueStatus, string> = {
    new: "Nowe",
    open: "Otwarte",
    pending_admin_approval: "Oczekuje na akceptację",
    in_progress: "W realizacji",
    waiting_for_parts: "Oczekiwanie na części",
    delegated: "Delegowane (B2B)",
    resolved: "Rozwiązane",
    rejected: "Odrzucone",
  };
  return map[status] ?? status;
}

export function issuePriorityLabelPl(p: IssuePriority | null | undefined): string {
  if (!p) return "—";
  const map: Record<IssuePriority, string> = {
    low: "Niski",
    medium: "Średni",
    high: "Wysoki",
    critical: "Krytyczny",
  };
  return map[p] ?? p;
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
    default:
      return "bg-muted-foreground";
  }
}

export function issuePriorityBadgeVariant(
  p: IssuePriority | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (p === "critical") return "destructive";
  if (p === "high") return "default";
  if (p === "medium") return "secondary";
  return "outline";
}
