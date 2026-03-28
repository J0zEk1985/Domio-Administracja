import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import type { Issue } from "@/data/mock-data";

interface IssuesTabProps {
  issues: Issue[];
}

const statusConfig: Record<Issue["status"], { label: string; className: string }> = {
  open: { label: "Otwarte", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  in_progress: { label: "W trakcie", className: "border-warning/30 bg-warning/10 text-warning" },
  resolved: { label: "Rozwiązane", className: "border-success/30 bg-success/10 text-success" },
};

const IssuesTab = ({ issues }: IssuesTabProps) => {
  return (
    <div className="space-y-1">
      {issues.map((issue) => {
        const sc = statusConfig[issue.status];
        return (
          <div
            key={issue.id}
            className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 transition-colors hover:bg-secondary/50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{issue.title}</span>
                  {issue.is_ai_draft && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Sparkles className="h-3 w-3" />
                      AI Suggested
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Badge variant="outline" className={`text-xs font-medium shrink-0 ${sc.className}`}>
              {sc.label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
};

export default IssuesTab;
