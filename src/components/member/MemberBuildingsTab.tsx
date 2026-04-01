import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  useAssignLocationAccess,
  useMemberBuildings,
  useRevokeLocationAccess,
} from "@/hooks/useMemberDetails";
import type { MemberDetailsData } from "@/hooks/useMemberDetails";

type Props = {
  member: MemberDetailsData;
  /** Tylko właściciel może przypisywać i usuwać dostępy do budynków. */
  canEdit?: boolean;
};

export function MemberBuildingsTab({ member, canEdit = true }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: buildings, isLoading, isError } = useMemberBuildings(member.membershipId, true);
  const assign = useAssignLocationAccess(member.membershipId, member.userId);
  const revoke = useRevokeLocationAccess(member.membershipId);

  const assigned = useMemo(() => (buildings ?? []).filter((b) => b.accessId != null), [buildings]);
  const unassigned = useMemo(() => (buildings ?? []).filter((b) => b.accessId == null), [buildings]);

  const accessBusy = assign.isPending || revoke.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !buildings) {
    return <p className="text-sm text-destructive">Nie udało się wczytać listy budynków.</p>;
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Przypisane budynki</CardTitle>
          <CardDescription>
            Nieruchomości z <code className="text-xs">is_admin_active</code>. Przypisania w tabeli{" "}
            <code className="text-xs">location_access</code> (<code className="text-xs">access_type: administration</code>
            ).
          </CardDescription>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setPickerOpen(true)}
            disabled={accessBusy || unassigned.length === 0}
          >
            {assign.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Przypisz budynek
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && unassigned.length === 0 && assigned.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Wszystkie aktywne nieruchomości w administracji są już przypisane do tego pracownika.
          </p>
        )}
        {buildings.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Brak nieruchomości z włączonym modułem Administracja dla tej organizacji.
          </p>
        ) : assigned.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {canEdit
              ? "Brak przypisanych budynków. Kliknij „Przypisz budynek”, aby wybrać nieruchomość z listy."
              : "Brak przypisanych budynków."}
          </p>
        ) : (
          <div className="space-y-0 divide-y rounded-md border">
            {assigned.map((b) => {
              const accessId = b.accessId as string;
              const revokingThis = revoke.isPending && revoke.variables === accessId;

              return (
                <div
                  key={b.id}
                  className="flex flex-col gap-2 py-3 px-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium leading-tight">{b.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.address}</p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pl-4">
                      <Label htmlFor={`loc-sw-${b.id}`} className="text-xs text-muted-foreground sr-only sm:not-sr-only">
                        Dostęp
                      </Label>
                      <Switch
                        id={`loc-sw-${b.id}`}
                        checked
                        disabled={accessBusy}
                        onCheckedChange={(on) => {
                          if (!on && accessId) revoke.mutate(accessId);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={accessBusy}
                        onClick={() => revoke.mutate(accessId)}
                      >
                        {revokingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          "Usuń"
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground shrink-0 sm:pl-4">Dostęp administracyjny</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEdit ? (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="border-b px-4 py-3 text-left">
              <DialogTitle className="text-base">Przypisz budynek</DialogTitle>
              <DialogDescription className="text-xs">
                Wyszukaj po nazwie lub adresie i wybierz nieruchomość. Zostanie dodany wpis w{" "}
                <code className="text-[11px]">location_access</code>.
              </DialogDescription>
            </DialogHeader>
            <Command className="rounded-none border-0 shadow-none">
              <CommandInput placeholder="Szukaj nieruchomości…" />
              <CommandList className="max-h-[min(60vh,320px)]">
                <CommandEmpty>Brak nieruchomości do przypisania.</CommandEmpty>
                <CommandGroup heading="Dostępne do przypisania">
                  {unassigned.map((b) => {
                    const assigningThis = assign.isPending && assign.variables === b.id;
                    return (
                      <CommandItem
                        key={b.id}
                        value={`${b.name} ${b.address} ${b.id}`}
                        disabled={assign.isPending}
                        onSelect={() => {
                          assign.mutate(b.id, {
                            onSuccess: () => setPickerOpen(false),
                          });
                        }}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium truncate">{b.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">{b.address}</span>
                        </span>
                        {assigningThis ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
