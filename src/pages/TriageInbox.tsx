import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

import { useTriageIssues } from "@/hooks/useTriageIssues";
import { TriageIssueListPanel } from "@/components/triage/TriageIssueListPanel";
import { IssueDetailsPanel } from "@/components/triage/IssueDetailsPanel";
import {
  applyTriageInboxFilters,
  DEFAULT_TRIAGE_INBOX_FILTERS,
  type TriageInboxFiltersState,
} from "@/lib/triageInboxFilters";
import { cn } from "@/lib/utils";

export default function TriageInbox() {
  const [searchParams] = useSearchParams();
  const { data: issues, isLoading } = useTriageIssues();
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
    const idFromUrl = searchParams.get("id")?.trim();
    if (idFromUrl && issues.some((i) => i.id === idFromUrl)) {
      setSelectedId(idFromUrl);
      return;
    }
    if (filteredIssues.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && filteredIssues.some((i) => i.id === selectedId)) return;
    setSelectedId(filteredIssues[0]!.id);
  }, [issues, filteredIssues, selectedId, searchParams]);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[480px] flex-col gap-4 p-4 md:p-6">
      <header className="shrink-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Triage — skrzynka</h1>
        <p className="text-sm text-muted-foreground">
          Priorytetyzuj zgłoszenia serwisowe: przeglądaj kolejkę, oglądaj zdjęcia i steruj statusem bez
          przełączania kontekstu.
        </p>
      </header>

      <PanelGroup direction="horizontal" className="min-h-0 flex-1 rounded-xl border border-border/60 bg-card/30">
        <Panel defaultSize={30} minSize={22} maxSize={45} className="min-w-0 p-3 md:p-4">
          <TriageIssueListPanel
            issues={issues}
            isLoading={isLoading}
            selectedId={selectedId}
            onSelectId={setSelectedId}
            filters={filters}
            onFiltersChange={setFilters}
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

        <Panel defaultSize={70} minSize={50} className="min-w-0 p-3 md:p-4">
          <IssueDetailsPanel issue={selectedIssue} />
        </Panel>
      </PanelGroup>
    </div>
  );
}
