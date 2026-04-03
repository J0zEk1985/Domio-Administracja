import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ClipboardCheck, Search, X } from "lucide-react";

import { globalInspectionsColumns } from "@/components/inspections/global-columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PropertyInspectionGlobalRow } from "@/hooks/useAllInspections";
import {
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPES,
  INSPECTION_TYPE_LABELS,
  type InspectionStatus,
  type InspectionType,
} from "@/schemas/inspectionSchema";

const SKELETON_ROWS = 8;

function executionDateMs(iso: string): number {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
  }
  return new Date(y, m - 1, d).getTime();
}

function locationTypeKey(locationId: string, type: InspectionType): string {
  return `${locationId}\0${type}`;
}

function globalInspectionsFilter(
  row: { original: PropertyInspectionGlobalRow },
  _columnId: string,
  filter: unknown,
): boolean {
  const q = String(filter ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const company = row.original.company?.name?.toLowerCase() ?? "";
  const building = row.original.location?.name?.toLowerCase() ?? "";
  return company.includes(q) || building.includes(q);
}

export function InspectionsDataTable({
  data,
  isLoading,
}: {
  data: PropertyInspectionGlobalRow[];
  isLoading: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "validUntil", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | InspectionType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InspectionStatus>("all");
  const [hideHistorical, setHideHistorical] = useState(false);

  const maxExecutionByLocationType = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data) {
      const key = locationTypeKey(r.location_id, r.type);
      const ms = executionDateMs(r.execution_date);
      const cur = m.get(key);
      if (cur === undefined || ms > cur) {
        m.set(key, ms);
      }
    }
    return m;
  }, [data]);

  const facetedRows = useMemo(() => {
    let rows = data;
    if (hideHistorical) {
      rows = rows.filter((r) => {
        const key = locationTypeKey(r.location_id, r.type);
        const maxMs = maxExecutionByLocationType.get(key);
        return maxMs !== undefined && executionDateMs(r.execution_date) === maxMs;
      });
    }
    if (typeFilter !== "all") {
      rows = rows.filter((r) => r.type === typeFilter);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    return rows;
  }, [data, hideHistorical, maxExecutionByLocationType, typeFilter, statusFilter]);

  const columns = useMemo(() => globalInspectionsColumns, []);

  const table = useReactTable({
    data: isLoading ? [] : facetedRows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: globalInspectionsFilter,
  });

  const filtersActive =
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    hideHistorical ||
    globalFilter.trim().length > 0;

  function clearFilters() {
    setTypeFilter("all");
    setStatusFilter("all");
    setHideHistorical(false);
    setGlobalFilter("");
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <Skeleton className="h-10 w-full max-w-sm" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-[11rem]" />
            <Skeleton className="h-8 w-[10rem]" />
            <Skeleton className="h-8 w-40" />
          </div>
        </div>
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nieruchomość</TableHead>
                <TableHead>Typ przeglądu</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Ważne do</TableHead>
                <TableHead>Wynik</TableHead>
                <TableHead>c-KOB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-28 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-6 rounded-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/5 px-6 py-16 text-center"
        role="status"
      >
        <ClipboardCheck className="h-10 w-10 text-muted-foreground/50" aria-hidden />
        <p className="mt-4 text-sm font-medium text-foreground">Brak przeglądów</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Nie znaleziono przeglądów technicznych dla Twoich nieruchomości. Po dodaniu protokołu na karcie budynku
          wpis pojawi się w tym rejestrze.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            placeholder="Szukaj po budynku lub firmie…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
            aria-label="Szukaj przeglądów"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | InspectionType)}>
            <SelectTrigger className="h-8 w-[min(100%,12rem)] text-xs" aria-label="Filtr typu przeglądu">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Wszystkie typy
              </SelectItem>
              {INSPECTION_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {INSPECTION_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | InspectionStatus)}>
            <SelectTrigger className="h-8 w-[min(100%,11rem)] text-xs" aria-label="Filtr wyniku">
              <SelectValue placeholder="Wynik" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Wszystkie wyniki
              </SelectItem>
              {INSPECTION_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {INSPECTION_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch
              id="inspections-hide-historical"
              checked={hideHistorical}
              onCheckedChange={setHideHistorical}
              className="scale-90"
            />
            <Label
              htmlFor="inspections-hide-historical"
              className="cursor-pointer whitespace-nowrap text-xs font-normal text-muted-foreground"
            >
              Ukryj historyczne
            </Label>
          </div>
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Wyczyść
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-border/60">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-36 text-center">
                  <div className="flex flex-col items-center justify-center gap-1 py-4">
                    <ClipboardCheck className="h-8 w-8 text-muted-foreground/40" aria-hidden />
                    <p className="text-sm font-medium text-foreground">Brak przeglądów spełniających kryteria</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Dostosuj wyszukiwanie, filtry typu i wyniku albo wyłącz ukrywanie wpisów historycznych.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((tableRow) => (
                <TableRow key={tableRow.id}>
                  {tableRow.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
