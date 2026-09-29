import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrgEnrolledLegalEntities } from "@/hooks/useOrgEnrolledLegalEntities";
import type { LegalEntityKind, LegalEntityPublic } from "@/lib/legalEntityApi";
import { LEGAL_ENTITY_KIND_LABELS } from "@/lib/legalEntityMessages";
import { cn } from "@/lib/utils";

type OrgLegalEntitySelectProps = {
  orgId: string;
  value: LegalEntityPublic | null;
  onChange: (entity: LegalEntityPublic | null) => void;
  allowedKinds: LegalEntityKind[];
  disabled?: boolean;
  required?: boolean;
};

function entityLabel(entity: LegalEntityPublic): string {
  return entity.shortName.trim() || entity.legalName.trim() || `NIP ${entity.nip}`;
}

export function OrgLegalEntitySelect({
  orgId,
  value,
  onChange,
  allowedKinds,
  disabled = false,
  required = false,
}: OrgLegalEntitySelectProps) {
  const [open, setOpen] = React.useState(false);
  const query = useOrgEnrolledLegalEntities(orgId, allowedKinds);
  const entities = query.data ?? [];

  return (
    <div className="grid gap-2">
      <Label>Podmiot w organizacji</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || query.isPending}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {value ? `${entityLabel(value)} · NIP ${value.nip}` : "Wybierz wspólnotę lub firmę…"}
            </span>
            {query.isPending ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Szukaj po nazwie lub NIP…" />
            <CommandList>
              <CommandEmpty>
                {query.isError ? "Nie udało się wczytać podmiotów." : "Brak podmiotów w tej organizacji."}
              </CommandEmpty>
              <CommandGroup>
                {!required ? (
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")} />
                    Bez podmiotu
                  </CommandItem>
                ) : null}
                {entities.map((entity) => (
                  <CommandItem
                    key={entity.id}
                    value={`${entity.shortName} ${entity.legalName} ${entity.nip}`}
                    onSelect={() => {
                      onChange(entity);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4 shrink-0", value?.id === entity.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{entityLabel(entity)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {LEGAL_ENTITY_KIND_LABELS[entity.kind]} · NIP {entity.nip}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
