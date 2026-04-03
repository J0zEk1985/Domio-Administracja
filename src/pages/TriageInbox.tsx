import { useEffect, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

import { useTriageIssues, type TriageIssue } from "@/hooks/useTriageIssues";
import {
  TriageIssueListPanel,
  type TriageListFilter,
} from "@/components/triage/TriageIssueListPanel";
import { IssueDetailsPanel } from "@/components/triage/IssueDetailsPanel";
import { cn } from "@/lib/utils";

function filterIssues(issues: TriageIssue[], f: TriageListFilter): TriageIssue[] {
  if (f === "all") return issues;
  return issues.filter((i) => i.status === f);
}

export default function TriageInbox() {
  const { data: issues, isLoading } = useTriageIssues();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TriageListFilter>("all");

  const selectedIssue = useMemo(
    () => (issues ?? []).find((i) => i.id === selectedId) ?? null,
    [issues, selectedId],
  );

  useEffect(() => {
    const list = issues ?? [];
    if (list.length === 0) {
      setSelectedId(null);
      return;
    }
    const f = filterIssues(list, filter);
    if (f.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && f.some((i) => i.id === selectedId)) return;
    setSelectedId(f[0]!.id);
  }, [issues, filter, selectedId]);

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
            filter={filter}
            onFilterChange={setFilter}
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
