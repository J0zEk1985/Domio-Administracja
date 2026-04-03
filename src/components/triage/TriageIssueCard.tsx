import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import {
  issuePriorityBadgeVariant,
  issuePriorityLabelPl,
  issueStatusDotClass,
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

  const building = issue.location?.name?.trim() || "Budynek bez nazwy";
  const category = issue.category?.trim() || "Bez kategorii";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left shadow-sm transition",
        "hover:border-primary/30 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", issueStatusDotClass(issue.status))}
          title=""
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">{building}</p>
            <Badge variant={issuePriorityBadgeVariant(issue.priority)} className="shrink-0 text-[10px]">
              {issuePriorityLabelPl(issue.priority)}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{category}</p>
          <p className="text-[11px] text-muted-foreground/90">{relative}</p>
        </div>
      </div>
    </button>
  );
}
