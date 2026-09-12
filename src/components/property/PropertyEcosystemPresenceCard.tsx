import { Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LocationModulePresence } from "@/lib/mandateApi";

type PropertyEcosystemPresenceCardProps = {
  canManage: boolean;
  loading: boolean;
  errorMessage: string | null;
  presence: LocationModulePresence[];
  invitePending: boolean;
  onInviteCleaning: (row: LocationModulePresence) => void;
  onInviteMaintenance: (row: LocationModulePresence) => void;
};

export function PropertyEcosystemPresenceCard({
  canManage,
  loading,
  errorMessage,
  presence,
  invitePending,
  onInviteCleaning,
  onInviteMaintenance,
}: PropertyEcosystemPresenceCardProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          Firmy na adresie
        </CardTitle>
        <CardDescription>
          Obecność (dopięty adres w Cleaning lub Serwis) jest niezależna od mandatu. Administracja wybiera, kto
          kooperuje — poprzednich operatorów nie odpinamy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : presence.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Żadna firma nie ma jeszcze dopiętego tego adresu. Cleaning i Serwis mogą dopiąć lokalizację u siebie —
            dopiero potem pojawi się tu do wyboru.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organizacja</TableHead>
                  <TableHead>Moduły</TableHead>
                  {canManage ? <TableHead className="text-right">Mandat</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {presence.map((row) => (
                  <TableRow key={row.orgId}>
                    <TableCell className="font-medium">{row.orgName}</TableCell>
                    <TableCell className="space-x-1">
                      {row.isAdmin ? <Badge variant="outline">Administracja</Badge> : null}
                      {row.isCleaning ? <Badge variant="outline">Cleaning</Badge> : null}
                      {row.isMaintenance ? <Badge variant="outline">Serwis</Badge> : null}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right space-x-2">
                        {row.isCleaning && row.partnerLegalEntityId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={invitePending}
                            onClick={() => onInviteCleaning(row)}
                          >
                            Zaproś Cleaning
                          </Button>
                        ) : null}
                        {row.isMaintenance && row.partnerLegalEntityId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={invitePending}
                            onClick={() => onInviteMaintenance(row)}
                          >
                            Zaproś Serwis
                          </Button>
                        ) : null}
                        {!row.partnerLegalEntityId ? (
                          <span className="text-xs text-muted-foreground">Brak NIP firmy</span>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
