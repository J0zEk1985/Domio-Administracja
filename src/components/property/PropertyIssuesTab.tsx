import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";

import { usePropertyIssues, type PropertyIssue } from "@/hooks/usePropertyIssues";
import {
  groupPropertyIssues,
  filterPropertyIssuesBySearch,
  type PropertyIssueGroupKey,
} from "@/lib/propertyIssuesGrouping";
import { IssueDetailsPanel } from "@/components/triage/IssueDetailsPanel";
import { PropertyIssueRow } from "@/components/property/PropertyIssueRow";
import { NewPropertyIssueDialog } from "@/components/property/NewPropertyIssueDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const GROUP_META: Record<
  PropertyIssueGroupKey,
  { title: string; subtitle: string; emphasizeResolution: boolean }
> = {
  triage: {
    title: "Oczekujące na akcję",
    subtitle: "Triage — nowe zgłoszenia i oczekujące na decyzję administracji.",
    emphasizeResolution: false,
  },
  active: {
    title: "W trakcie realizacji",
    subtitle: "Otwarte, w realizacji, oczekiwanie na części lub delegacja do partnera.",
    emphasizeResolution: false,
  },
  done: {
    title: "Zakończone / archiwum",
    subtitle: "Rozwiązane lub odrzucone — podgląd historii wykonawstwa.",
    emphasizeResolution: true,
  },
};

const GROUP_ORDER: PropertyIssueGroupKey[] = ["triage", "active", "done"];

export type PropertyIssuesTabProps = {
  locationId: string;
};

export function PropertyIssuesTab({ locationId }: PropertyIssuesTabProps) {
  const { data: issues = [], isLoading, isError, error, refetch } = usePropertyIssues(locationId);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeIssue, setActiveIssue] = useState<PropertyIssue | null>(null);

  const filtered = useMemo(
    () => filterPropertyIssuesBySearch(issues, search),
    [issues, search],
  );

  const grouped = useMemo(() => groupPropertyIssues(filtered), [filtered]);

  function openIssue(issue: PropertyIssue) {
    setActiveIssue(issue);
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po opisie lub kategorii…"
            className="h-10 pl-9"
            aria-label="Szukaj zgłoszeń"
          />
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nowe zgłoszenie
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wczytywanie zgłoszeń…
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Nie udało się wczytać listy.</p>
          <p className="mt-1 text-muted-foreground">
            {error instanceof Error ? error.message : "Spróbuj ponownie."}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Odśwież
          </Button>
        </div>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </div>
          <h3 className="mt-4 text-base font-semibold">Brak zgłoszeń dla tego budynku</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Gdy pojawią się usterki z aplikacji serwisowej lub dodasz je ręcznie, zobaczysz je tutaj w układzie
            pogrupowanym według statusu.
          </p>
          <Button type="button" className="mt-6 gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Dodaj pierwsze zgłoszenie
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Brak wyników dla „{search.trim()}”. Wyczyść wyszukiwarkę lub zmień frazę.
        </p>
      ) : (
        <div className="space-y-10">
          {GROUP_ORDER.map((key) => {
            const rows = grouped[key];
            if (rows.length === 0) return null;
            const meta = GROUP_META[key];
            return (
              <section key={key} className="space-y-2">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">{meta.title}</h3>
                  <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-border/60 bg-card/30">
                  {rows.map((issue) => (
                    <PropertyIssueRow
                      key={issue.id}
                      issue={issue}
                      emphasizeResolution={meta.emphasizeResolution}
                      onClick={() => openIssue(issue)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <NewPropertyIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        locationId={locationId}
      />

      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setActiveIssue(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl md:max-w-2xl"
        >
          <SheetHeader className="border-b border-border/60 px-6 py-4 text-left">
            <SheetTitle className="text-base font-semibold">Szczegóły zgłoszenia</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <IssueDetailsPanel issue={activeIssue} variant="property" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
