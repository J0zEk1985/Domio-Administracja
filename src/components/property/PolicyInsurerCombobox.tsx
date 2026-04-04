import { useEffect, useState } from "react";
import { ChevronsUpDown, Loader2, Plus, Search } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import { CompanyDialog } from "@/components/companies/CompanyDialog";
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
import { usePolicyInsurerCompanies, useCompanyById } from "@/hooks/useCompanies";
import type { Company } from "@/types/contracts";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

function PolicyInsurerListItem({ company, onPick }: { company: Company; onPick: () => void }) {
  return (
    <CommandItem
      value={company.id}
      keywords={[company.name]}
      onSelect={onPick}
      className="items-start py-2.5"
    >
      <span className="truncate text-[15px] font-medium leading-snug">{company.name}</span>
    </CommandItem>
  );
}

export interface PolicyInsurerComboboxProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function PolicyInsurerCombobox({ value, onChange, disabled }: PolicyInsurerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [inputQuery, setInputQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(inputQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [inputQuery]);

  const searchForApi = debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim();
  const { data: companies = [], isPending, isFetching } = usePolicyInsurerCompanies(searchForApi, {
    enabled: open,
  });

  const { data: selectedCompany, isPending: selectedPending } = useCompanyById(
    value.trim() === "" ? undefined : value,
  );

  const showTriggerSkeleton = Boolean(value) && selectedPending;
  const listInitialLoad = isPending && companies.length === 0;
  const showSearchSpinner = isFetching && !listInitialLoad;

  const queryLabel = debouncedQuery.trim() || inputQuery.trim();

  return (
    <>
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
            className="h-10 w-full justify-between font-normal"
          >
            {showTriggerSkeleton ? (
              <Skeleton className="h-4 w-[min(100%,12rem)]" />
            ) : (
              <span className="truncate text-left">{selectedCompany?.name ?? "Wybierz…"}</span>
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
                  "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
                )}
                placeholder="Szukaj po nazwie…"
                value={inputQuery}
                onValueChange={setInputQuery}
                disabled={disabled}
              />
            </div>
            <CommandList className="max-h-[min(60vh,320px)]">
              {listInitialLoad ? (
                <div className="space-y-2 p-2" aria-busy="true">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : companies.length > 0 ? (
                <CommandGroup heading="Firmy">
                  {companies.map((company) => (
                    <PolicyInsurerListItem
                      key={company.id}
                      company={company}
                      onPick={() => {
                        onChange(company.id);
                        setOpen(false);
                      }}
                    />
                  ))}
                </CommandGroup>
              ) : (
                <CommandEmpty className="px-3 py-6 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto w-full justify-start gap-2 py-2 text-left font-normal pointer-events-auto"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      queueMicrotask(() => setShowCreateDialog(true));
                    }}
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="leading-snug">
                      {queryLabel ? `Dodaj firmę: ${queryLabel}` : "Dodaj firmę"}
                    </span>
                  </Button>
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <CompanyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        initialSearchQuery={queryLabel}
        onSuccess={(newCompanyId) => {
          onChange(newCompanyId);
          setShowCreateDialog(false);
        }}
      />
    </>
  );
}
