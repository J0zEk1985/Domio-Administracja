import { format, parseISO, isValid } from "date-fns";
import { pl } from "date-fns/locale";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROPERTY_CONTRACT_TYPE_LABELS } from "@/schemas/contractSchema";
import type { PropertyContract } from "@/types/contracts";

const plnFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function contractTypeDisplayLabel(row: PropertyContract): string {
  if (row.type === "other") {
    const custom = row.custom_type_name?.trim();
    return custom && custom.length > 0 ? custom : PROPERTY_CONTRACT_TYPE_LABELS.other;
  }
  return PROPERTY_CONTRACT_TYPE_LABELS[row.type];
}

function formatEndDate(iso: string | null | undefined): string {
  if (!iso) return "Czas nieokreślony";
  try {
    const d = parseISO(iso.length > 10 ? iso : `${iso}T12:00:00`);
    if (!isValid(d)) return "Czas nieokreślony";
    return format(d, "d MMM yyyy", { locale: pl });
  } catch {
    return "Czas nieokreślony";
  }
}

function grossSortValue(row: PropertyContract): number {
  const g = row.gross_value;
  if (g == null || Number.isNaN(Number(g))) return 0;
  return Number(g);
}

export const contractsColumns: ColumnDef<PropertyContract>[] = [
  {
    id: "building",
    accessorFn: (row) => row.location?.name?.trim() || "",
    header: "Budynek",
    cell: ({ row }) => (
      <span className="font-medium text-foreground">
        {row.original.location?.name?.trim() || "—"}
      </span>
    ),
  },
  {
    id: "company",
    accessorFn: (row) => row.company?.name?.trim() || "",
    header: "Firma",
    cell: ({ row }) => {
      const name = row.original.company?.name?.trim() || "—";
      const nip = row.original.company?.tax_id?.trim();
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{name}</span>
          {nip ? <span className="text-xs text-muted-foreground">NIP {nip}</span> : null}
        </div>
      );
    },
  },
  {
    id: "type",
    accessorFn: (row) => contractTypeDisplayLabel(row),
    header: "Typ umowy",
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-normal">
        {contractTypeDisplayLabel(row.original)}
      </Badge>
    ),
  },
  {
    id: "gross_value",
    accessorFn: (row) => grossSortValue(row),
    header: ({ column }) => (
      <Button
        type="button"
        variant="ghost"
        className="-ml-3 h-8 gap-1 px-3 font-medium text-muted-foreground hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Kwota brutto
        {column.getIsSorted() === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
        ) : column.getIsSorted() === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
        )}
      </Button>
    ),
    enableSorting: true,
    cell: ({ row }) => {
      const g = row.original.gross_value;
      if (g == null || Number.isNaN(Number(g))) {
        return <span className="tabular-nums text-muted-foreground">—</span>;
      }
      return <span className="tabular-nums text-foreground">{plnFormatter.format(Number(g))}</span>;
    },
  },
  {
    id: "end_date",
    accessorFn: (row) => row.end_date ?? "",
    header: "Koniec umowy",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatEndDate(row.original.end_date)}</span>
    ),
  },
];
