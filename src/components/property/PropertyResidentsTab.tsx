import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { ResidentCsvImportDialog } from "@/components/property/ResidentCsvImportDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useCreateTechnicalUnit,
  useDeletePropertyUnit,
  usePropertyResidents,
  useRemoveUnitOccupant,
} from "@/hooks/usePropertyResidents";

type PropertyResidentsTabProps = {
  locationId: string;
  orgId: string;
  communityId: string | null;
  canManage: boolean;
};

export function PropertyResidentsTab({
  locationId,
  orgId,
  communityId,
  canManage,
}: PropertyResidentsTabProps) {
  const residentsQuery = usePropertyResidents(locationId);
  const createTechnical = useCreateTechnicalUnit(locationId);
  const deleteUnit = useDeletePropertyUnit(locationId);
  const removeOccupant = useRemoveUnitOccupant(locationId);
  const [importOpen, setImportOpen] = useState(false);
  const [technicalName, setTechnicalName] = useState("");

  const units = residentsQuery.data?.units ?? [];
  const occupants = residentsQuery.data?.occupants ?? [];
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const occupantCountByUnit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const occupant of occupants) {
      counts.set(occupant.unitId, (counts.get(occupant.unitId) ?? 0) + 1);
    }
    return counts;
  }, [occupants]);
  const existingNormalized = useMemo(
    () => new Set(units.map((unit) => unit.normalizedUnitNumber)),
    [units]
  );

  const onAddTechnical = () => {
    if (!communityId) return;
    createTechnical.mutate(
      { orgId, communityId, label: technicalName },
      {
        onSuccess: () => {
          setTechnicalName("");
          toast.success("Dodano pomieszczenie techniczne.");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Nie udało się dodać pomieszczenia.");
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {!communityId ? (
        <Alert>
          <AlertDescription>
            Ten budynek nie ma przypisanej wspólnoty. Import CSV i pomieszczenia techniczne wymagają wspólnoty.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Mieszkańcy</CardTitle>
            <CardDescription>
              Import z CSV zakłada brakujące lokale mieszkalne. Konto bez użytkownika czeka na logowanie w DOMIO Home.
            </CardDescription>
          </div>
          {canManage ? (
            <Button type="button" onClick={() => setImportOpen(true)} disabled={!communityId}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {residentsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : residentsQuery.isError ? (
            <p className="text-sm text-destructive">Nie udało się wczytać mieszkańców.</p>
          ) : occupants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak przypisanych mieszkańców.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imię i nazwisko</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Lokal</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="w-16 text-right">Akcje</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {occupants.map((occupant) => {
                    const unit = unitById.get(occupant.unitId);
                    return (
                      <TableRow key={occupant.id}>
                        <TableCell className="font-medium">{occupant.fullName}</TableCell>
                        <TableCell>{occupant.email}</TableCell>
                        <TableCell className="tabular-nums">{unit?.unitNumber ?? "—"}</TableCell>
                        <TableCell>
                          {occupant.userId ? (
                            <Badge variant="secondary">Konto aktywne</Badge>
                          ) : (
                            <Badge variant="outline">Oczekuje na logowanie</Badge>
                          )}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Usuń ${occupant.fullName}`}
                              disabled={removeOccupant.isPending}
                              onClick={() =>
                                removeOccupant.mutate(occupant.id, {
                                  onSuccess: () => toast.success("Usunięto mieszkańca z lokalu."),
                                  onError: (error) =>
                                    toast.error(
                                      error instanceof Error ? error.message : "Nie udało się usunąć mieszkańca."
                                    ),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
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

      <Card>
        <CardHeader>
          <CardTitle>Rejestr lokali</CardTitle>
          <CardDescription>
            Lokale mieszkalne powstają przy imporcie. Tutaj dodasz pomieszczenie techniczne albo usuniesz pusty wpis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage && communityId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="technical-room">Pomieszczenie techniczne</Label>
                <Input
                  id="technical-room"
                  value={technicalName}
                  placeholder="np. Węzeł cieplny"
                  onChange={(event) => setTechnicalName(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={createTechnical.isPending || technicalName.trim().length === 0}
                onClick={onAddTechnical}
              >
                {createTechnical.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Dodaj
              </Button>
            </div>
          ) : null}

          {residentsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : units.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rejestr jest pusty. Wgraj plik CSV z mieszkańcami.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numer / nazwa</TableHead>
                    <TableHead>Rodzaj</TableHead>
                    <TableHead>Mieszkańcy</TableHead>
                    {canManage ? <TableHead className="w-16 text-right">Akcje</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((unit) => {
                    const count = occupantCountByUnit.get(unit.id) ?? 0;
                    const title = unit.kind === "technical" ? unit.label || unit.unitNumber : unit.unitNumber;
                    return (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">{title}</TableCell>
                        <TableCell>
                          {unit.kind === "technical" ? "Pomieszczenie techniczne" : "Lokal mieszkalny"}
                        </TableCell>
                        <TableCell className="tabular-nums">{count}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Usuń ${title}`}
                              disabled={count > 0 || deleteUnit.isPending}
                              onClick={() =>
                                deleteUnit.mutate(unit.id, {
                                  onSuccess: () => toast.success("Usunięto lokal z rejestru."),
                                  onError: (error) =>
                                    toast.error(
                                      error instanceof Error ? error.message : "Nie udało się usunąć lokalu."
                                    ),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
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

      <ResidentCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        locationId={locationId}
        existingNormalized={existingNormalized}
      />
    </div>
  );
}
