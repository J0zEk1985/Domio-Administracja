import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import {
  applyTriageInboxFilters,
  DEFAULT_TRIAGE_INBOX_FILTERS,
  type TriageInboxFiltersState,
  type TriageInboxStatusFilter,
  uniqueAssigneeOptions,
  uniqueBuildingOptions,
} from "@/lib/triageInboxFilters";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TriageIssueCard } from "@/components/triage/TriageIssueCard";
import { TriageInboxDateRange } from "@/components/triage/TriageInboxDateRange";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: TriageInboxStatusFilter; label: string }[] = [
  { value: "all_active", label: "Wszystkie aktywne" },
  { value: "new", label: "Nowe" },
  { value: "open", label: "Otwarte" },
  { value: "in_progress", label: "W toku" },
  { value: "pending_admin_approval", label: "Akceptacja" },
  { value: "waiting_for_parts", label: "Części" },
  { value: "delegated", label: "Delegowane" },
  { value: "resolved", label: "Zrealizowane" },
  { value: "rejected", label: "Odrzucone" },
];

export type TriageIssueListPanelProps = {
  issues: TriageIssue[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelectId: (id: string) => void;
  filters: TriageInboxFiltersState;
  onFiltersChange: (next: TriageInboxFiltersState) => void;
};

function BuildingFilterCombobox({
  issues,
  value,
  onChange,
}: {
  issues: TriageIssue[];
  value: TriageInboxFiltersState["building"];
  onChange: (next: TriageInboxFiltersState["building"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => uniqueBuildingOptions(issues), [issues]);
  const selected = value === "all" ? null : options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 min-w-[8.5rem] max-w-[11rem] shrink-0 justify-between px-2.5 text-xs font-normal"
        >
          <span className="truncate">{selected?.name ?? "Budynek"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-45" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <div className="flex items-center border-b px-2" cmdk-input-wrapper="">
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-45" />
            <CmdkInput
              placeholder="Szukaj budynku…"
              className="flex h-9 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-56">
            <CommandGroup>
              <CommandItem
                value="wszystkie budynki"
                onSelect={() => {
                  onChange("all");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === "all" ? "opacity-100" : "opacity-0")} />
                Wszystkie budynki
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.name} ${o.id}`}
                  keywords={[o.name]}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">Brak wyników.</CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AssigneeFilterCombobox({
  issues,
  assignee,
  onAssigneeChange,
}: {
  issues: TriageIssue[];
  assignee: TriageInboxFiltersState["assignee"];
  onAssigneeChange: (next: TriageInboxFiltersState["assignee"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => uniqueAssigneeOptions(issues), [issues]);

  const label =
    assignee.kind === "all"
      ? "Wykonawca"
      : assignee.kind === "vendor"
        ? `Firma: ${options.find((o) => o.kind === "vendor" && o.id === assignee.id)?.label ?? "…"}`
        : `Technik: ${options.find((o) => o.kind === "staff" && o.id === assignee.id)?.label ?? "…"}`;

  const isSelected = (o: (typeof options)[number]): boolean => {
    if (assignee.kind === "all") return false;
    return assignee.kind === o.kind && assignee.id === o.id;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 min-w-[8.5rem] max-w-[12rem] shrink-0 justify-between px-2.5 text-xs font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-45" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <div className="flex items-center border-b px-2" cmdk-input-wrapper="">
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-45" />
            <CmdkInput
              placeholder="Szukaj wykonawcy…"
              className="flex h-9 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-56">
            <CommandGroup>
              <CommandItem
                value="dowolny wykonawca"
                onSelect={() => {
                  onAssigneeChange({ kind: "all" });
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", assignee.kind === "all" ? "opacity-100" : "opacity-0")} />
                Dowolny
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={`${o.kind}-${o.id}`}
                  value={`${o.kind} ${o.label} ${o.id}`}
                  keywords={[o.label, o.kind === "vendor" ? "firma" : "technik"]}
                  onSelect={() => {
                    if (o.kind === "vendor") onAssigneeChange({ kind: "vendor", id: o.id });
                    else onAssigneeChange({ kind: "staff", id: o.id });
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", isSelected(o) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    {o.kind === "vendor" ? "Firma" : "Technik"}: {o.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">Brak wyników.</CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function filtersDirty(filters: TriageInboxFiltersState): boolean {
  if (filters.status !== DEFAULT_TRIAGE_INBOX_FILTERS.status) return true;
  if (filters.building !== DEFAULT_TRIAGE_INBOX_FILTERS.building) return true;
  if (filters.assignee.kind !== "all") return true;
  if (filters.dateRange?.from) return true;
  return false;
}

export function TriageIssueListPanel({
  issues,
  isLoading,
  selectedId,
  onSelectId,
  filters,
  onFiltersChange,
}: TriageIssueListPanelProps) {
  const list = issues ?? [];
  const filtered = useMemo(() => applyTriageInboxFilters(list, filters), [list, filters]);
  const showReset = filtersDirty(filters);
  const [newIssueOpen, setNewIssueOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 border-r border-border/40 bg-transparent pr-3">
      <div className="shrink-0 space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Kolejka</h2>
        <p className="text-[11px] text-muted-foreground">Filtry łączą się (AND).</p>
      </div>

      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-border/40 pb-2">
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 gap-1 px-3"
          onClick={() => setNewIssueOpen(true)}
        >
          + Nowe Zgłoszenie
        </Button>

        <Select
          value={filters.status}
          onValueChange={(v) => onFiltersChange({ ...filters, status: v as TriageInboxStatusFilter })}
        >
          <SelectTrigger className="h-9 w-[min(100%,11rem)] shrink-0 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <BuildingFilterCombobox
          issues={list}
          value={filters.building}
          onChange={(building) => onFiltersChange({ ...filters, building })}
        />

        <AssigneeFilterCombobox
          issues={list}
          assignee={filters.assignee}
          onAssigneeChange={(assignee) => onFiltersChange({ ...filters, assignee })}
        />

        <TriageInboxDateRange
          value={filters.dateRange}
          onChange={(dateRange) => onFiltersChange({ ...filters, dateRange })}
        />

        {showReset ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onFiltersChange({ ...DEFAULT_TRIAGE_INBOX_FILTERS })}
          >
            <X className="h-3.5 w-3.5" />
            Wyczyść
          </Button>
        ) : null}
      </div>

      <Dialog open={newIssueOpen} onOpenChange={setNewIssueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowe zgłoszenie</DialogTitle>
            <DialogDescription>
              Formularz tworzenia zgłoszenia zostanie podłączony w kolejnej iteracji.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <ScrollArea className="min-h-0 flex-1 pr-2">
        <div className="flex flex-col gap-2 pb-4">
          {isLoading ? (
            <>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Brak zgłoszeń w wczytanym okresie (ostatnie 6 miesięcy, maks. 300 pozycji).
            </p>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg py-10 text-center">
              <p className="text-sm text-muted-foreground">Brak zgłoszeń pasujących do filtrów.</p>
              <p className="mt-1 text-xs text-muted-foreground/90">Zmień kryteria lub wyczyść filtry.</p>
            </div>
          ) : (
            filtered.map((issue) => (
              <TriageIssueCard
                key={issue.id}
                issue={issue}
                selected={issue.id === selectedId}
                onSelect={() => onSelectId(issue.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
