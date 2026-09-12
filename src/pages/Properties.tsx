import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { AddBuildingDialog } from "@/components/property/AddBuildingDialog";
import {
  PropertiesTableSkeleton,
  SortablePropertyHead,
  type NameSortDir,
} from "@/components/property/PropertiesTableParts";
import { useProperties, PROPERTIES_QUERY_KEY } from "@/hooks/useProperties";
import { communityQueryKeys } from "@/hooks/useCommunities";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";

async function fetchMyOrgId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_org_id_safe");
  if (error) {
    console.error("[Properties] get_my_org_id_safe:", error);
    return null;
  }
  if (data == null || String(data).trim() === "") return null;
  return String(data);
}

export default function Properties() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgId } = useQuery({
    queryKey: ["my-org-id"],
    queryFn: fetchMyOrgId,
  });
  const { data, isLoading, isError, error, refetch } = useProperties(true);
  const [search, setSearch] = useState("");
  const [nameSort, setNameSort] = useState<NameSortDir>("asc");
  const [addOpen, setAddOpen] = useState(false);

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
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.address.toLowerCase().includes(q) ||
            (r.communityName?.toLowerCase().includes(q) ?? false),
        );
    rows.sort((a, b) => {
      const group = (a.communityName ?? "Żż").localeCompare(b.communityName ?? "Żż", "pl", {
        sensitivity: "base",
      });
      if (group !== 0) return group;
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

  async function handleBuildingAdded(locationId: string) {
    await queryClient.invalidateQueries({ queryKey: [PROPERTIES_QUERY_KEY] });
    await queryClient.invalidateQueries({ queryKey: communityQueryKeys.all });
    navigate(`/properties/${locationId}`);
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Budynki</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Nieruchomości z aktywnym modułem Administracja. Dodaj budynek po adresie z Google Places.
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-2"
          onClick={() => setAddOpen(true)}
          disabled={!orgId}
        >
          <Plus className="h-4 w-4" />
          Dodaj budynek
        </Button>
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
            placeholder="Szukaj po nazwie, adresie lub wspólnocie…"
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
                Nie znaleziono nieruchomości z włączonym modułem Administracja. Dodaj pierwszy budynek.
              </p>
              <Button
                type="button"
                className="mt-1 gap-2"
                onClick={() => setAddOpen(true)}
                disabled={!orgId}
              >
                <Plus className="h-4 w-4" />
                Dodaj budynek
              </Button>
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
                    <TableHead className="hidden md:table-cell">Wspólnota</TableHead>
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
                          {row.communityName ?? "Bez wspólnoty"} · Administratorzy: {row.adminCount}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {row.communityName ?? "Bez wspólnoty"}
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

      {orgId ? (
        <AddBuildingDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          orgId={orgId}
          onSuccess={(id) => void handleBuildingAdded(id)}
        />
      ) : null}
    </div>
  );
}
