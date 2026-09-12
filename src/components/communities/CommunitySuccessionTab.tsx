import { useMemo, useState } from "react";

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
import {
  CommunitySuccessionProposeForm,
  SUCCESSOR_EXTERNAL,
} from "@/components/communities/CommunitySuccessionProposeForm";
import { CommunitySuccessionEventsCard } from "@/components/communities/CommunitySuccessionEventsCard";
import {
  useCommunityLegalEntityId,
  useInviteMandate,
  useMandateActions,
  useOrgAdminLegalEntityId,
  useServiceMandates,
} from "@/hooks/useBuildingEcosystem";
import { useProposeSuccession, useSuccessionActions, useSuccessionEvents } from "@/hooks/useCommunitySuccession";
import { lookupLegalEntity, LegalEntityApiError, type LegalEntityPublic } from "@/lib/legalEntityApi";
import {
  MANDATE_MODULE_LABEL,
  MANDATE_ROLE_LABEL,
  MANDATE_STATUS_LABEL,
  resolveOrgsForLegalEntity,
  type LegalEntityOrgMatch,
} from "@/lib/mandateApi";
import type { MandateStatus, SuccessionMode } from "@/types/mandates";

const EXTERNAL = SUCCESSOR_EXTERNAL;

function statusVariant(status: MandateStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "declined") return "destructive";
  return "secondary";
}

type CommunitySuccessionTabProps = {
  orgId: string;
  communityId: string;
  canManage: boolean;
};

export function CommunitySuccessionTab({ orgId, communityId, canManage }: CommunitySuccessionTabProps) {
  const entityQuery = useCommunityLegalEntityId(communityId);
  const orgEntityQuery = useOrgAdminLegalEntityId(orgId);
  const communityLegalEntityId = entityQuery.data ?? null;

  const mandatesQuery = useServiceMandates(communityLegalEntityId);
  const eventsQuery = useSuccessionEvents(communityLegalEntityId);
  const invite = useInviteMandate(communityLegalEntityId);
  const mandateActions = useMandateActions(communityLegalEntityId);
  const propose = useProposeSuccession(communityLegalEntityId);
  const successionActions = useSuccessionActions(communityLegalEntityId);

  const [nip, setNip] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [successor, setSuccessor] = useState<LegalEntityPublic | null>(null);
  const [orgMatches, setOrgMatches] = useState<LegalEntityOrgMatch[]>([]);
  const [toOrgChoice, setToOrgChoice] = useState(EXTERNAL);
  const [mode, setMode] = useState<SuccessionMode>("share_read");
  const [forceExternal, setForceExternal] = useState(false);

  const mandates = mandatesQuery.data ?? [];
  const hasPrimaryAdmin = mandates.some(
    (row) => row.module === "admin" && row.role === "primary_operator" && row.status === "active",
  );
  const successorOrgs = useMemo(
    () => orgMatches.filter((row) => row.orgId !== orgId && row.isAdmin),
    [orgMatches, orgId],
  );

  const handleLookup = async () => {
    setLookupBusy(true);
    setLookupMessage(null);
    setSuccessor(null);
    setOrgMatches([]);
    setToOrgChoice(EXTERNAL);
    try {
      const result = await lookupLegalEntity(orgId, nip);
      if (result.status !== "exists_in_domio" || !result.entity) {
        setLookupMessage(
          "Ten NIP nie jest w rejestrze DOMIO. Następca poza systemem też musi mieć rekord podmiotu — dopisz NIP w rejestrze, nie dopinając go do swojej firmy.",
        );
        return;
      }
      setSuccessor(result.entity);
      const matches = await resolveOrgsForLegalEntity(result.entity.id);
      setOrgMatches(matches);
      const adminOrgs = matches.filter((row) => row.orgId !== orgId && row.isAdmin);
      setToOrgChoice(adminOrgs[0]?.orgId ?? EXTERNAL);
      setForceExternal(adminOrgs.length === 0);
    } catch (err) {
      console.error("[CommunitySuccessionTab] lookup:", err);
      setLookupMessage(
        err instanceof LegalEntityApiError ? err.message : "Nie udało się sprawdzić NIP następcy.",
      );
    } finally {
      setLookupBusy(false);
    }
  };

  if (entityQuery.isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (!communityLegalEntityId) {
    return (
      <Alert>
        <AlertDescription>
          Wspólnota nie ma NIP w rejestrze podmiotów. Uzupełnij NIP powyżej, zanim nadasz mandat zarządcy albo
          zgłosisz sukcesję. Poprzedniego zarządcy nie odpinamy.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Mandaty administracji</CardTitle>
            <CardDescription>
              Najpierw ustanów swoją firmę głównym zarządcą. Stary operator po sukcesji zostaje jako poprzedni
              operator — nie jest odpinany od adresu.
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
            <p className="text-sm text-muted-foreground">Brak mandatów.</p>
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
                      {canManage && row.status === "active" && row.role !== "legacy_operator" ? (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={mandateActions.revoke.isPending}
                            onClick={() => {
                              if (!window.confirm("Zakończyć mandat? Organizacja nie zostanie odpięta od adresu.")) {
                                return;
                              }
                              mandateActions.revoke.mutate({ actingOrgId: orgId, mandateId: row.id });
                            }}
                          >
                            Zakończ
                          </Button>
                        </TableCell>
                      ) : (
                        <TableCell />
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CommunitySuccessionProposeForm
        canManage={canManage}
        hasPrimaryAdmin={hasPrimaryAdmin}
        nip={nip}
        lookupBusy={lookupBusy}
        lookupMessage={lookupMessage}
        successor={successor}
        successorOrgs={successorOrgs}
        toOrgChoice={toOrgChoice}
        forceExternal={forceExternal}
        mode={mode}
        proposePending={propose.isPending}
        onNipChange={setNip}
        onLookup={() => void handleLookup()}
        onClearSuccessor={() => {
          setSuccessor(null);
          setOrgMatches([]);
          setLookupMessage(null);
        }}
        onToOrgChoice={setToOrgChoice}
        onForceExternal={(on) => {
          setForceExternal(on);
          if (on) setToOrgChoice(EXTERNAL);
        }}
        onMode={setMode}
        onPropose={() =>
          propose.mutate({
            actingOrgId: orgId,
            toOrgId: forceExternal || toOrgChoice === EXTERNAL ? null : toOrgChoice,
            toLegalEntityId: successor!.id,
            mode,
          })
        }
      />

      <CommunitySuccessionEventsCard
        canManage={canManage}
        loading={eventsQuery.isLoading}
        events={eventsQuery.data ?? []}
        acceptPending={successionActions.accept.isPending}
        cancelPending={successionActions.cancel.isPending}
        rejectPending={successionActions.reject.isPending}
        completePending={successionActions.complete.isPending}
        onAccept={(successionId) => successionActions.accept.mutate({ actingOrgId: orgId, successionId })}
        onCancel={(successionId) => successionActions.cancel.mutate({ actingOrgId: orgId, successionId })}
        onReject={(successionId) => successionActions.reject.mutate({ actingOrgId: orgId, successionId })}
        onComplete={(successionId) => successionActions.complete.mutate({ actingOrgId: orgId, successionId })}
      />
    </div>
  );
}
