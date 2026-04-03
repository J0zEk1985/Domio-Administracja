import { useEffect, useState } from "react";
import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import { useOrgAssignableStaff, type AssignableStaffRow } from "@/hooks/useOrgAssignableStaff";
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

const SEARCH_DEBOUNCE_MS = 250;

export interface StaffAssignComboboxProps {
  value: string;
  onPick: (staff: AssignableStaffRow) => void;
  disabled?: boolean;
  placeholder?: string;
}

function filterLocal(rows: AssignableStaffRow[], q: string): AssignableStaffRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter(
    (r) =>
      r.fullName.toLowerCase().includes(s) ||
      r.email.toLowerCase().includes(s) ||
      r.roleLabelPl.toLowerCase().includes(s),
  );
}

export function StaffAssignCombobox({
  value,
  onPick,
  disabled = false,
  placeholder = "Przypisz pracownika…",
}: StaffAssignComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputQuery, setInputQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(inputQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [inputQuery]);

  const { data: staff = [], isPending, isFetching } = useOrgAssignableStaff(open);

  const filtered = filterLocal(staff, debouncedQuery);
  const selected = staff.find((s) => s.userId === value);

  const listInitialLoad = isPending && staff.length === 0;
  const showSearchSpinner = isFetching && !listInitialLoad;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setInputQuery("");
          setDebouncedQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 min-w-[10rem] justify-between font-normal"
        >
          {listInitialLoad && value ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span className="truncate text-left text-sm">
              {selected?.fullName ?? placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false} className="rounded-md border-0 shadow-none">
          <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
            {showSearchSpinner ? (
              <Loader2
                className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : (
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
            )}
            <CmdkInput
              className={cn(
                "flex h-10 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground",
              )}
              placeholder="Szukaj osoby…"
              value={inputQuery}
              onValueChange={setInputQuery}
              disabled={disabled}
            />
          </div>
          <CommandList className="max-h-[min(50vh,280px)]">
            {listInitialLoad ? (
              <div className="space-y-2 p-2" aria-busy="true">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filtered.length > 0 ? (
              <CommandGroup heading="Zespół">
                {filtered.map((m) => (
                  <CommandItem
                    key={m.userId}
                    value={m.userId}
                    keywords={[m.fullName, m.email, m.roleLabelPl]}
                    className="items-start py-2"
                    onSelect={() => {
                      onPick(m);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium leading-snug">{m.fullName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {m.roleLabelPl} · {m.email}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                Brak członków zespołu.
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
