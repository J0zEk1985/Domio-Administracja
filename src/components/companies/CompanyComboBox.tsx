import { forwardRef, useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { ChevronsUpDown, Loader2, Plus, Search } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import { CompanyDialog } from "@/components/companies/CompanyDialog";
import { useCompanies, useCompanyById } from "@/hooks/useCompanies";
import type { Company } from "@/types/contracts";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

export interface CompanyComboBoxProps extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

function CompanyListItem({ company, onPick }: { company: Company; onPick: () => void }) {
  return (
    <CommandItem
      value={company.id}
      keywords={[company.name, company.tax_id]}
      onSelect={onPick}
      className="min-w-0 items-start py-2.5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium leading-snug">{company.name}</span>
        <span className="truncate text-xs text-muted-foreground">NIP {company.tax_id}</span>
      </div>
    </CommandItem>
  );
}

export const CompanyComboBox = forwardRef<HTMLDivElement, CompanyComboBoxProps>(
  function CompanyComboBox({ value, onChange, disabled = false, className, ...rest }, ref) {
    const [open, setOpen] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [inputQuery, setInputQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    useEffect(() => {
      const t = window.setTimeout(() => setDebouncedQuery(inputQuery), SEARCH_DEBOUNCE_MS);
      return () => window.clearTimeout(t);
    }, [inputQuery]);

    const searchForApi = debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim();
    const { data: companies = [], isPending, isFetching } = useCompanies(searchForApi, {
      enabled: open,
    });

    const { data: selectedCompany, isPending: selectedPending } = useCompanyById(
      value.trim() === "" ? undefined : value,
    );

    const showTriggerSkeleton = Boolean(value) && selectedPending;
    const listInitialLoad = isPending && companies.length === 0;
    const showSearchSpinner = isFetching && !listInitialLoad;

    const queryLabel = debouncedQuery.trim() || inputQuery.trim();
    const triggerLabel = selectedCompany?.name ?? "Wybierz firmę…";

    return (
      <div ref={ref} className={cn("w-full min-w-0 max-w-full", className)} {...rest}>
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
              title={selectedCompany?.name || undefined}
              className="h-10 w-full min-w-0 max-w-full justify-between overflow-hidden font-normal"
            >
              {showTriggerSkeleton ? (
                <Skeleton className="h-4 w-[min(100%,12rem)]" />
              ) : (
                <span className="min-w-0 flex-1 overflow-hidden truncate text-left">{triggerLabel}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
            align="start"
            collisionPadding={16}
          >
            <Command shouldFilter={false} className="max-w-full rounded-md border-0 shadow-none">
              <div className="flex min-w-0 items-center border-b px-3" cmdk-input-wrapper="">
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
                    "flex h-11 min-w-0 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  placeholder="Szukaj po nazwie lub NIP…"
                  value={inputQuery}
                  onValueChange={setInputQuery}
                  disabled={disabled}
                />
              </div>
              <CommandList className="max-h-[min(60vh,320px)] overflow-x-hidden">
                {listInitialLoad ? (
                  <div className="space-y-2 p-2" aria-busy="true">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <>
                    {companies.length > 0 ? (
                      <CommandGroup heading="Firmy">
                        {companies.map((company) => (
                          <CompanyListItem
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
                      <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                        Brak firm{queryLabel ? ` dla „${queryLabel}”` : ""}.
                      </p>
                    )}
                    <div className="border-t p-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto w-full min-w-0 justify-start gap-2 overflow-hidden py-2 text-left font-normal pointer-events-auto"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setOpen(false);
                          queueMicrotask(() => setShowCreateDialog(true));
                        }}
                      >
                        <Plus className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate leading-snug">
                          {queryLabel ? `Dodaj firmę: ${queryLabel}` : "Dodaj firmę"}
                        </span>
                      </Button>
                    </div>
                  </>
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
      </div>
    );
  },
);
