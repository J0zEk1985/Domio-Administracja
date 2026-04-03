import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useProperty,
  usePropertyAdministrators,
  useRevokePropertyLocationAccess,
} from "@/hooks/useProperties";
import { usePropertyTasksCanEdit } from "@/hooks/usePropertyTasks";
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { PropertyGeneralInfoForm } from "@/components/property/PropertyGeneralInfoForm";
import { PropertySerwisQrAccessCard } from "@/components/property/PropertySerwisQrAccessCard";
import { PropertyExternalAccessCard } from "@/components/property/PropertyExternalAccessCard";
import { PropertyAutomationsTab } from "@/components/property/PropertyAutomationsTab";
import { PropertyContractsTab } from "@/components/property/PropertyContractsTab";
import { PropertyIssuesTab } from "@/components/property/PropertyIssuesTab";
import { PropertyTeamTab } from "@/components/property/PropertyTeamTab";
import { PropertyTasksTabWithAccess } from "@/components/property/PropertyTasksTab";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

function PropertyDetailsSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-6">
      <Skeleton className="h-9 w-56" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

function AdministratorsSkeleton({ showActions = true }: { showActions?: boolean }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Imię i nazwisko</TableHead>
            <TableHead>E-mail</TableHead>
            {showActions ? <TableHead className="w-[72px] text-right">Akcje</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              {showActions ? (
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-8 w-8 rounded-md" />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PropertyDetails() {
  const { id: propertyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ownerAccess } = useIsOrgOwner();
  const isOwner = ownerAccess?.isOwner === true;

  const propertyQuery = useProperty(propertyId, Boolean(propertyId));
  const adminsQuery = usePropertyAdministrators(propertyId, Boolean(propertyId && propertyQuery.isSuccess));
  const portalAccessQuery = usePropertyTasksCanEdit(propertyId);
  const revokeLocationAccess = useRevokePropertyLocationAccess(propertyId);

  useEffect(() => {
    if (!propertyQuery.isError || !propertyQuery.error) return;
    const msg =
      propertyQuery.error instanceof Error
        ? propertyQuery.error.message
        : "Nie udało się wczytać nieruchomości.";
    toast.error(msg);
    console.error("[PropertyDetails] property error:", propertyQuery.error);
  }, [propertyQuery.isError, propertyQuery.error]);

  useEffect(() => {
    if (!adminsQuery.isError || !adminsQuery.error) return;
    toast.error(
      adminsQuery.error instanceof Error
        ? adminsQuery.error.message
        : "Nie udało się wczytać administratorów budynku.",
    );
    console.error("[PropertyDetails] administrators error:", adminsQuery.error);
  }, [adminsQuery.isError, adminsQuery.error]);

  if (!propertyId) {
    return <Navigate to="/properties" replace />;
  }

  if (propertyQuery.isLoading) {
    return <PropertyDetailsSkeleton />;
  }

  if (propertyQuery.isError) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2"
          onClick={() => navigate("/properties")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Wróć do listy budynków
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {propertyQuery.error instanceof Error
              ? propertyQuery.error.message
              : "Nie udało się wczytać danych nieruchomości."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const property = propertyQuery.data;
  if (!property) {
    return null;
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2 mb-4"
          onClick={() => navigate("/properties")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Wróć do listy budynków
        </Button>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{property.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{property.address}</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid h-auto w-full max-w-6xl grid-cols-2 gap-1 p-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="general" className="text-xs sm:text-sm">
            Informacje ogólne
          </TabsTrigger>
          <TabsTrigger value="admins" className="text-xs sm:text-sm">
            Administratorzy
          </TabsTrigger>
          <TabsTrigger value="team" className="text-xs sm:text-sm">
            Zespół
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-xs sm:text-sm">
            Zadania
          </TabsTrigger>
          <TabsTrigger value="property-issues" className="text-xs sm:text-sm leading-tight">
            <span className="inline-flex items-center justify-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600/90" aria-hidden />
              Zgłoszenia
            </span>
          </TabsTrigger>
          <TabsTrigger value="contracts" className="text-xs sm:text-sm leading-tight">
            Umowy i Przeglądy
          </TabsTrigger>
          <TabsTrigger value="automations" className="text-xs sm:text-sm leading-tight">
            <span className="inline-flex items-center justify-center gap-1.5">
              <Zap className="h-3.5 w-3.5 shrink-0 text-amber-600/90" aria-hidden />
              Automatyzacje
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <PropertyGeneralInfoForm property={property} isOwner={isOwner} />
          <PropertySerwisQrAccessCard
            property={property}
            canManage={portalAccessQuery.data === true}
            accessPending={portalAccessQuery.isLoading}
          />
          <PropertyExternalAccessCard
            property={property}
            canManage={portalAccessQuery.data === true}
            accessPending={portalAccessQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="admins" className="mt-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Administratorzy budynku</CardTitle>
              <CardDescription>
                Pracownicy biura z dostępem administracyjnym (<code className="text-xs">location_access</code>,{" "}
                <code className="text-xs">access_type: administration</code>). Kliknij wiersz, aby otworzyć profil w
                Zespole.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {adminsQuery.isError && (
                <Alert variant="destructive">
                  <AlertDescription className="flex flex-wrap items-center gap-x-1 gap-y-1">
                    <span>
                      {adminsQuery.error instanceof Error
                        ? adminsQuery.error.message
                        : "Nie udało się wczytać listy."}
                    </span>
                    <Button type="button" variant="link" className="h-auto p-0" onClick={() => adminsQuery.refetch()}>
                      Spróbuj ponownie
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {adminsQuery.isLoading ? (
                <AdministratorsSkeleton showActions={isOwner} />
              ) : (adminsQuery.data ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Brak przypisanych administratorów dla tego obiektu.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Imię i nazwisko</TableHead>
                        <TableHead>E-mail</TableHead>
                        {isOwner ? <TableHead className="w-[72px] text-right">Akcje</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(adminsQuery.data ?? []).map((row) => {
                        const goTeam = row.membershipId
                          ? () => navigate(`/team/${row.membershipId}`)
                          : undefined;
                        const revoking =
                          revokeLocationAccess.isPending &&
                          revokeLocationAccess.variables === row.accessId;
                        return (
                          <TableRow
                            key={row.accessId}
                            className={cn(goTeam && "cursor-pointer")}
                            onClick={goTeam}
                          >
                            <TableCell className="font-medium">{row.fullName}</TableCell>
                            <TableCell className="text-muted-foreground">{row.email}</TableCell>
                            {isOwner ? (
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
                                    revokeLocationAccess.mutate(row.accessId);
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
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <PropertyTeamTab locationId={property.id} isOrgOwner={isOwner} />
        </TabsContent>

        <TabsContent value="issues" className="mt-6">
          <PropertyTasksTabWithAccess locationId={property.id} />
        </TabsContent>

        <TabsContent value="property-issues" className="mt-6">
          <PropertyIssuesTab locationId={property.id} />
        </TabsContent>

        <TabsContent value="contracts" className="mt-6">
          <PropertyContractsTab locationId={property.id} cKobBuildingId={property.cKobBuildingId} />
        </TabsContent>

        <TabsContent value="automations" className="mt-6">
          <PropertyAutomationsTab locationId={property.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
