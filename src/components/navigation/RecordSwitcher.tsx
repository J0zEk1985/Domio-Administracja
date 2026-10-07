import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type RecordSwitcherItem = {
  id: string;
  label: string;
  hint?: string | null;
};

type RecordSwitcherProps = {
  currentId: string;
  currentLabel: string;
  items: RecordSwitcherItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
  ariaLabel: string;
  searchPlaceholder: string;
  emptyText: string;
  errorText: string;
};

export function RecordSwitcher({
  currentId,
  currentLabel,
  items,
  open,
  onOpenChange,
  onSelect,
  isLoading,
  isError,
  ariaLabel,
  searchPlaceholder,
  emptyText,
  errorText,
}: RecordSwitcherProps) {
  return (
    <h1 className="min-w-0 text-xl font-semibold tracking-tight text-foreground">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            aria-label={`${ariaLabel}, obecnie ${currentLabel}`}
            className="-ml-2 h-auto min-w-0 max-w-full justify-start gap-1.5 overflow-hidden whitespace-normal px-2 py-1 text-left text-xl font-semibold tracking-tight hover:bg-muted/60"
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              {isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Wczytywanie…</p>
              ) : isError ? (
                <p className="px-3 py-6 text-center text-sm text-destructive">{errorText}</p>
              ) : (
                <>
                  <CommandEmpty>{emptyText}</CommandEmpty>
                  <CommandGroup>
                    {items.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.label} ${item.hint ?? ""}`}
                        onSelect={() => onSelect(item.id)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            currentId === item.id ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{item.label}</span>
                          {item.hint ? (
                            <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>
                          ) : null}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </h1>
  );
}
