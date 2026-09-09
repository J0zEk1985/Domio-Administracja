import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import type { PropertyListRow } from "@/hooks/useProperties";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PropertyLocationCombobox({
  properties,
  isLoading,
  value,
  onChange,
  disabled,
}: {
  properties: PropertyListRow[];
  isLoading: boolean;
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = properties.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="h-10 w-full justify-between font-normal"
        >
          {isLoading ? (
            <Skeleton className="h-4 w-48" />
          ) : (
            <span className="truncate text-left text-sm">
              {selected ? `${selected.name} — ${selected.address}` : "Wybierz budynek…"}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <div className="flex items-center border-b px-2" cmdk-input-wrapper="">
            <Search className="mr-1.5 h-4 w-4 shrink-0 opacity-45" />
            <CmdkInput
              placeholder="Szukaj budynku…"
              className="flex h-10 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-56">
            <CommandGroup>
              {properties.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.address} ${p.id}`}
                  keywords={[p.name, p.address]}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.address}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              Brak budynków.
            </CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
