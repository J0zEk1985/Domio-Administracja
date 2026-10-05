import { addMonths, addYears, format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AddInspectionFormValues } from "@/schemas/inspectionSchema";
import { cn } from "@/lib/utils";

const VALIDITY_PRESETS = [
  { label: "3 mies.", months: 3, years: 0 },
  { label: "6 mies.", months: 6, years: 0 },
  { label: "1 rok", months: 0, years: 1 },
  { label: "5 lat", months: 0, years: 5 },
] as const;

function parseFormDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

export function validUntilFromPreset(executionDate: string, months: number, years: number): string {
  const base = parseFormDate(executionDate) ?? new Date();
  let next = base;
  if (months > 0) next = addMonths(next, months);
  if (years > 0) next = addYears(next, years);
  return format(next, "yyyy-MM-dd");
}

export function InspectionDateField({
  name,
  label,
  disabled,
  control,
}: {
  name: "execution_date" | "valid_until";
  label: string;
  disabled: boolean;
  control: Control<AddInspectionFormValues>;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected = parseFormDate(field.value);
        return (
          <FormItem className="flex flex-col">
            <FormLabel>{label}</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                      "h-10 w-full justify-start pl-3 text-left font-normal",
                      !field.value && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" aria-hidden />
                    {selected ? format(selected, "d MMM yyyy", { locale: pl }) : "Wybierz datę"}
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selected}
                  defaultMonth={selected}
                  onSelect={(d) => field.onChange(d ? format(d, "yyyy-MM-dd") : "")}
                  locale={pl}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

export function ValidityPresetButtons({
  executionDate,
  disabled,
  onSelect,
}: {
  executionDate: string;
  disabled: boolean;
  onSelect: (isoDate: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VALIDITY_PRESETS.map((preset) => (
        <Button
          key={preset.label}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 px-2 text-xs"
          onClick={() => onSelect(validUntilFromPreset(executionDate, preset.months, preset.years))}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
