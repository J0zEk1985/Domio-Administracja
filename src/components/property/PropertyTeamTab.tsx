import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, Loader2, Plus, Trash2, Users } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAssignableOrgMembersForLocation,
  useAssignEmployeeToPropertyLocation,
  usePropertyAdministrators,
  useRevokePropertyLocationAccess,
} from "@/hooks/useProperties";
import { cn } from "@/lib/utils";

type PropertyTeamTabProps = {
  locationId: string;
  isOrgOwner: boolean;
};

export function PropertyTeamTab({ locationId, isOrgOwner }: PropertyTeamTabProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const adminsQuery = usePropertyAdministrators(locationId, true);
  const assignableQuery = useAssignableOrgMembersForLocation(locationId, isOrgOwner);
  const assign = useAssignEmployeeToPropertyLocation(locationId);
  const revokeAccess = useRevokePropertyLocationAccess(locationId);

  const assignBusy = assign.isPending;

  if (adminsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (adminsQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {adminsQuery.error instanceof Error
          ? adminsQuery.error.message
          : "Nie udało się wczytać zespołu przypisanego do budynku."}
      </p>
    );
  }

  const admins = adminsQuery.data ?? [];
  const assignable = assignableQuery.data ?? [];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            Zespół przy budynku
          </CardTitle>
          <CardDescription>
            Członkowie organizacji z dostępem administracyjnym do tej nieruchomości (
            <code className="text-xs">location_access</code>, <code className="text-xs">administration</code>
            ).
          </CardDescription>
        </div>
        {isOrgOwner ? (
          <Popover
            open={pickerOpen}
            onOpenChange={(o) => {
              setPickerOpen(o);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={assignBusy || assignableQuery.isLoading}
              >
                {assignBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                Przypisz pracownika
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(100vw-2rem,24rem)] p-0" align="end">
              <Command className="rounded-md border-0 shadow-none">
                <CommandInput placeholder="Szukaj po imieniu lub e-mailu…" />
                <CommandList className="max-h-[min(60vh,320px)]">
                  <CommandEmpty>
                    {assignableQuery.isLoading
                      ? "Ładowanie…"
                      : assignable.length === 0
                        ? "Wszyscy aktywni członkowie mają już dostęp lub brak osób do przypisania."
                        : "Brak wyników."}
                  </CommandEmpty>
                  <CommandGroup heading="Członkowie organizacji">
                    {assignable.map((m) => {
                      const assigningThis = assign.isPending && assign.variables === m.userId;
                      return (
                        <CommandItem
                          key={m.membershipId}
                          value={`${m.fullName} ${m.email} ${m.userId}`}
                          disabled={assign.isPending}
                          onSelect={() => {
                            assign.mutate(m.userId, {
                              onSuccess: () => setPickerOpen(false),
                            });
                          }}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium truncate">{m.fullName}</span>
                            <span className="block text-xs text-muted-foreground truncate">{m.email}</span>
                          </span>
                          {assigningThis ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : null}
      </CardHeader>
      <CardContent>
        {admins.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Nikt z zespołu nie ma jeszcze dostępu administracyjnego do tego budynku.
            {isOrgOwner ? " Użyj „Przypisz pracownika”, aby dodać wpis w location_access." : null}
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imię i nazwisko</TableHead>
                  <TableHead>E-mail</TableHead>
                  {isOrgOwner ? <TableHead className="w-[72px] text-right">Akcje</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((row) => {
                  const goTeam = row.membershipId ? () => navigate(`/team/${row.membershipId}`) : undefined;
                  const revoking =
                    revokeAccess.isPending && revokeAccess.variables === row.accessId;
                  return (
                    <TableRow
                      key={row.accessId}
                      className={cn(goTeam && "cursor-pointer")}
                      onClick={goTeam}
                    >
                      <TableCell className="font-medium">{row.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email}</TableCell>
                      {isOrgOwner ? (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label="Usuń dostęp do budynku"
                            disabled={revoking}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                !window.confirm(
                                  "Czy na pewno usunąć dostęp administracyjny tej osoby do tego budynku?",
                                )
                              ) {
                                return;
                              }
                              revokeAccess.mutate(row.accessId);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
