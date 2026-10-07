import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useCommunity, useDeactivateCommunity } from "@/hooks/useCommunities";
import {
  useAssignLocationsToCommunity,
  useLocationsByCommunity,
  useUnassignedOrgLocationsForCommunityDialog,
} from "@/hooks/useProperties";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeactivateCommunityDialog } from "@/components/communities/DeactivateCommunityDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CommunityDomainEditor } from "@/components/communities/CommunityDomainEditor";
import { CommunityContactBoardCard } from "@/components/communities/CommunityContactBoardCard";
import { CommunityBoardDisplayLinkCard } from "@/components/communities/CommunityBoardDisplayLinkCard";
import { CommunityTeamTab } from "@/components/communities/CommunityTeamTab";
import { CommunitySuccessionTab } from "@/components/communities/CommunitySuccessionTab";
import { CommunityEstateTab } from "@/components/communities/CommunityEstateTab";
import { CommunityOrdersTab } from "@/components/communities/CommunityOrdersTab";
import { CommunityAnnouncementReviewTab } from "@/components/communities/CommunityAnnouncementReviewTab";
import { CommunityIssuesTab } from "@/components/communities/CommunityIssuesTab";
import { CommunityWarrantyTab } from "@/components/communities/CommunityWarrantyTab";
import { CommunitySharedResourcesTab } from "@/components/communities/CommunitySharedResourcesTab";
import { CommunityWasteTab } from "@/components/communities/CommunityWasteTab";
import {
  VerificationNeededBadge,
  rowNeedsVerification,
} from "@/components/legal-entity/VerificationNeededBadge";
import { useOrgVerificationAlerts } from "@/hooks/useOrgVerificationAlerts";
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { formatCommunityStatus, isCommunityInactive } from "@/lib/communityStatus";
import { PropertyContractsTab } from "@/components/property/PropertyContractsTab";
import { PropertyTasksTabWithAccess } from "@/components/property/PropertyTasksTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";

async function fetchMyOrgId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_org_id_safe");
  if (error) {
    console.error("[CommunityDetails] get_my_org_id_safe:", error);
    return null;
  }
  if (data == null || String(data).trim() === "") return null;
  return String(data);
}

export default function CommunityDetails() {
  const { communityId } = useParams<{ communityId: string }>();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const deactivateMutation = useDeactivateCommunity();

  const { data: orgId, isLoading: orgLoading } = useQuery({
    queryKey: ["my-org-id"],
    queryFn: fetchMyOrgId,
  });
  const { data: ownerAccess } = useIsOrgOwner();
  const isOrgOwner = ownerAccess?.isOwner === true;

  const communityQuery = useCommunity(communityId, orgId ?? null);
  const { data: verificationAlerts } = useOrgVerificationAlerts(orgId ?? null);
  const locationsQuery = useLocationsByCommunity(communityId, {
    enabled: Boolean(communityId && orgId),
  });
  const unassignedQuery = useUnassignedOrgLocationsForCommunityDialog(assignOpen);
  const assignMutation = useAssignLocationsToCommunity(communityId);

  useEffect(() => {
    if (assignOpen) {
      setSelectedIds(new Set());
    }
  }, [assignOpen]);

  if (!communityId) {
    return <Navigate to="/communities" replace />;
  }

  if (orgLoading) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full max-w-2xl" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex-1 p-6 text-sm text-muted-foreground">Brak kontekstu organizacji.</div>
    );
  }

  if (communityQuery.isLoading) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full max-w-2xl" />
      </div>
    );
  }

  if (communityQuery.isError || !communityQuery.data) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2 w-fit" asChild>
          <Link to="/communities">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wróć do listy
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {communityQuery.error instanceof Error
            ? communityQuery.error.message
            : "Nie znaleziono wspólnoty."}
        </p>
      </div>
    );
  }

  const community = communityQuery.data;
  const inactive = isCommunityInactive(community.status);

  function toggleLocation(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onAssignSubmit() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    assignMutation.mutate(ids, {
      onSuccess: () => {
        setAssignOpen(false);
        setSelectedIds(new Set());
      },
    });
  }

  function onDeactivate() {
    deactivateMutation.mutate(
      { orgId, communityId: community.id },
      {
        onSuccess: () => {
          setDeactivateOpen(false);
          toast.success("Wspólnota dezaktywowana. Historia zostaje w archiwum.");
        },
      },
    );
  }

  const unassigned = unassignedQuery.data ?? [];
  const assigned = locationsQuery.data ?? [];
  const buildingIds = assigned.map((r) => r.id);
  const primaryLocationId = assigned[0]?.id ?? "";

  return (
    <div className="flex-1 space-y-8 p-6">
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2 w-fit" asChild>
          <Link to="/communities">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wspólnoty
          </Link>
        </Button>

        <div className="rounded-xl border border-border/60 bg-card/50 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{community.name}</h1>
                <Badge variant={inactive ? "secondary" : "default"}>
                  {formatCommunityStatus(community.status)}
                </Badge>
                {rowNeedsVerification(verificationAlerts, "community", community.id, community.nip) ? (
                  <VerificationNeededBadge />
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                NIP: <span className="text-foreground/90 tabular-nums">{community.nip?.trim() || "—"}</span>
              </p>
            </div>
            {inactive ? null : (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeactivateOpen(true)}
              >
                Dezaktywuj
              </Button>
            )}
          </div>
        </div>

        {inactive ? (
          <Alert>
            <AlertTitle>Archiwum — wspólnota nieaktywna</AlertTitle>
            <AlertDescription>
              Wpisy zostają u Ciebie. Mandat głównego zarządcy został zakończony. Inny podmiot w DOMIO może
              przejąć obsługę, ale bez sukcesji nie zobaczy przeglądów, e-tablicy ani ogłoszeń lokatorów z Home.
              Ponowne dodanie po NIP wznawia tę wspólnotę w Twoim zasobie.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <CollapsibleSection title="Zarządzanie">
        <Tabs defaultValue="contracts-policies" className="w-full">
          <TabsList className="flex h-auto min-h-10 w-full flex-wrap justify-start gap-1 p-1">
            <TabsTrigger value="contracts-policies" className="shrink-0">
              Umowy i Polisy
            </TabsTrigger>
            <TabsTrigger value="tasks" className="shrink-0">
              Zadania
            </TabsTrigger>
            <TabsTrigger value="inspections" className="shrink-0">
              Przeglądy
            </TabsTrigger>
            <TabsTrigger value="team" className="shrink-0">
              Zespół
            </TabsTrigger>
            <TabsTrigger value="orders" className="shrink-0">
              Zamówienia
            </TabsTrigger>
            <TabsTrigger value="announcements" className="shrink-0">
              Ogłoszenia
            </TabsTrigger>
            <TabsTrigger value="issues" className="shrink-0">
              Zgłoszenia
            </TabsTrigger>
            <TabsTrigger value="warranty" className="shrink-0">
              Usterki deweloperskie
            </TabsTrigger>
            <TabsTrigger value="resources" className="shrink-0">
              Zasoby
            </TabsTrigger>
            <TabsTrigger value="waste" className="shrink-0">
              Gospodarka odpadami
            </TabsTrigger>
            <TabsTrigger value="estate" className="shrink-0">
              Osiedle
            </TabsTrigger>
            {isOrgOwner ? (
              <TabsTrigger value="succession" className="shrink-0">
                Sukcesja
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="contracts-policies" className="mt-4">
            {primaryLocationId ? (
              <PropertyContractsTab
                locationId={primaryLocationId}
                cKobBuildingId={null}
                resourceScope={{
                  communityScope: { communityId: communityId!, buildingIds },
                }}
                sections={{ contracts: true, policies: true, inspections: false }}
                communityAssignOption={{ communityId: communityId! }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Dodaj co najmniej jeden budynek do wspólnoty, aby zarządzać umowami i polisami.
              </p>
            )}
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            {primaryLocationId ? (
              <PropertyTasksTabWithAccess
                locationId={primaryLocationId}
                resourceScope={{
                  communityScope: { communityId: communityId!, buildingIds },
                }}
                communityAssignOption={{ communityId: communityId! }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Dodaj co najmniej jeden budynek do wspólnoty, aby korzystać z zadań.
              </p>
            )}
          </TabsContent>

          <TabsContent value="inspections" className="mt-4">
            {primaryLocationId && buildingIds.length > 0 ? (
              <PropertyContractsTab
                locationId={primaryLocationId}
                cKobBuildingId={null}
                resourceScope={{
                  communityScope: { communityId: communityId!, buildingIds },
                }}
                inspectionsScope={{ communityBuildingIds: buildingIds }}
                communityBuildings={assigned}
                sections={{ contracts: false, policies: false, inspections: true }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Dodaj co najmniej jeden budynek do wspólnoty, aby zobaczyć przeglądy techniczne.
              </p>
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <CommunityTeamTab communityId={communityId!} />
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <CommunityOrdersTab communityId={communityId!} buildings={assigned} />
          </TabsContent>

          <TabsContent value="announcements" className="mt-4">
            <CommunityAnnouncementReviewTab
              communityId={communityId!}
              communityName={community.name}
              buildingIds={buildingIds}
              buildings={assigned}
              canManage={!inactive}
            />
          </TabsContent>

          <TabsContent value="issues" className="mt-4">
            <CommunityIssuesTab buildingIds={buildingIds} />
          </TabsContent>

          <TabsContent value="warranty" className="mt-4">
            {orgId ? (
              <CommunityWarrantyTab
                communityId={communityId!}
                communityName={community.name}
                orgId={orgId}
                canManage={!inactive}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Ładowanie...
              </p>
            )}
          </TabsContent>

          <TabsContent value="resources" className="mt-4">
            <CommunitySharedResourcesTab communityId={communityId!} buildings={assigned} />
          </TabsContent>

          <TabsContent value="estate" className="mt-4">
            <CommunityEstateTab communityId={communityId!} communityName={community.name} />
          </TabsContent>

          <TabsContent value="waste" className="mt-4">
            {orgId ? (
              <CommunityWasteTab
                communityId={communityId!}
                orgId={orgId}
                buildings={assigned}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Ładowanie...</p>
            )}
          </TabsContent>

          {isOrgOwner ? (
            <TabsContent value="succession" className="mt-4">
              <CommunitySuccessionTab orgId={orgId} communityId={communityId!} canManage={!inactive} />
            </TabsContent>
          ) : null}
        </Tabs>
      </CollapsibleSection>

      <CollapsibleSection title="Podstawowe">
        <CommunityDomainEditor
          community={community}
          orgId={orgId}
          readOnly={inactive}
          coreExtra={
            <CommunityBoardDisplayLinkCard
              communityId={communityId}
              orgId={orgId}
              boardPortalToken={community.board_portal_token ?? ""}
              canManage={!inactive}
            />
          }
          homeBoard={
            orgId ? (
              <CommunityContactBoardCard communityId={communityId} orgId={orgId} readOnly={inactive} />
            ) : null
          }
        />

        <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-foreground">Budynki przypisane do wspólnoty</h3>
          {inactive ? null : (
            <Button type="button" className="gap-1.5 shrink-0" onClick={() => setAssignOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Przypisz budynek
            </Button>
          )}
        </div>

        {locationsQuery.isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : locationsQuery.isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać budynków.</p>
        ) : assigned.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {inactive
              ? "Brak budynków w archiwum tej wspólnoty."
              : "Brak przypisanych budynków. Użyj przycisku powyżej, aby dodać pierwszy."}
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adres</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assigned.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.address}</TableCell>
                    <TableCell>
                      {inactive ? (
                        <span className="text-xs text-muted-foreground">Archiwum</span>
                      ) : (
                        <Button variant="link" className="h-auto p-0 text-sm" asChild>
                          <Link to={`/properties/${row.id}`}>Szczegóły</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </section>
      </CollapsibleSection>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Przypisz budynki</DialogTitle>
            <DialogDescription>
              Wybierz budynki z organizacji, które nie są jeszcze przypisane do żadnej wspólnoty. Zostaną powiązane z
              tą wspólnotą.
            </DialogDescription>
          </DialogHeader>
          {unassignedQuery.isLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : unassignedQuery.isError ? (
            <p className="text-sm text-destructive">Nie udało się wczytać listy budynków.</p>
          ) : unassigned.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Wszystkie aktywne budynki są już przypisane do wspólnot lub brak budynków do wyboru.
            </p>
          ) : (
            <ScrollArea className="max-h-[min(50vh,320px)] pr-3">
              <ul className="space-y-3">
                {unassigned.map((loc) => (
                  <li key={loc.id} className="flex items-start gap-3 rounded-md border border-border/60 p-3">
                    <Checkbox
                      id={`loc-${loc.id}`}
                      checked={selectedIds.has(loc.id)}
                      onCheckedChange={() => toggleLocation(loc.id)}
                      aria-labelledby={`loc-label-${loc.id}`}
                    />
                    <div className="min-w-0 flex-1">
                      <Label
                        id={`loc-label-${loc.id}`}
                        htmlFor={`loc-${loc.id}`}
                        className="cursor-pointer font-medium leading-snug"
                      >
                        {loc.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">{loc.address}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Anuluj
            </Button>
            <Button
              type="button"
              disabled={selectedIds.size === 0 || assignMutation.isPending || unassigned.length === 0}
              onClick={onAssignSubmit}
            >
              {assignMutation.isPending ? "Zapisywanie…" : `Przypisz (${selectedIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeactivateCommunityDialog
        open={deactivateOpen}
        communityName={community.name}
        pending={deactivateMutation.isPending}
        onOpenChange={setDeactivateOpen}
        onConfirm={onDeactivate}
      />
    </div>
  );
}
