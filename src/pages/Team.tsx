import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, ShieldOff, Users } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { AddTeamMemberDialog } from "@/components/team/AddTeamMemberDialog";
import { cn } from "@/lib/utils";

type SortKey = "fullName" | "roleLabelPl";
type SortDir = "asc" | "desc";

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

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <TableHead className="p-0" aria-sort={ariaSort}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-3 text-left font-medium",
          "hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-35" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}

export default function Team() {
  const navigate = useNavigate();
  const { data: ownerAccess, isLoading: ownerLoading, isError: ownerError, error: ownerErr } = useIsOrgOwner();
  const canLoadTeam = ownerAccess?.isOwner === true;
  const { data, isLoading, isError, error, refetch } = useTeamMembers(canLoadTeam);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  function handleSortColumn(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const filteredSorted = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let rows = !q
      ? [...data]
      : data.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q),
        );

    if (sort) {
      rows.sort((a, b) => {
        const va = sort.key === "fullName" ? a.fullName : a.roleLabelPl;
        const vb = sort.key === "fullName" ? b.fullName : b.roleLabelPl;
        const cmp = va.localeCompare(vb, "pl", { sensitivity: "base" });
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, search, sort]);

  if (ownerLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <TeamTableSkeleton />
      </div>
    );
  }

  if (ownerError) {
    return (
      <div className="flex-1 p-6">
        <Alert variant="destructive">
          <AlertDescription>
            {ownerErr instanceof Error
              ? ownerErr.message
              : "Nie udało się zweryfikować uprawnień."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!ownerAccess?.isOwner) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 text-center shadow-sm">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle className="text-base">Brak dostępu</CardTitle>
            <CardDescription>
              Zakładka Zespół jest dostępna wyłącznie dla roli Właściciel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="default" className="w-full">
              <Link to="/dashboard">Wróć do pulpitu</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const listEmpty = !data || data.length === 0;
  const searchNoHits = !listEmpty && filteredSorted.length === 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      <AddTeamMemberDialog open={addMemberOpen} onOpenChange={setAddMemberOpen} />

      <div>
        <h1 className="text-lg font-semibold text-foreground">Zespół</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Osoby z rolami administracyjnymi w Twojej organizacji (bez ról operacyjnych, np. sprzątających).
        </p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Lista pracowników</CardTitle>
          <CardDescription>
            Widoczne role: właściciel, administrator, asystent, księgowa itd. Filtrowanie i sortowanie działają lokalnie w
            przeglądarce.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              type="search"
              placeholder="Szukaj po imieniu, nazwisku lub e-mailu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
              aria-label="Filtruj listę pracowników"
            />
            <Button
              type="button"
              className="shrink-0 gap-2 bg-accent text-accent-foreground hover:bg-accent/90 sm:self-start"
              onClick={() => setAddMemberOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Dodaj pracownika
            </Button>
          </div>

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
          ) : listEmpty ? (
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
                Nie znaleziono aktywnych członkostw z rolami administracyjnymi w tej organizacji.
              </p>
            </div>
          ) : searchNoHits ? (
            <div
              className="rounded-lg border border-dashed border-border/80 bg-muted/10 py-12 text-center text-sm text-muted-foreground"
              role="status"
            >
              Brak wyników dla podanego wyszukiwania.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="Imię i Nazwisko"
                      sortKey="fullName"
                      activeKey={sort?.key ?? null}
                      direction={sort?.dir ?? "asc"}
                      onSort={handleSortColumn}
                    />
                    <TableHead>E-mail</TableHead>
                    <SortableHead
                      label="Rola"
                      sortKey="roleLabelPl"
                      activeKey={sort?.key ?? null}
                      direction={sort?.dir ?? "asc"}
                      onSort={handleSortColumn}
                    />
                    <TableHead className="w-[220px] text-right px-2 py-3">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSorted.map((row) => (
                    <TableRow
                      key={row.membershipId}
                      className="cursor-pointer"
                      onClick={() => navigate(`/team/${row.membershipId}`)}
                    >
                      <TableCell className="font-medium">{row.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email}</TableCell>
                      <TableCell>{row.roleLabelPl}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-xs border-border/80",
                            "hover:bg-accent/40 hover:border-accent/70 hover:text-accent-foreground",
                            "transition-colors",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/team/${row.membershipId}`);
                          }}
                        >
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
