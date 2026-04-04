import { useEffect, useState } from "react";
import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import { useGlobalActiveVendorPartnersForRouting } from "@/hooks/useGlobalActiveVendorPartnersForRouting";
import { useVendorPartners, type VendorPartnerRow } from "@/hooks/useVendorPartners";
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

export interface VendorPartnerComboboxProps {
  value: string;
  onPick: (vendor: VendorPartnerRow) => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * `triage`: all org partners (legacy triage inbox).
   * `routing`: org-wide active partners only — no contract/location coupling (property automations).
   */
  mode?: "triage" | "routing";
}

function filterLocal(rows: VendorPartnerRow[], q: string): VendorPartnerRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(s) || (r.service_type?.toLowerCase().includes(s) ?? false),
  );
}

export function VendorPartnerCombobox({
  value,
  onPick,
  disabled = false,
  placeholder = "Wybierz firmę B2B…",
  mode = "triage",
}: VendorPartnerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputQuery, setInputQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(inputQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [inputQuery]);

  const triageQuery = useVendorPartners(mode === "triage" && open);
  const routingQuery = useGlobalActiveVendorPartnersForRouting(mode === "routing" && open);

  const { data: vendors = [], isPending, isFetching } =
    mode === "routing" ? routingQuery : triageQuery;

  const filtered = filterLocal(vendors, debouncedQuery);
  const selected = vendors.find((v) => v.id === value);

  const listInitialLoad = isPending && vendors.length === 0;
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
              {selected?.name ?? placeholder}
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
              placeholder="Szukaj partnera…"
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
              <CommandGroup heading="Partnerzy B2B">
                {filtered.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={v.id}
                    keywords={[v.name, v.service_type ?? ""]}
                    className="items-start py-2"
                    onSelect={() => {
                      onPick(v);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium leading-snug">{v.name}</span>
                      {v.service_type ? (
                        <span className="truncate text-xs text-muted-foreground">{v.service_type}</span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                {mode === "routing" && vendors.length > 0
                  ? "Brak wyników dla podanej frazy."
                  : mode === "routing"
                    ? "Brak globalnych partnerów. Dodaj firmę w zakładce Umowy & Firmy."
                    : "Brak partnerów — dodaj ich w module umów."}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
