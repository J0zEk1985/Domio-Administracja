import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Data zgłoszenia";
  const from = format(range.from, "d MMM yyyy", { locale: pl });
  if (!range.to) return `Od ${from}`;
  const to = format(range.to, "d MMM yyyy", { locale: pl });
  return `${from} – ${to}`;
}

export type TriageInboxDateRangeProps = {
  value: DateRange | undefined;
  onChange: (next: DateRange | undefined) => void;
  className?: string;
};

export function TriageInboxDateRange({ value, onChange, className }: TriageInboxDateRangeProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 min-w-[7.5rem] shrink-0 justify-start px-2.5 text-left text-xs font-normal",
            className,
          )}
        >
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          <span className="truncate">{formatRangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={1} initialFocus />
        <div className="flex justify-end border-t border-border/50 px-2 py-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onChange(undefined)}>
            Wyczyść daty
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
