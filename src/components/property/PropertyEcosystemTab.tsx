import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { COOP_NONE, PropertyEcosystemCoopCard } from "@/components/property/PropertyEcosystemCoopCard";
import { PropertyEcosystemPresenceCard } from "@/components/property/PropertyEcosystemPresenceCard";
import {
  useCommunityLegalEntityId,
  useCooperationLinks,
  useInviteMandate,
  useLocationPresence,
  useMandateActions,
  useOrgAdminLegalEntityId,
  useServiceMandates,
  useUpsertCooperation,
} from "@/hooks/useBuildingEcosystem";
import {
  MANDATE_MODULE_LABEL,
  MANDATE_ROLE_LABEL,
  MANDATE_STATUS_LABEL,
} from "@/lib/mandateApi";
import type { MandateStatus } from "@/types/mandates";

const NONE = COOP_NONE;

function statusVariant(status: MandateStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "declined") return "destructive";
  return "secondary";
}

type PropertyEcosystemTabProps = {
  orgId: string;
  communityId: string | null;
  locationMasterId: string | null;
  canManage: boolean;
};

export function PropertyEcosystemTab({
  orgId,
  communityId,
  locationMasterId,
  canManage,
}: PropertyEcosystemTabProps) {
  const entityQuery = useCommunityLegalEntityId(communityId);
  const orgEntityQuery = useOrgAdminLegalEntityId(orgId);
  const communityLegalEntityId = entityQuery.data ?? null;

  const presenceQuery = useLocationPresence(locationMasterId);
  const mandatesQuery = useServiceMandates(communityLegalEntityId);
  const coopQuery = useCooperationLinks(locationMasterId);
  const invite = useInviteMandate(communityLegalEntityId);
  const mandateActions = useMandateActions(communityLegalEntityId);
  const upsertCoop = useUpsertCooperation(locationMasterId);

  const activeLink = (coopQuery.data ?? []).find((row) => row.status === "active") ?? null;
  const [cleaningOrgId, setCleaningOrgId] = useState(NONE);
  const [maintenanceOrgId, setMaintenanceOrgId] = useState(NONE);
  const [cleaningIssuesToSerwis, setCleaningIssuesToSerwis] = useState(true);
  const [skipAdminTriage, setSkipAdminTriage] = useState(false);

  useEffect(() => {
    setCleaningOrgId(activeLink?.cleaningOrgId ?? NONE);
    setMaintenanceOrgId(activeLink?.maintenanceOrgId ?? NONE);
    setCleaningIssuesToSerwis(activeLink?.cleaningIssuesToSerwis ?? true);
    setSkipAdminTriage(activeLink?.skipAdminTriage ?? false);
  }, [activeLink?.id, activeLink?.cleaningOrgId, activeLink?.maintenanceOrgId, activeLink?.cleaningIssuesToSerwis, activeLink?.skipAdminTriage]);

  const presence = presenceQuery.data ?? [];
  const cleaningOrgs = useMemo(
    () => (presenceQuery.data ?? []).filter((row) => row.isCleaning),
    [presenceQuery.data],
  );
  const maintenanceOrgs = useMemo(
    () => (presenceQuery.data ?? []).filter((row) => row.isMaintenance),
    [presenceQuery.data],
  );

  const mandates = (mandatesQuery.data ?? []).filter(
    (row) => row.locationMasterId === null || row.locationMasterId === locationMasterId,
  );

  const hasPrimaryAdmin = mandates.some(
    (row) => row.module === "admin" && row.role === "primary_operator" && row.status === "active",
  );

  if (!locationMasterId) {
    return (
      <Alert>
        <AlertDescription>
          Ten budynek nie jest dopięty do adresu w rejestrze. Dopnij adres (NIP wspólnoty), aby wskazać kooperantów
          Cleaning i Serwis. Sama obecność firmy na adresie nie oznacza jeszcze mandatu.
        </AlertDescription>
      </Alert>
    );
  }

  if (!communityId) {
    return (
      <Alert>
        <AlertDescription>
          Przypisz budynek do wspólnoty, aby Administracja mogła wybrać, które firmy kooperują w ekosystemie DOMIO.
        </AlertDescription>
      </Alert>
    );
  }

  if (entityQuery.isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (!communityLegalEntityId) {
    return (
      <Alert>
        <AlertDescription>
          Wspólnota nie ma NIP w rejestrze podmiotów. Uzupełnij NIP na karcie wspólnoty — dopiero wtedy można nadać
          mandaty i wybrać kooperantów. Stary zarządca nie jest odpinany automatycznie.
        </AlertDescription>
      </Alert>
    );
  }

  const invitePartner = (row: (typeof presence)[number], module: "cleaning" | "maintenance") => {
    if (!row.partnerLegalEntityId) {
      return;
    }
    invite.mutate({
      actingOrgId: orgId,
      locationMasterId,
      partnerOrgId: row.orgId,
      partnerLegalEntityId: row.partnerLegalEntityId,
      module,
      role: "primary_operator",
    });
  };

  return (
    <div className="space-y-6">
      <PropertyEcosystemPresenceCard
        canManage={canManage}
        loading={presenceQuery.isLoading}
        errorMessage={
          presenceQuery.isError
            ? presenceQuery.error instanceof Error
              ? presenceQuery.error.message
              : "Nie udało się wczytać firm na adresie."
            : null
        }
        presence={presence}
        invitePending={invite.isPending}
        onInviteCleaning={(row) => invitePartner(row, "cleaning")}
        onInviteMaintenance={(row) => invitePartner(row, "maintenance")}
      />

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Mandaty</CardTitle>
            <CardDescription>
              Zaproszenie wymaga akceptacji drugiej strony. Główny mandat administracji możesz ustanowić sam dla swojej
              firmy.
            </CardDescription>
          </div>
          {canManage && !hasPrimaryAdmin && orgEntityQuery.data ? (
            <Button
              type="button"
              size="sm"
              disabled={invite.isPending}
              onClick={() =>
                invite.mutate({
                  actingOrgId: orgId,
                  locationMasterId: null,
                  partnerOrgId: orgId,
                  partnerLegalEntityId: orgEntityQuery.data,
                  module: "admin",
                  role: "primary_operator",
                })
              }
            >
              Ustanów nas głównym zarządcą
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {mandatesQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : mandates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak mandatów dla tej wspólnoty.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Moduł</TableHead>
                    <TableHead>Rola</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="text-right">Akcje</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mandates.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{MANDATE_MODULE_LABEL[row.module]}</TableCell>
                      <TableCell>{MANDATE_ROLE_LABEL[row.role]}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{MANDATE_STATUS_LABEL[row.status]}</Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right space-x-2">
                          {row.status === "invited" && row.orgId === orgId ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                disabled={mandateActions.accept.isPending}
                                onClick={() => mandateActions.accept.mutate({ actingOrgId: orgId, mandateId: row.id })}
                              >
                                Akceptuj
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={mandateActions.decline.isPending}
                                onClick={() => mandateActions.decline.mutate({ actingOrgId: orgId, mandateId: row.id })}
                              >
                                Odrzuć
                              </Button>
                            </>
                          ) : null}
                          {row.status === "active" && row.role !== "legacy_operator" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={mandateActions.revoke.isPending}
                              onClick={() => {
                                if (!window.confirm("Zakończyć ten mandat? Firma nie zostanie odpięta od adresu.")) {
                                  return;
                                }
                                mandateActions.revoke.mutate({ actingOrgId: orgId, mandateId: row.id });
                              }}
                            >
                              Zakończ
                            </Button>
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

      <PropertyEcosystemCoopCard
        communityId={communityId}
        canManage={canManage}
        cleaningOrgs={cleaningOrgs}
        maintenanceOrgs={maintenanceOrgs}
        cleaningOrgId={cleaningOrgId}
        maintenanceOrgId={maintenanceOrgId}
        cleaningIssuesToSerwis={cleaningIssuesToSerwis}
        skipAdminTriage={skipAdminTriage}
        pending={upsertCoop.isPending}
        onCleaningOrgId={setCleaningOrgId}
        onMaintenanceOrgId={setMaintenanceOrgId}
        onCleaningIssuesToSerwis={setCleaningIssuesToSerwis}
        onSkipAdminTriage={setSkipAdminTriage}
        onSave={() =>
          upsertCoop.mutate({
            actingOrgId: orgId,
            locationMasterId,
            communityLegalEntityId,
            cleaningOrgId: cleaningOrgId === NONE ? null : cleaningOrgId,
            maintenanceOrgId: maintenanceOrgId === NONE ? null : maintenanceOrgId,
            cleaningIssuesToSerwis,
            skipAdminTriage,
          })
        }
      />

      <p className="text-sm text-muted-foreground">
        Zakres prac SOP firmy Cleaning zestawisz z PDF umowy w zakładce „Zakres sprzątania”.
      </p>
    </div>
  );
}
