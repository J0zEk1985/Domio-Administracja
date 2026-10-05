import { useParams } from "react-router-dom";
import { Building2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BoardPortalTasksCard } from "@/components/board-portal/BoardPortalTasksCard";
import { isBoardPortalToken, useBoardPortal } from "@/hooks/useBoardPortal";

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
            <p className="text-sm text-muted-foreground">Ładowanie zadań dla Zarządu…</p>
            <Skeleton className="h-24 w-full" />
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
                    <p className="text-sm text-muted-foreground">Zadania udostępnione Zarządowi</p>
                  )}
                </div>
              </div>
            </section>

            <BoardPortalTasksCard token={token!} openTasks={data.tasks} />
          </>
        )}
      </main>
    </div>
  );
}
