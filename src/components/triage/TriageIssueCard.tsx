import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import { formatIssueBuildingLabel } from "@/lib/issueLocationLabel";
import { IssueSourceBadge } from "@/components/triage/IssueSourceBadge";
import {
  issueCoordinatorBucket,
  issueCoordinatorBucketDotClass,
  issueCoordinatorBucketLabelPl,
  issuePriorityBadgeVariant,
  issuePriorityLabelPl,
} from "@/lib/triageIssueUi";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TriageIssueCardProps = {
  issue: TriageIssue;
  selected: boolean;
  onSelect: () => void;
};

export function TriageIssueCard({ issue, selected, onSelect }: TriageIssueCardProps) {
  const created = issue.created_at ? new Date(issue.created_at) : null;
  const relative =
    created && !Number.isNaN(created.getTime())
      ? formatDistanceToNow(created, { addSuffix: true, locale: pl })
      : "—";

  const building = formatIssueBuildingLabel(issue.location);
  const category = issue.category?.trim() || "Bez kategorii";
  const bucket = issueCoordinatorBucket(issue);
  const isResolved = bucket === "resolved";
  const isClosed = bucket === "resolved" || bucket === "rejected" || bucket === "cancelled";
  const strikeAddress = bucket === "rejected" || bucket === "cancelled";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left shadow-sm transition",
        "hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isResolved
          ? selected
            ? "border-emerald-500/80 ring-1 ring-emerald-500/40"
            : "border-emerald-500/60 hover:border-emerald-500/80"
          : selected
            ? "border-primary/50 ring-1 ring-primary/30"
            : "border-border/70 hover:border-primary/30",
        isClosed && !isResolved && "opacity-[0.72]",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", issueCoordinatorBucketDotClass(bucket))}
          title={issueCoordinatorBucketLabelPl(bucket)}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm font-semibold leading-tight text-foreground",
                strikeAddress && "line-through decoration-muted-foreground/60",
              )}
            >
              {building}
            </p>
            <Badge variant={issuePriorityBadgeVariant(issue.priority)} className="shrink-0 text-[10px]">
              {issuePriorityLabelPl(issue.priority)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-medium">
              {issueCoordinatorBucketLabelPl(bucket)}
            </Badge>
            <IssueSourceBadge issue={issue} />
          </div>
          <p className="line-clamp-2 text-xs text-foreground/80">
            {issue.description?.trim() || "Brak opisu"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{category}</p>
          <p className="text-[11px] text-muted-foreground/90">{relative}</p>
        </div>
      </div>
    </button>
  );
}
