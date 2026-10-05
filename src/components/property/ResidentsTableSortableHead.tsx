import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import type { PropertyOccupantRow } from "@/hooks/usePropertyResidents";
import { cn } from "@/lib/utils";

export type ResidentSortKey = "fullName" | "unitNumber";
export type ResidentSortDir = "asc" | "desc";

export function compareUnitNumbers(a: string, b: string): number {
  return a.localeCompare(b, "pl", { numeric: true, sensitivity: "base" });
}

export function sortPropertyOccupants(
  occupants: PropertyOccupantRow[],
  unitNumberById: Map<string, string>,
  sort: { key: ResidentSortKey; dir: ResidentSortDir }
): PropertyOccupantRow[] {
  const rows = [...occupants];
  rows.sort((a, b) => {
    if (sort.key === "fullName") {
      const cmp = a.fullName.localeCompare(b.fullName, "pl", { sensitivity: "base" });
      if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
      return compareUnitNumbers(unitNumberById.get(a.unitId) ?? "", unitNumberById.get(b.unitId) ?? "");
    }
    const cmp = compareUnitNumbers(unitNumberById.get(a.unitId) ?? "", unitNumberById.get(b.unitId) ?? "");
    if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
    return a.fullName.localeCompare(b.fullName, "pl", { sensitivity: "base" });
  });
  return rows;
}

export function ResidentsTableSortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: ResidentSortKey;
  activeKey: ResidentSortKey;
  direction: ResidentSortDir;
  onSort: (key: ResidentSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <TableHead className="p-0" aria-sort={ariaSort}>
      <button
        type="button"
        className={cn(
          "flex h-8 w-full items-center gap-1.5 px-3 text-left font-medium",
          "hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
