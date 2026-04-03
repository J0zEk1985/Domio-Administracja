import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { FileText, Search, X } from "lucide-react";

import { contractsColumns } from "@/components/contracts/columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROPERTY_CONTRACT_TYPES, PROPERTY_CONTRACT_TYPE_LABELS } from "@/schemas/contractSchema";
import type { PropertyContract, PropertyContractType } from "@/types/contracts";
import { cn } from "@/lib/utils";

const SKELETON_ROWS = 6;

function globalContractsFilter(row: { original: PropertyContract }, _columnId: string, filter: unknown): boolean {
  const q = String(filter ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const company = row.original.company?.name?.toLowerCase() ?? "";
  const building = row.original.location?.name?.toLowerCase() ?? "";
  return company.includes(q) || building.includes(q);
}

export function ContractsDataTable({
  data,
  isLoading,
}: {
  data: PropertyContract[];
  isLoading: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<PropertyContractType[]>([]);

  const filteredByType = useMemo(() => {
    if (selectedTypes.length === 0) return data;
    return data.filter((row) => selectedTypes.includes(row.type));
  }, [data, selectedTypes]);

  const columns = useMemo(() => contractsColumns, []);

  const table = useReactTable({
    data: isLoading ? [] : filteredByType,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: globalContractsFilter,
  });

  function toggleTypeFacet(t: PropertyContractType) {
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function clearFacets() {
    setSelectedTypes([]);
  }

  const filtersActive = selectedTypes.length > 0 || globalFilter.trim().length > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Skeleton className="h-10 w-full max-w-sm" />
          <div className="flex flex-wrap gap-2">
            {PROPERTY_CONTRACT_TYPES.map((t) => (
              <Skeleton key={t} className="h-9 w-24 rounded-md" />
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nieruchomość</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Wartość</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-16 rounded-full" />
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
        <FileText className="h-10 w-10 text-muted-foreground/50" aria-hidden />
        <p className="mt-4 text-sm font-medium text-foreground">Brak umów</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Nie znaleziono umów przypisanych do Twoich nieruchomości. Po dodaniu umowy na karcie budynku pojawi się ona
          tutaj.
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
            placeholder="Szukaj po firmie lub nieruchomości…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
            aria-label="Szukaj umów"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Typ umowy:</span>
          {PROPERTY_CONTRACT_TYPES.map((t) => {
            const on = selectedTypes.includes(t);
            return (
              <Button
                key={t}
                type="button"
                variant={on ? "secondary" : "outline"}
                size="sm"
                className={cn("h-8 rounded-full text-xs font-normal", on && "ring-1 ring-ring/40")}
                onClick={() => toggleTypeFacet(t)}
              >
                {PROPERTY_CONTRACT_TYPE_LABELS[t]}
              </Button>
            );
          })}
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={() => {
                clearFacets();
                setGlobalFilter("");
              }}
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
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-1 py-4">
                    <FileText className="h-8 w-8 text-muted-foreground/40" aria-hidden />
                    <p className="text-sm font-medium text-foreground">Brak wyników</p>
                    <p className="text-sm text-muted-foreground">Dostosuj wyszukiwanie lub filtry typu umowy.</p>
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
