import { useMemo } from "react";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import type { IssueStatus } from "@/lib/triageIssueUi";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TriageIssueCard } from "@/components/triage/TriageIssueCard";
import { Skeleton } from "@/components/ui/skeleton";

export type TriageListFilter = "all" | IssueStatus;

export type TriageIssueListPanelProps = {
  issues: TriageIssue[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelectId: (id: string) => void;
  filter: TriageListFilter;
  onFilterChange: (f: TriageListFilter) => void;
};

function filterIssues(issues: TriageIssue[], f: TriageListFilter): TriageIssue[] {
  if (f === "all") return issues;
  return issues.filter((i) => i.status === f);
}

export function TriageIssueListPanel({
  issues,
  isLoading,
  selectedId,
  onSelectId,
  filter,
  onFilterChange,
}: TriageIssueListPanelProps) {
  const filtered = useMemo(() => filterIssues(issues ?? [], filter), [issues, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 border-r border-border/60 bg-muted/5 pr-3">
      <div className="shrink-0 space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Kolejka</h2>
        <p className="text-xs text-muted-foreground">Zgłoszenia wymagające uwagi koordynatora.</p>
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => onFilterChange(v as TriageListFilter)}
        className="flex min-h-0 flex-1 flex-col gap-2"
      >
        <TabsList className="grid h-auto w-full shrink-0 grid-cols-2 gap-1 bg-muted/60 p-1 lg:grid-cols-3">
          <TabsTrigger value="all" className="text-xs">
            Wszystkie
          </TabsTrigger>
          <TabsTrigger value="new" className="text-xs">
            Nowe
          </TabsTrigger>
          <TabsTrigger value="open" className="text-xs">
            Otwarte
          </TabsTrigger>
          <TabsTrigger value="pending_admin_approval" className="text-xs">
            Akceptacja
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="text-xs">
            W toku
          </TabsTrigger>
          <TabsTrigger value="waiting_for_parts" className="text-xs">
            Części
          </TabsTrigger>
          <TabsTrigger value="delegated" className="col-span-2 text-xs lg:col-span-1">
            Delegowane
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1 pr-2">
          <div className="flex flex-col gap-2 pb-4">
            {isLoading ? (
              <>
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Brak zgłoszeń w tym widoku.
              </p>
            ) : (
              filtered.map((issue) => (
                <TriageIssueCard
                  key={issue.id}
                  issue={issue}
                  selected={issue.id === selectedId}
                  onSelect={() => onSelectId(issue.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
