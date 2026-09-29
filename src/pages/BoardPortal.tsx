import { useParams } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { AlertTriangle, Building2, Megaphone, Phone, ListTodo } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { issuePriorityLabelPl, issueStatusLabelPl } from "@/lib/triageIssueUi";
import { BoardPortalTaskCard } from "@/components/board-portal/BoardPortalTaskCard";
import {
  isBoardPortalToken,
  useBoardPortal,
  type BoardPortalAnnouncement,
} from "@/hooks/useBoardPortal";

function formatWhen(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return "";
    return format(d, "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return "";
  }
}

function formatUntil(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return "";
    return format(d, "d MMMM yyyy", { locale: pl });
  } catch {
    return "";
  }
}

function msgTypeLabel(t: BoardPortalAnnouncement["msg_type"]): string {
  if (t === "official") return "Oficjalne";
  if (t === "advertisement") return "Reklama";
  if (t === "resident") return "Mieszkaniec";
  return t;
}

export default function BoardPortal() {
  const { token } = useParams<{ token: string }>();
  const tokenOk = isBoardPortalToken(token);
  const { data, isPending, isError, error } = useBoardPortal(token);

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">DOMIO Administracja</p>
            <h1 className="text-lg font-semibold tracking-tight">Portal Zarządu</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {!tokenOk ? (
          <p className="text-sm text-destructive">Link jest nieprawidłowy.</p>
        ) : isPending ? (
          <div className="space-y-4" aria-busy="true">
            <p className="text-sm text-muted-foreground">Ładowanie widoku dla Zarządu…</p>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Nie udało się wczytać portalu Zarządu."}
          </p>
        ) : !data || data.ok === false ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Link wygasł lub został zresetowany</CardTitle>
              <CardDescription>
                Poproś administratora wspólnoty o nowy adres Portalu Zarządu z karty wspólnoty (zakładka Podstawowe).
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <section className="space-y-1">
              <div className="flex items-start gap-2">
                <Building2 className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                <div>
                  <h2 className="text-xl font-semibold leading-tight">
                    {data.property.name?.trim() || data.property.community_name?.trim() || "Wspólnota"}
                  </h2>
                  {data.property.community_name?.trim() &&
                  data.property.community_name.trim() !== (data.property.name ?? "").trim() ? (
                    <p className="text-sm text-foreground/80">{data.property.community_name}</p>
                  ) : null}
                  {data.property.address?.trim() ? (
                    <p className="text-sm text-muted-foreground">{data.property.address}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Widok dla całej wspólnoty</p>
                  )}
                </div>
              </div>
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Megaphone className="h-4 w-4" aria-hidden />
                  Ogłoszenia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.announcements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak opublikowanych ogłoszeń.</p>
                ) : (
                  data.announcements.map((a) => (
                    <article key={a.id} className="rounded-md border border-border/60 p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{msgTypeLabel(a.msg_type)}</Badge>
                        {formatUntil(a.valid_until) ? (
                          <span className="text-xs text-muted-foreground">ważne do {formatUntil(a.valid_until)}</span>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-medium">{a.title}</h3>
                      {a.content.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.content}</p>
                      ) : null}
                    </article>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  Otwarte zgłoszenia
                </CardTitle>
                <CardDescription>Usterki i sprawy w toku dla całej wspólnoty.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak otwartych zgłoszeń.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.issues.map((issue) => (
                      <li key={issue.id} className="rounded-md border border-border/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{issueStatusLabelPl(issue.status)}</Badge>
                          {issue.emergency_mode ? (
                            <Badge variant="destructive">Tryb awaryjny</Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">{issuePriorityLabelPl(issue.priority)}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium">
                          {issue.category?.trim() || "Zgłoszenie"}
                          {issue.location_name?.trim() ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {issue.location_name}
                            </span>
                          ) : null}
                        </p>
                        {issue.description.trim() ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">{issue.description}</p>
                        ) : null}
                        {formatWhen(issue.created_at) ? (
                          <p className="mt-1 text-xs text-muted-foreground">{formatWhen(issue.created_at)}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListTodo className="h-4 w-4" aria-hidden />
                  Zadania (tablica)
                </CardTitle>
                <CardDescription>Tylko zadania oznaczone jako widoczne dla Zarządu.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak zadań udostępnionych Zarządowi.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.tasks.map((task) => (
                      <BoardPortalTaskCard key={task.id} token={token!} task={task} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Phone className="h-4 w-4" aria-hidden />
                  Tablica kontaktów
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak pozycji na tablicy kontaktów.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.contacts.map((c) => (
                      <li key={`${c.sort_order}-${c.label}`} className="text-sm">
                        <p className="font-medium">{c.label}</p>
                        <p className="text-muted-foreground">
                          {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
