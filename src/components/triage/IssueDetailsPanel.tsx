import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Building2, User } from "lucide-react";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import { issuePriorityLabelPl, issueStatusLabelPl } from "@/lib/triageIssueUi";
import { buildIssueTimeline } from "@/components/triage/issueTimeline";
import { TriageIssueActionBar } from "@/components/triage/TriageIssueActionBar";
import { IssuePhotoGallery } from "@/components/triage/IssuePhotoGallery";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatDt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy, HH:mm", { locale: pl });
}

export type IssueDetailsPanelProps = {
  issue: TriageIssue | null;
  /** `triage` — pełny panel z akcjami koordynatora; `property` — podgląd w kontekście nieruchomości (bez paska akcji). */
  variant?: "triage" | "property";
};

export function IssueDetailsPanel({ issue, variant = "triage" }: IssueDetailsPanelProps) {
  const showCoordinatorActions = variant === "triage";
  const embedded = variant === "property";

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

  const reporter =
    issue.reporter?.full_name?.trim() ||
    issue.reporter_name?.trim() ||
    issue.reporter_email?.trim() ||
    "—";
  const timeline = buildIssueTimeline(issue);
  const isTerminal = issue.status === "resolved" || issue.status === "rejected";

  const inner = (
    <div className="space-y-6 pb-8">
        {showCoordinatorActions ? <TriageIssueActionBar issue={issue} /> : null}

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {issue.location?.name?.trim() || "Budynek bez nazwy"}
            </h1>
            <Badge variant="outline" className="font-normal">
              {issueStatusLabelPl(issue.status)}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              Priorytet: {issuePriorityLabelPl(issue.priority)}
            </Badge>
            {issue.is_public_broadcast ? (
              <Badge className="bg-emerald-600/90 font-normal hover:bg-emerald-600">Na giełdzie</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Utworzono: {formatDt(issue.created_at)} · Kategoria: {issue.category?.trim() || "—"}
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">Opis</h2>
          <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-background/80 p-4 text-sm leading-relaxed text-foreground">
            {issue.description?.trim() || "Brak opisu tekstowego."}
          </p>
        </section>

        {isTerminal ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">
              {issue.status === "rejected" ? "Odrzucenie" : "Zakończenie i wykonawstwo"}
            </h2>
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4 text-sm space-y-2">
              <p>
                <span className="text-muted-foreground">Data zakończenia: </span>
                {formatDt(issue.resolved_at ?? issue.created_at)}
              </p>
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

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Zgłaszający
            </div>
            <p className="mt-1 text-sm">{reporter}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Delegacja / serwis
            </div>
            <p className="mt-1 text-sm">
              Partner: {issue.delegated_vendor?.name?.trim() ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              Przypisany: {issue.assigned_staff?.full_name?.trim() ?? "—"}
            </p>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Zdjęcia (proof of work)</h2>
          <IssuePhotoGallery issue={issue} />
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Daty i historia</h2>
          <ul className="space-y-3">
            <li className="flex gap-3 text-sm">
              <span className="w-36 shrink-0 text-muted-foreground">Utworzono</span>
              <span>{formatDt(issue.created_at)}</span>
            </li>
            <li className="flex gap-3 text-sm">
              <span className="w-36 shrink-0 text-muted-foreground">Start prac</span>
              <span>{formatDt(issue.started_at)}</span>
            </li>
            <li className="flex gap-3 text-sm">
              <span className="w-36 shrink-0 text-muted-foreground">Harmonogram</span>
              <span>{formatDt(issue.scheduled_at)}</span>
            </li>
            <li className="flex gap-3 text-sm">
              <span className="w-36 shrink-0 text-muted-foreground">Rozwiązanie</span>
              <span>{formatDt(issue.resolved_at)}</span>
            </li>
          </ul>

          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Oś czasu
            </h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak dodatkowych wpisów.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-border/80 pl-4">
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
          </div>
        </section>
    </div>
  );

  if (embedded) {
    return <div className="pr-1">{inner}</div>;
  }

  return <ScrollArea className="h-full min-h-0 pr-3">{inner}</ScrollArea>;
}
