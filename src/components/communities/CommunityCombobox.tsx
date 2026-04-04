import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { useCommunities } from "@/hooks/useCommunities";

interface CommunityComboboxProps {
  orgId: string | null;
  value: string | null;
  onValueChange: (communityId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

export function CommunityCombobox({
  orgId,
  value,
  onValueChange,
  disabled = false,
  placeholder = "Wybierz wspólnotę…",
  emptyText = "Brak wspólnot.",
  className,
}: CommunityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const { data: communities = [], isPending } = useCommunities(orgId);

  const selected = communities.find((c) => c.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || !orgId || isPending}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Szukaj…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onValueChange(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")}
                />
                Brak (nie przypisano)
              </CommandItem>
              {communities.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.nip ?? ""}`}
                  onSelect={() => {
                    onValueChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
