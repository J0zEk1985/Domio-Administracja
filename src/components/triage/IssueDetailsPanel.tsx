import { useEffect, useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Building2, User } from "lucide-react";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import { formatIssueBuildingLabel } from "@/lib/issueLocationLabel";
import { issuePriorityLabelPl, issueReporterTypeLabelPl, issueStatusLabelPl } from "@/lib/triageIssueUi";
import { mergeIssueTimeline } from "@/components/triage/issueTimeline";
import { useIssueLifecycleEvents } from "@/hooks/useIssueLifecycleMutations";
import { TriageIssueActionBar } from "@/components/triage/TriageIssueActionBar";
import { IssuePhotoGallery } from "@/components/triage/IssuePhotoGallery";
import { IssueAfterPhotosStrip } from "@/components/triage/IssueAfterPhotosStrip";
import { IssueProtocolDialog } from "@/components/triage/IssueProtocolDialog";
import { IssueCategorySelect } from "@/components/triage/IssueCategorySelect";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatDt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy, HH:mm", { locale: pl });
}

function formatMoneyPl(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(n));
}

export type IssueDetailsPanelProps = {
  issue: TriageIssue | null;
  /** `triage` — pełny panel z akcjami koordynatora; `property` — podgląd w kontekście nieruchomości (bez paska akcji). */
  variant?: "triage" | "property";
};

export function IssueDetailsPanel({ issue, variant = "triage" }: IssueDetailsPanelProps) {
  const [protocolOpen, setProtocolOpen] = useState(false);
  const showCoordinatorActions = variant === "triage";
  const embedded = variant === "property";
  const { data: lifecycleEvents } = useIssueLifecycleEvents(issue?.id ?? null);

  useEffect(() => {
    setProtocolOpen(false);
  }, [issue?.id]);

  if (!issue) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
          <Building2 className="h-7 w-7" aria-hidden />
        </div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">
          {embedded ? "Brak wybranego zgłoszenia" : "Wybierz zgłoszenie z listy"}
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {embedded
            ? "Wybierz pozycję na liście, aby zobaczyć szczegóły."
            : "Po lewej znajduje się kolejka triage. Kliknij kartę, aby zobaczyć szczegóły, zdjęcia i akcje koordynatorskie."}
        </p>
      </div>
    );
  }

  const reporterName =
    issue.reporter?.full_name?.trim() ||
    issue.reporter_name?.trim() ||
    issue.reporter_email?.trim() ||
    "—";
  const reporterRole = issueReporterTypeLabelPl(issue.reporter_type);
  const reporterOrg = issue.organization?.name?.trim() || null;
  const timeline = mergeIssueTimeline(issue, lifecycleEvents);
  const categoryEditable =
    showCoordinatorActions &&
    issue.status !== "resolved" &&
    issue.status !== "rejected" &&
    issue.status !== "cancelled";

  const inner = (
    <div className="space-y-6 pb-8">
        {showCoordinatorActions ? <TriageIssueActionBar issue={issue} /> : null}

        <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {issue.description?.trim() || "Zgłoszenie bez opisu"}
            </h1>
            <Badge variant="outline" className="font-normal">
              {issueStatusLabelPl(issue.status)}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              Priorytet: {issuePriorityLabelPl(issue.priority)}
            </Badge>
            {issue.is_public_broadcast ? (
              <Badge className="bg-emerald-600/90 font-normal hover:bg-emerald-600">
                {issue.marketplace_scope === "all" ? "Giełda: wszystkie firmy" : "Na giełdzie"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm font-medium text-foreground">
            <span className="text-muted-foreground font-normal">Budynek: </span>
            {formatIssueBuildingLabel(issue.location)}
          </p>
          <div className="flex flex-col gap-1.5 text-sm text-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <span>Utworzono: {formatDt(issue.created_at)}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Kategoria:</span>
              {categoryEditable ? (
                <IssueCategorySelect issue={issue} />
              ) : (
                <span className="font-medium">{issue.category?.trim() || "—"}</span>
              )}
            </span>
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Opis</h2>
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-sm leading-relaxed text-foreground shadow-sm">
            {issue.description?.trim() || "Brak opisu tekstowego."}
          </p>
        </section>

        {issue.status === "resolved" ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Rozwiązanie</h2>
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-4 text-sm">
              {issue.protocol_number ? (
                <p>
                  <span className="text-muted-foreground">Numer protokołu: </span>
                  {issue.protocol_number}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Data rozwiązania: </span>
                {formatDt(issue.resolved_at)}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Koszt robocizny: </span>
                  {formatMoneyPl(issue.labor_cost)}
                </p>
                <p>
                  <span className="text-muted-foreground">Koszt materiałów: </span>
                  {formatMoneyPl(issue.total_material_cost)}
                </p>
              </div>
              {issue.assigned_staff?.full_name?.trim() ? (
                <p>
                  <span className="text-muted-foreground">Przypisany technik: </span>
                  {issue.assigned_staff.full_name}
                </p>
              ) : null}
              {issue.delegated_vendor?.name?.trim() ? (
                <p>
                  <span className="text-muted-foreground">Partner zewnętrzny: </span>
                  {issue.delegated_vendor.name}
                </p>
              ) : null}
              {issue.resolution_notes?.trim() ? (
                <p className="whitespace-pre-wrap pt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Notatka: </span>
                  {issue.resolution_notes.trim()}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {issue.status === "cancelled" ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Anulowanie</h2>
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4 text-sm space-y-2">
              <p>
                <span className="text-muted-foreground">Data: </span>
                {formatDt(issue.cancelled_at)}
              </p>
              {issue.cancel_reason?.trim() ? (
                <p className="whitespace-pre-wrap pt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Powód: </span>
                  {issue.cancel_reason.trim()}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {issue.cancel_requested_at && issue.status !== "cancelled" ? (
          <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-foreground">Wniosek o anulowanie</p>
            <p className="text-muted-foreground">{formatDt(issue.cancel_requested_at)}</p>
            {issue.cancel_request_reason?.trim() ? (
              <p className="mt-1 whitespace-pre-wrap">{issue.cancel_request_reason.trim()}</p>
            ) : null}
          </section>
        ) : null}
        {issue.status === "rejected" ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Odrzucenie</h2>
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4 text-sm space-y-2">
              <p>
                <span className="text-muted-foreground">Data zakończenia: </span>
                {formatDt(issue.resolved_at ?? issue.created_at)}
              </p>
              {issue.resolution_notes?.trim() ? (
                <p className="whitespace-pre-wrap pt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Powód: </span>
                  {issue.resolution_notes.trim()}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
              <User className="h-3.5 w-3.5" />
              Zgłaszający
            </div>
            <p className="mt-1.5 text-sm font-medium text-foreground">{reporterName}</p>
            <p className="text-sm text-foreground/80">Rola: {reporterRole}</p>
            <p className="text-sm text-foreground/80">
              Organizacja: {reporterOrg ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
              Delegacja / serwis
            </div>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              Partner: {issue.delegated_vendor?.name?.trim() ?? "—"}
            </p>
            <p className="text-sm text-foreground/80">
              Przypisany: {issue.assigned_staff?.full_name?.trim() ?? "—"}
            </p>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Zdjęcia</h2>
          {issue.status === "resolved" ? (
            <>
              <IssuePhotoGallery issue={issue} excludeAfter />
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Po realizacji</h3>
                <IssueAfterPhotosStrip issue={issue} onOpenProtocol={() => setProtocolOpen(true)} />
              </div>
            </>
          ) : (
            <IssuePhotoGallery issue={issue} />
          )}
        </section>

        {issue.status === "resolved" ? (
          <IssueProtocolDialog issue={issue} open={protocolOpen} onOpenChange={setProtocolOpen} />
        ) : null}

        <Separator />

        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Historia</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wpisów na osi czasu.</p>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-border pl-4">
              {timeline.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="font-medium text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDt(e.at)}</p>
                  {e.detail ? (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{e.detail}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
    </div>
  );

  if (embedded) {
    return <div className="pr-1">{inner}</div>;
  }

  return <ScrollArea className="h-full min-h-0 pr-3">{inner}</ScrollArea>;
}
