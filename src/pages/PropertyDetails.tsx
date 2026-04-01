import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
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
import { useProperty, usePropertyAdministrators } from "@/hooks/useProperties";
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { PropertyGeneralInfoForm } from "@/components/property/PropertyGeneralInfoForm";
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

function AdministratorsSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Imię i nazwisko</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead className="w-[120px] text-right">Akcje</TableHead>
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
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-8 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ModulePlaceholder() {
  return (
    <div
      className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/10 px-6 py-12 text-center"
      role="status"
    >
      <p className="text-sm text-muted-foreground">Moduł w przygotowaniu</p>
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
        <TabsList className="grid w-full max-w-3xl grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
          <TabsTrigger value="general" className="text-xs sm:text-sm">
            Informacje ogólne
          </TabsTrigger>
          <TabsTrigger value="admins" className="text-xs sm:text-sm">
            Administratorzy
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-xs sm:text-sm">
            Zgłoszenia
          </TabsTrigger>
          <TabsTrigger value="contracts" className="text-xs sm:text-sm leading-tight">
            Umowy i Przeglądy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <PropertyGeneralInfoForm property={property} isOwner={isOwner} />
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
                <AdministratorsSkeleton />
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
                        <TableHead className="w-[140px] text-right">Akcje</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(adminsQuery.data ?? []).map((row) => {
                        const goTeam = row.membershipId
                          ? () => navigate(`/team/${row.membershipId}`)
                          : undefined;
                        return (
                          <TableRow
                            key={row.accessId}
                            className={cn(goTeam && "cursor-pointer")}
                            onClick={goTeam}
                          >
                            <TableCell className="font-medium">{row.fullName}</TableCell>
                            <TableCell className="text-muted-foreground">{row.email}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Moduł Komunikacja w przygotowaniu");
                                }}
                              >
                                <Mail className="h-3.5 w-3.5" aria-hidden />
                                Napisz wiadomość
                              </Button>
                            </TableCell>
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

        <TabsContent value="issues" className="mt-6">
          <ModulePlaceholder />
        </TabsContent>

        <TabsContent value="contracts" className="mt-6">
          <ModulePlaceholder />
        </TabsContent>
      </Tabs>
    </div>
  );
}
