import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import { toast } from "@/components/ui/sonner";
import { useGlobalActiveVendorPartnersForRouting } from "@/hooks/useGlobalActiveVendorPartnersForRouting";
import { useLocationIssueVendors } from "@/hooks/useLocationIssueVendors";
import { useVendorPartners, type VendorPartnerRow } from "@/hooks/useVendorPartners";
import {
  ISSUE_VENDOR_OFFSITE_NO_EMAIL_PL,
  partitionIssueVendors,
  vendorHasEmail,
} from "@/lib/issueVendorHandoff";
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
   * `triage`: vendors attached to the issue building, with an option to reveal the rest.
   * `routing`: org-wide partners for automations, without the building filter.
   */
  mode?: "triage" | "routing";
  /** Building of the issue. Used only in triage mode. */
  locationId?: string | null;
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
  locationId = null,
}: VendorPartnerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [inputQuery, setInputQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(inputQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [inputQuery]);

  const triageQuery = useVendorPartners(mode === "triage" && open);
  const routingQuery = useGlobalActiveVendorPartnersForRouting(mode === "routing" && open);
  const attachedQuery = useLocationIssueVendors(
    locationId,
    mode === "triage" && open && Boolean(locationId),
  );

  const { data: vendors = [], isPending, isFetching } =
    mode === "routing" ? routingQuery : triageQuery;

  const attachedIds = useMemo(
    () => new Set((attachedQuery.data ?? []).map((row) => row.vendor_id)),
    [attachedQuery.data],
  );
  const scoped = mode === "triage";
  const filtered = filterLocal(vendors, debouncedQuery);
  const split = scoped
    ? partitionIssueVendors(filtered, locationId ? attachedIds : new Set())
    : { attached: filtered, other: [] as VendorPartnerRow[] };
  const visibleOthers = showOthers ? split.other : [];
  const selected = vendors.find((v) => v.id === value);

  const listInitialLoad =
    (isPending && vendors.length === 0) ||
    (scoped && Boolean(locationId) && attachedQuery.isPending && !attachedQuery.data);
  const showSearchSpinner = isFetching && !listInitialLoad;

  const pickVendor = (vendor: VendorPartnerRow, attached: boolean) => {
    if (scoped && !attached && !vendorHasEmail(vendor.contact_email)) {
      toast.error(ISSUE_VENDOR_OFFSITE_NO_EMAIL_PL);
      return;
    }
    onPick(vendor);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setInputQuery("");
          setDebouncedQuery("");
          setShowOthers(false);
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
            ) : (
              <>
                {scoped ? (
                  <CommandGroup heading="Podpięte pod budynek">
                    {split.attached.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        {debouncedQuery.trim()
                          ? "Brak podpiętych firm dla tej frazy."
                          : "Brak firm podpiętych pod ten budynek."}
                      </p>
                    ) : (
                      split.attached.map((vendor) => (
                        <VendorOption
                          key={vendor.id}
                          vendor={vendor}
                          attached
                          onSelect={() => pickVendor(vendor, true)}
                        />
                      ))
                    )}
                  </CommandGroup>
                ) : filtered.length > 0 ? (
                  <CommandGroup heading="Partnerzy B2B">
                    {filtered.map((vendor) => (
                      <VendorOption
                        key={vendor.id}
                        vendor={vendor}
                        attached
                        onSelect={() => pickVendor(vendor, true)}
                      />
                    ))}
                  </CommandGroup>
                ) : (
                  <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {vendors.length > 0
                      ? "Brak wyników dla podanej frazy."
                      : "Brak wykonawców. Dodaj firmę z kategorią Wykonawca w zakładce Umowy i Firmy. Ubezpieczyciele nie pojawiają się na tej liście."}
                  </CommandEmpty>
                )}

                {scoped && split.other.length > 0 && !showOthers ? (
                  <div className="border-t px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start text-xs"
                      onClick={() => setShowOthers(true)}
                    >
                      Pokaż pozostałe firmy
                    </Button>
                  </div>
                ) : null}

                {scoped && showOthers ? (
                  <CommandGroup heading="Pozostałe firmy">
                    {split.other.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Brak pozostałych firm.</p>
                    ) : (
                      split.other.map((vendor) => (
                        <VendorOption
                          key={vendor.id}
                          vendor={vendor}
                          attached={false}
                          onSelect={() => pickVendor(vendor, false)}
                        />
                      ))
                    )}
                  </CommandGroup>
                ) : null}

                {scoped && filtered.length === 0 && vendors.length > 0 ? (
                  <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Brak wyników dla podanej frazy.
                  </CommandEmpty>
                ) : null}
                {scoped && vendors.length === 0 ? (
                  <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Brak wykonawców. Dodaj firmę z kategorią Wykonawca w module umów.
                  </CommandEmpty>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function VendorOption({
  vendor,
  attached,
  onSelect,
}: {
  vendor: VendorPartnerRow;
  attached: boolean;
  onSelect: () => void;
}) {
  const note = attached
    ? vendor.dispatch_channel === "email"
      ? "E-mail"
      : null
    : vendorHasEmail(vendor.contact_email)
      ? "E-mail"
      : "Bez e-maila";

  return (
    <CommandItem
      value={vendor.id}
      keywords={[vendor.name, vendor.service_type ?? ""]}
      className="items-start py-2"
      onSelect={onSelect}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-snug">{vendor.name}</span>
        <span className="flex items-center gap-2">
          {vendor.service_type ? (
            <span className="truncate text-xs text-muted-foreground">{vendor.service_type}</span>
          ) : null}
          {note ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              {note}
            </span>
          ) : null}
        </span>
      </div>
    </CommandItem>
  );
}
