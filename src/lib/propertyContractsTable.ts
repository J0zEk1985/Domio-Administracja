import { contractTypeDisplayLabel } from "@/components/contracts/columns";
import type { PropertyContract } from "@/types/contracts";

export type PropertyContractSortKey = "type" | "company" | "gross" | "endDate";
export type PropertyContractSortDir = "asc" | "desc";

export function localIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Umowa bez daty końca lub z datą >= dzisiaj (lokalny kalendarz) jest aktualna. */
export function isContractOutdated(endDate: string | null | undefined, today = localIsoDate()): boolean {
  if (endDate == null || String(endDate).trim() === "") return false;
  return String(endDate).slice(0, 10) < today;
}

function companyName(row: PropertyContract): string {
  return row.company?.name?.trim() ?? "";
}

function grossValue(row: PropertyContract): number {
  const g = row.gross_value;
  if (g == null || Number.isNaN(Number(g))) return Number.NEGATIVE_INFINITY;
  return Number(g);
}

function endDateSortValue(row: PropertyContract): string {
  const raw = row.end_date;
  if (raw == null || String(raw).trim() === "") return "9999-12-31";
  return String(raw).slice(0, 10);
}

export function comparePropertyContracts(
  a: PropertyContract,
  b: PropertyContract,
  key: PropertyContractSortKey,
): number {
  switch (key) {
    case "type":
      return contractTypeDisplayLabel(a).localeCompare(contractTypeDisplayLabel(b), "pl");
    case "company":
      return companyName(a).localeCompare(companyName(b), "pl");
    case "gross":
      return grossValue(a) - grossValue(b);
    case "endDate":
      return endDateSortValue(a).localeCompare(endDateSortValue(b));
    default:
      return 0;
  }
}

export function filterAndSortPropertyContracts<T extends PropertyContract>(
  rows: T[],
  options: {
    hideOutdated: boolean;
    sortKey: PropertyContractSortKey | null;
    sortDir: PropertyContractSortDir;
    today?: string;
  },
): T[] {
  const today = options.today ?? localIsoDate();
  let list = options.hideOutdated ? rows.filter((row) => !isContractOutdated(row.end_date, today)) : rows.slice();

  if (options.sortKey) {
    const key = options.sortKey;
    const dir = options.sortDir === "desc" ? -1 : 1;
    list = [...list].sort((a, b) => dir * comparePropertyContracts(a, b, key));
  }

  return list;
}

export function nextPropertyContractSort(
  currentKey: PropertyContractSortKey | null,
  currentDir: PropertyContractSortDir,
  clicked: PropertyContractSortKey,
): { sortKey: PropertyContractSortKey; sortDir: PropertyContractSortDir } {
  if (currentKey !== clicked) {
    return { sortKey: clicked, sortDir: "asc" };
  }
  return { sortKey: clicked, sortDir: currentDir === "asc" ? "desc" : "asc" };
}
