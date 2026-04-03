import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn("text-sm font-medium text-muted-foreground", className)}>{title}</div>;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn("-ml-3 h-8 gap-1 px-3 font-medium text-muted-foreground hover:text-foreground", className)}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {title}
      {column.getIsSorted() === "desc" ? (
        <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : column.getIsSorted() === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
      )}
    </Button>
  );
}
