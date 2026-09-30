import { useEffect, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

import { IssueDetailsPanel } from "@/components/triage/IssueDetailsPanel";
import { TriageIssueListPanel } from "@/components/triage/TriageIssueListPanel";
import { useTriageIssues } from "@/hooks/useTriageIssues";
import {
  applyTriageInboxFilters,
  DEFAULT_TRIAGE_INBOX_FILTERS,
  type TriageInboxFiltersState,
} from "@/lib/triageInboxFilters";
import { cn } from "@/lib/utils";

type CommunityIssuesTabProps = {
  buildingIds: string[];
};

export function CommunityIssuesTab({ buildingIds }: CommunityIssuesTabProps) {
  const { data: issues, isLoading, isError } = useTriageIssues({
    enabled: buildingIds.length > 0,
    locationIds: buildingIds,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TriageInboxFiltersState>(DEFAULT_TRIAGE_INBOX_FILTERS);

  const filteredIssues = useMemo(
    () => applyTriageInboxFilters(issues ?? [], filters),
    [issues, filters],
  );

  const selectedIssue = useMemo(
    () => (issues ?? []).find((i) => i.id === selectedId) ?? null,
    [issues, selectedId],
  );

  useEffect(() => {
    if (!issues?.length) {
      setSelectedId(null);
      return;
    }
    if (filteredIssues.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && filteredIssues.some((i) => i.id === selectedId)) return;
    setSelectedId(filteredIssues[0]!.id);
  }, [issues, filteredIssues, selectedId]);

  if (buildingIds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Dodaj co najmniej jeden budynek do wspólnoty, aby zobaczyć zgłoszenia serwisowe.
      </p>
    );
  }

  return (
    <div className="flex h-[min(70vh,720px)] min-h-[420px] flex-col">
      <PanelGroup direction="horizontal" className="min-h-0 flex-1 rounded-xl border border-border/60 bg-card/30">
        <Panel defaultSize={32} minSize={22} maxSize={48} className="min-w-0 p-3 md:p-4">
          <TriageIssueListPanel
            issues={issues}
            isLoading={isLoading}
            isError={isError}
            selectedId={selectedId}
            onSelectId={setSelectedId}
            filters={filters}
            onFiltersChange={setFilters}
            createIssueDefaultLocationId={buildingIds[0]}
            emptyListMessage="Brak zgłoszeń serwisowych dla budynków tej wspólnoty."
          />
        </Panel>

        <PanelResizeHandle
          className={cn(
            "group relative flex w-3 items-center justify-center bg-border/40 transition-colors hover:bg-border",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/70 group-hover:text-muted-foreground" />
        </PanelResizeHandle>

        <Panel defaultSize={68} minSize={45} className="min-w-0 bg-card p-4 md:p-5">
          <IssueDetailsPanel issue={selectedIssue} />
        </Panel>
      </PanelGroup>
    </div>
  );
}
