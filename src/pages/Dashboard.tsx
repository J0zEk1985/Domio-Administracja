import { useState } from "react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDashboardMetrics,
  type DashboardExpiringContract,
  type DashboardExpiringInspection,
  type DashboardMissedCleaning,
  type DashboardOverdueIssue,
} from "@/hooks/useDashboardMetrics";
import { cn } from "@/lib/utils";

const PREVIEW_COUNT = 3;

function formatDueDate(iso: string): string {
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) {
      return "—";
    }
    return format(d, "d MMM yyyy", { locale: pl });
  } catch {
    return "—";
  }
}

function ActionListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {["s1", "s2", "s3", "s4"].map((key) => (
        <li key={key} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full max-w-[14rem]" />
          <Skeleton className="h-3 w-full max-w-[10rem]" />
        </li>
      ))}
    </ul>
  );
}

type DashboardRow =
  | DashboardOverdueIssue
  | DashboardMissedCleaning
  | DashboardExpiringInspection
  | DashboardExpiringContract;

type DetailLinkMode = "issues" | "plain";

function ActionRow({
  row,
  detailMode,
}: {
  row: DashboardRow;
  detailMode: DetailLinkMode;
}) {
  const building = (
    <>
      {row.locationId ? (
        <Link
          to={`/properties/${row.locationId}`}
          className="text-sm font-medium text-primary hover:underline leading-snug mt-0.5 block truncate"
          title={row.buildingName}
        >
          {row.buildingName}
        </Link>
      ) : (
        <span className="text-sm font-medium text-foreground leading-snug mt-0.5 block truncate" title={row.buildingName}>
          {row.buildingName}
        </span>
      )}
    </>
  );

  const detail =
    detailMode === "issues" ? (
      <Link
        to={`/issues?id=${encodeURIComponent(row.id)}`}
        className="text-xs text-muted-foreground mt-1 block truncate hover:text-primary hover:underline text-left w-full"
        title={row.detail}
      >
        {row.detail}
      </Link>
    ) : (
      <p className="text-xs text-muted-foreground mt-1 truncate" title={row.detail}>
        {row.detail}
      </p>
    );

  return (
    <li className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
      <p className="text-xs font-medium text-red-600 tabular-nums">{formatDueDate(row.dueAtIso)}</p>
      {building}
      {detail}
    </li>
  );
}

type ActionCardProps = {
  title: string;
  accentClass: string;
  isLoading: boolean;
  error: Error | null;
  emptyTitle: string;
  emptyMessage: string;
  rows: DashboardRow[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  detailLinkMode: DetailLinkMode;
};

function ActionCard({
  title,
  accentClass,
  isLoading,
  error,
  emptyTitle,
  emptyMessage,
  rows,
  isExpanded,
  onToggleExpanded,
  detailLinkMode,
}: ActionCardProps) {
  const hasOverflow = rows.length > PREVIEW_COUNT;
  const extraRows = hasOverflow ? rows.slice(PREVIEW_COUNT) : [];
  const headRows = hasOverflow ? rows.slice(0, PREVIEW_COUNT) : rows;

  return (
    <Card className={cn("overflow-hidden border-border shadow-sm", accentClass)}>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
        {error ? (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Nie udało się wczytać listy.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <ActionListSkeleton />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center px-2">
            <CheckCircle2 className="h-9 w-9 text-green-600" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{emptyMessage}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            <ul className="space-y-4">
              {headRows.map((row) => (
                <ActionRow key={row.id} row={row} detailMode={detailLinkMode} />
              ))}
            </ul>

            {hasOverflow ? (
              <>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div
                    className={cn("min-h-0 overflow-hidden", !isExpanded && "pointer-events-none select-none")}
                    {...(!isExpanded ? { inert: true } : {})}
                  >
                    <ul className="space-y-4 border-t border-border/50 pt-4">
                      {extraRows.map((row) => (
                        <ActionRow key={row.id} row={row} detailMode={detailLinkMode} />
                      ))}
                    </ul>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 h-8 w-full text-xs"
                  onClick={onToggleExpanded}
                >
                  {isExpanded ? "Zwiń" : `Pokaż wszystkie (${rows.length})`}
                </Button>
              </>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const Dashboard = () => {
  const {
    orgId,
    orgLoading,
    overdueIssues,
    missedCleaning,
    expiringInspections,
    expiringContracts,
  } = useDashboardMetrics();

  const [expandedIssues, setExpandedIssues] = useState(false);
  const [expandedCleaning, setExpandedCleaning] = useState(false);
  const [expandedInspections, setExpandedInspections] = useState(false);
  const [expandedContracts, setExpandedContracts] = useState(false);

  const showOrgWarning = !orgLoading && !orgId;

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Pulpit</h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Wyjątki wymagające uwagi: zaległe zgłoszenia, opóźnione sprzątanie oraz zbliżające się terminy przeglądów i
            umów.
          </p>
        </div>
      </div>

      {showOrgWarning ? (
        <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/40 px-3 py-2">
          Brak przypisanej organizacji — lista zadań nie jest dostępna.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActionCard
          title="Zaległe usterki"
          accentClass="border-l-4 border-l-red-600"
          isLoading={overdueIssues.isLoading}
          error={overdueIssues.error}
          emptyTitle="Wszystkie usterki obsłużone w terminie!"
          emptyMessage="Brak zgłoszeń przekraczających 48 godzin w statusie aktywnym."
          rows={overdueIssues.data}
          isExpanded={expandedIssues}
          onToggleExpanded={() => setExpandedIssues((v) => !v)}
          detailLinkMode="issues"
        />
        <ActionCard
          title="Pominięte zlecenia sprzątania"
          accentClass="border-l-4 border-l-orange-500"
          isLoading={missedCleaning.isLoading}
          error={missedCleaning.error}
          emptyTitle="Plan sprzątania pod kontrolą"
          emptyMessage="Brak niezakończonych zleceń z przeszłym terminem realizacji."
          rows={missedCleaning.data}
          isExpanded={expandedCleaning}
          onToggleExpanded={() => setExpandedCleaning((v) => !v)}
          detailLinkMode="plain"
        />
        <ActionCard
          title="Wygasające przeglądy"
          accentClass="border-l-4 border-l-amber-400"
          isLoading={expiringInspections.isLoading}
          error={expiringInspections.error}
          emptyTitle="Przeglądy na bieżąco"
          emptyMessage="Brak harmonogramów przeglądów w horyzoncie 30 dni wymagających działania."
          rows={expiringInspections.data}
          isExpanded={expandedInspections}
          onToggleExpanded={() => setExpandedInspections((v) => !v)}
          detailLinkMode="plain"
        />
        <ActionCard
          title="Kończące się umowy"
          accentClass="border-l-4 border-l-blue-600"
          isLoading={expiringContracts.isLoading}
          error={expiringContracts.error}
          emptyTitle="Wszystkie umowy mają bezpieczny zapas czasu"
          emptyMessage="Brak umów kończących się w ciągu 45 dni lub wcześniej."
          rows={expiringContracts.data}
          isExpanded={expandedContracts}
          onToggleExpanded={() => setExpandedContracts((v) => !v)}
          detailLinkMode="plain"
        />
      </div>
    </div>
  );
};

export default Dashboard;
