import { useMemo, useState } from "react";
import { ChevronsUpDown, Copy } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCopyBuildingEcosystem } from "@/hooks/useBuildingEcosystem";
import { useProperties } from "@/hooks/useProperties";
import { ecosystemCopySourceLabel, ecosystemCopySources } from "@/lib/ecosystemCopySources";

type PropertyEcosystemCopyCardProps = {
  orgId: string;
  locationMasterId: string;
  communityLegalEntityId: string;
};

export function PropertyEcosystemCopyCard({
  orgId,
  locationMasterId,
  communityLegalEntityId,
}: PropertyEcosystemCopyCardProps) {
  const propertiesQuery = useProperties();
  const copy = useCopyBuildingEcosystem(locationMasterId, communityLegalEntityId);
  const [open, setOpen] = useState(false);
  const [sourceMasterId, setSourceMasterId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sources = useMemo(
    () => ecosystemCopySources(propertiesQuery.data ?? [], locationMasterId),
    [propertiesQuery.data, locationMasterId],
  );
  const selected = sources.find((row) => row.locationMasterId === sourceMasterId) ?? null;
  const selectedLabel = selected ? ecosystemCopySourceLabel(selected) : null;

  const runCopy = () => {
    if (!selected?.locationMasterId) return;
    copy.mutate(
      {
        actingOrgId: orgId,
        sourceLocationMasterId: selected.locationMasterId,
        targetLocationMasterId: locationMasterId,
        targetCommunityLegalEntityId: communityLegalEntityId,
      },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setSourceMasterId("");
        },
      },
    );
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Copy className="h-4 w-4 text-muted-foreground" aria-hidden />
          Kopiuj ustawienia z innego budynku
        </CardTitle>
        <CardDescription>
          Kopiuje parę firm Cleaning i Serwis oraz sposób przekazywania zgłoszeń. Źródłem może być budynek z innej
          wspólnoty, jeśli obsługujesz go w Administracji. Brakujący mandat tych firm zostanie dodany tylko dla tego
          adresu. Firma musi już mieć ten adres w swoim module.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={propertiesQuery.isLoading || sources.length === 0}
              className="h-10 w-full justify-between font-normal"
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {propertiesQuery.isLoading
                  ? "Wczytywanie budynków…"
                  : selectedLabel ?? "Wybierz budynek źródłowy"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Szukaj po adresie lub wspólnocie…" />
              <CommandList>
                <CommandEmpty>Brak budynku.</CommandEmpty>
                <CommandGroup>
                  {sources.map((row) => {
                    const label = ecosystemCopySourceLabel(row);
                    return (
                      <CommandItem
                        key={row.locationMasterId ?? row.id}
                        value={`${label} ${row.id}`}
                        onSelect={() => {
                          setSourceMasterId(row.locationMasterId ?? "");
                          setOpen(false);
                        }}
                      >
                        <span className="truncate">{label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {propertiesQuery.isError ? (
          <p className="text-sm text-muted-foreground">Nie udało się wczytać listy budynków.</p>
        ) : sources.length === 0 && !propertiesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Nie ma innego budynku z dopiętym adresem, z którego można skopiować ustawienia.
          </p>
        ) : (
          <Button type="button" disabled={!selected || copy.isPending} onClick={() => setConfirmOpen(true)}>
            Kopiuj ustawienia
          </Button>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !copy.isPending && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skopiować ustawienia ekosystemu?</AlertDialogTitle>
            <AlertDialogDescription>
              Kooperacja na tym budynku zostanie zastąpiona ustawieniami z „{selectedLabel ?? "wybranego budynku"}”.
              Dotyczy to firm Cleaning i Serwis oraz przełączników przekazywania zgłoszeń.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={copy.isPending}>Anuluj</AlertDialogCancel>
            <Button type="button" disabled={copy.isPending} onClick={runCopy}>
              {copy.isPending ? "Kopiowanie…" : "Kopiuj"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
