import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

import type { PropertyIssue } from "@/hooks/usePropertyIssues";
import {
  issuePriorityBadgeVariant,
  issuePriorityLabelPl,
  issueStatusDotClass,
} from "@/lib/triageIssueUi";
import { propertyIssuePreviewLine } from "@/lib/propertyIssuesGrouping";
import { personInitialsFromName } from "@/lib/personInitials";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type PropertyIssueRowProps = {
  issue: PropertyIssue;
  /** When true, right column shows resolved/completion time instead of created. */
  emphasizeResolution?: boolean;
  onClick: () => void;
};

function assigneeDisplay(issue: PropertyIssue): { label: string; sub?: string } {
  const vendor = issue.delegated_vendor?.name?.trim();
  const staff = issue.assigned_staff?.full_name?.trim();
  if (issue.status === "delegated" && vendor) {
    return { label: vendor, sub: "Partner B2B" };
  }
  if (staff) {
    return { label: staff, sub: "Technik" };
  }
  if (vendor) {
    return { label: vendor, sub: "Partner" };
  }
  return { label: "Nieprzypisane" };
}

function rowTimeLabel(issue: PropertyIssue, emphasizeResolution: boolean): string {
  const iso =
    emphasizeResolution && issue.resolved_at?.trim()
      ? issue.resolved_at
      : issue.created_at?.trim() ?? null;
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true, locale: pl });
}

export function PropertyIssueRow({
  issue,
  emphasizeResolution = false,
  onClick,
}: PropertyIssueRowProps) {
  const { label: assigneeName, sub: assigneeSub } = assigneeDisplay(issue);
  const title = propertyIssuePreviewLine(issue, 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/60 py-3 text-left transition-colors",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <span
        className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", issueStatusDotClass(issue.status))}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={issuePriorityBadgeVariant(issue.priority)} className="text-[10px] font-medium">
            {issuePriorityLabelPl(issue.priority)}
          </Badge>
          <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{title}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 border border-border/50">
            <AvatarFallback className="text-[10px] font-medium">
              {personInitialsFromName(assigneeName)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 max-w-[10rem] text-right sm:block">
            <p className="truncate text-xs font-medium leading-tight">{assigneeName}</p>
            {assigneeSub ? (
              <p className="truncate text-[11px] text-muted-foreground">{assigneeSub}</p>
            ) : null}
          </div>
        </div>
        <div className="w-[6.75rem] shrink-0 text-right text-[11px] leading-tight text-muted-foreground sm:w-[8rem]">
          <span className="block font-medium text-foreground/90">
            {emphasizeResolution ? "Zakończono" : "Utworzono"}
          </span>
          {rowTimeLabel(issue, emphasizeResolution)}
        </div>
      </div>
    </button>
  );
}
