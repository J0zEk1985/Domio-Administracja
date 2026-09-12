import { ArrowDown, ArrowUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type NameSortDir = "asc" | "desc";

export function PropertiesTableSkeleton() {
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

export function SortablePropertyHead({
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
