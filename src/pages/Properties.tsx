import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Building2 } from "lucide-react";
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
import { useProperties } from "@/hooks/useProperties";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

type NameSortDir = "asc" | "desc";

function PropertiesTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Nieruchomość</TableHead>
            <TableHead className="w-[100px] text-center hidden sm:table-cell">Administratorzy</TableHead>
            <TableHead className="w-[140px] text-right">Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-48 mb-1" />
                <Skeleton className="h-3 w-64" />
              </TableCell>
              <TableCell className="hidden sm:table-cell text-center">
                <Skeleton className="h-4 w-8 mx-auto" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-8 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortablePropertyHead({
  direction,
  onToggle,
}: {
  direction: NameSortDir;
  onToggle: () => void;
}) {
  return (
    <TableHead className="p-0">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-3 text-left font-medium",
          "hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onClick={onToggle}
        aria-sort={direction === "asc" ? "ascending" : "descending"}
      >
        <span>Nieruchomość</span>
        {direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}

export default function Properties() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useProperties(true);
  const [search, setSearch] = useState("");
  const [nameSort, setNameSort] = useState<NameSortDir>("asc");

  useEffect(() => {
    if (!isError || !error) return;
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Nie udało się wczytać listy budynków.";
    toast.error(msg);
    console.error("[Properties] query error:", error);
  }, [isError, error]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let rows = !q
      ? [...data]
      : data.filter(
          (r) => r.name.toLowerCase().includes(q) || r.address.toLowerCase().includes(q),
        );
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "pl", { sensitivity: "base" });
      return nameSort === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, search, nameSort]);

  function toggleNameSort() {
    setNameSort((d) => (d === "asc" ? "desc" : "asc"));
  }

  const listEmpty = !data || data.length === 0;
  const searchNoHits = !listEmpty && filtered.length === 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Budynki</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Nieruchomości z aktywnym modułem Administracja (<code className="text-[11px]">cleaning_locations</code>,{" "}
          <code className="text-[11px]">is_admin_active</code>).
        </p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Lista budynków</CardTitle>
          <CardDescription>
            Wyszukiwanie działa lokalnie w przeglądarce. Kliknij wiersz lub przycisk, aby otworzyć kartę nieruchomości.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="search"
            placeholder="Szukaj po nazwie lub adresie…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
            aria-label="Filtruj listę budynków"
          />

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
            <PropertiesTableSkeleton />
          ) : listEmpty ? (
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 py-16 px-6 text-center"
              role="status"
              aria-live="polite"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Brak budynków w administracji</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Nie znaleziono nieruchomości z włączonym modułem Administracja dla tej organizacji.
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
                    <SortablePropertyHead direction={nameSort} onToggle={toggleNameSort} />
                    <TableHead className="w-[100px] text-center hidden sm:table-cell">Administratorzy</TableHead>
                    <TableHead className="w-[140px] text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/properties/${row.id}`)}
                    >
                      <TableCell>
                        <span className="font-medium block">{row.name}</span>
                        <span className="text-xs text-muted-foreground block truncate max-w-[min(100vw-8rem,36rem)]">
                          {row.address}
                        </span>
                        <span className="text-[11px] text-muted-foreground sm:hidden mt-1 block">
                          Administratorzy: {row.adminCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground hidden sm:table-cell">
                        {row.adminCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs border-border/80 hover:bg-accent/40 hover:border-accent/70 hover:text-accent-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/properties/${row.id}`);
                          }}
                        >
                          Szczegóły
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
