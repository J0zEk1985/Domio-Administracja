import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/contracts/DataTableColumnHeader";
import { PROPERTY_CONTRACT_TYPE_LABELS } from "@/schemas/contractSchema";
import type { PropertyContract, PropertyContractType } from "@/types/contracts";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

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

const CONTRACT_TYPE_BADGE_CLASS: Record<PropertyContractType, string> = {
  cleaning: "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  maintenance: "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  administration: "border-violet-500/40 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  elevator: "border-slate-500/40 bg-slate-500/15 text-slate-900 dark:text-slate-100",
  other: "border-teal-500/40 bg-teal-500/10 text-teal-950 dark:text-teal-100",
};

export function isContractStillActive(endDate: string | null | undefined): boolean {
  if (endDate == null || String(endDate).trim() === "") return true;
  const end = String(endDate).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return end >= today;
}

function grossSortValue(row: PropertyContract): number {
  const g = row.gross_value;
  if (g == null || Number.isNaN(Number(g))) return 0;
  return Number(g);
}

function statusSortValue(row: PropertyContract): number {
  return isContractStillActive(row.end_date) ? 1 : 0;
}

export const contractsColumns: ColumnDef<PropertyContract>[] = [
  {
    id: "location",
    accessorFn: (row) => row.location?.name?.trim() || "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nieruchomość" />,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="font-medium text-foreground">
        {row.original.location?.name?.trim() || "—"}
      </span>
    ),
  },
  {
    id: "company",
    accessorFn: (row) => row.company?.name?.trim() || "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Firma" />,
    enableSorting: true,
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
    accessorFn: (row) => row.type,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Typ" />,
    enableSorting: true,
    sortingFn: (rowA, rowB) =>
      contractTypeDisplayLabel(rowA.original).localeCompare(contractTypeDisplayLabel(rowB.original), "pl"),
    cell: ({ row }) => {
      const t = row.original.type;
      return (
        <Badge
          variant="outline"
          className={cn("font-normal", CONTRACT_TYPE_BADGE_CLASS[t])}
        >
          {contractTypeDisplayLabel(row.original)}
        </Badge>
      );
    },
  },
  {
    id: "gross_value",
    accessorFn: (row) => grossSortValue(row),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Wartość" />,
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
    id: "status",
    accessorFn: (row) => statusSortValue(row),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    enableSorting: true,
    cell: ({ row }) => {
      const active = isContractStillActive(row.original.end_date);
      return (
        <Badge
          variant="outline"
          className={cn(
            "font-normal",
            active
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
              : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          {active ? "Aktywna" : "Wygasła"}
        </Badge>
      );
    },
  },
];
