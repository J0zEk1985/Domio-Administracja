import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTeamMembers } from "@/hooks/useTeamMembers";

function TeamTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Imię i Nazwisko</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Rola</TableHead>
            <TableHead className="w-[200px] text-right">Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-8 w-44" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Team() {
  const { data, isLoading, isError, error, refetch } = useTeamMembers();

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Zespół</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pracownicy przypisani do Twojej organizacji (aktywne członkostwa).
        </p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Lista pracowników</CardTitle>
          <CardDescription>
            Role w obiekcie pochodzą z tabeli członkostw; właściciel może jednocześnie pełnić funkcję administratora
            (osobne wpisy lub rozszerzenia w przyszłych wersjach).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center gap-x-1 gap-y-1">
                <span>
                  {error instanceof Error
                    ? error.message
                    : typeof error === "object" && error !== null && "message" in error
                      ? String((error as { message: unknown }).message)
                      : "Nie udało się wczytać listy."}
                </span>
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => refetch()}>
                  Spróbuj ponownie
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <TeamTableSkeleton />
          ) : !data || data.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 py-16 px-6 text-center"
              role="status"
              aria-live="polite"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Brak przypisanych pracowników</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Gdy dodasz członków organizacji w systemie, pojawią się tutaj wraz z rolami.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imię i Nazwisko</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Rola</TableHead>
                    <TableHead className="w-[220px] text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row.membershipId}>
                      <TableCell className="font-medium">{row.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email}</TableCell>
                      <TableCell>{row.roleLabelPl}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" className="text-xs" disabled>
                          Edytuj / Przypisz budynki
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
