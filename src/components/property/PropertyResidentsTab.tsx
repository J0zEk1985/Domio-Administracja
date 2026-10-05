import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { AddResidentDialog } from "@/components/property/AddResidentDialog";
import { ResidentCsvImportDialog } from "@/components/property/ResidentCsvImportDialog";
import { PropertyUnitRegistryCard } from "@/components/property/PropertyUnitRegistryCard";
import {
  ResidentsTableSortableHead,
  sortPropertyOccupants,
  type ResidentSortDir,
  type ResidentSortKey,
} from "@/components/property/ResidentsTableSortableHead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  usePropertyResidents,
  useRemoveUnitOccupant,
  useUpdateUnitOccupant,
  type PropertyOccupantRow,
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
  const removeOccupant = useRemoveUnitOccupant(locationId);
  const updateOccupant = useUpdateUnitOccupant(locationId);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PropertyOccupantRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [sort, setSort] = useState<{ key: ResidentSortKey; dir: ResidentSortDir }>({
    key: "unitNumber",
    dir: "asc",
  });

  const units = residentsQuery.data?.units ?? [];
  const occupants = residentsQuery.data?.occupants ?? [];
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const existingNormalized = useMemo(
    () => new Set(units.map((unit) => unit.normalizedUnitNumber)),
    [units]
  );

  const sortedOccupants = useMemo(() => {
    const unitNumberById = new Map(units.map((unit) => [unit.id, unit.unitNumber]));
    return sortPropertyOccupants(occupants, unitNumberById, sort);
  }, [occupants, sort, units]);

  const handleSortColumn = (key: ResidentSortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const openEdit = (occupant: PropertyOccupantRow) => {
    setEditing(occupant);
    setEditName(occupant.fullName);
    setEditEmail(occupant.email);
  };

  const onSaveOccupant = () => {
    if (!editing) return;
    updateOccupant.mutate(
      { occupantId: editing.id, fullName: editName, email: editEmail },
      {
        onSuccess: () => {
          setEditing(null);
          toast.success("Zapisano dane mieszkańca.");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Nie udało się zapisać mieszkańca.");
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {!communityId ? (
        <Alert>
          <AlertDescription>
            Ten budynek nie ma przypisanej wspólnoty. Dodawanie mieszkańców i pomieszczenia techniczne wymagają wspólnoty.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Mieszkańcy</CardTitle>
            <CardDescription>
              Zmiana e-maila odbiera dostęp do Home poprzedniemu kontu. Nowy adres czeka na logowanie albo
              od razu dostaje dostęp, jeśli konto już istnieje. Brakujący lokal powstaje przy dodawaniu
              mieszkańca.
            </CardDescription>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setAddOpen(true)} disabled={!communityId}>
                <Plus className="mr-2 h-4 w-4" />
                Dodaj mieszkańca
              </Button>
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)} disabled={!communityId}>
                <Upload className="mr-2 h-4 w-4" />
                Import mieszkańców
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {residentsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : residentsQuery.isError ? (
            <p className="text-sm text-destructive">
              {residentsQuery.error instanceof Error
                ? residentsQuery.error.message
                : "Nie udało się wczytać mieszkańców."}
            </p>
          ) : occupants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak przypisanych mieszkańców.</p>
          ) : (
            <div className="max-h-[min(70vh,36rem)] overflow-auto">
              <Table className="[&_th]:h-8 [&_th]:px-3 [&_th]:py-0 [&_td]:px-3 [&_td]:py-1">
                <TableHeader>
                  <TableRow>
                    <ResidentsTableSortableHead
                      label="Imię i nazwisko"
                      sortKey="fullName"
                      activeKey={sort.key}
                      direction={sort.dir}
                      onSort={handleSortColumn}
                    />
                    <TableHead>E-mail</TableHead>
                    <ResidentsTableSortableHead
                      label="Lokal"
                      sortKey="unitNumber"
                      activeKey={sort.key}
                      direction={sort.dir}
                      onSort={handleSortColumn}
                    />
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="w-20 text-right">Akcje</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOccupants.map((occupant) => {
                    const unit = unitById.get(occupant.unitId);
                    return (
                      <TableRow key={occupant.id}>
                        <TableCell className="font-medium">{occupant.fullName}</TableCell>
                        <TableCell>{occupant.email}</TableCell>
                        <TableCell className="tabular-nums">{unit?.unitNumber ?? "—"}</TableCell>
                        <TableCell>
                          {occupant.userId ? (
                            <Badge variant="secondary" className="px-2 py-0">
                              Konto aktywne
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="px-2 py-0">
                              Oczekuje na logowanie
                            </Badge>
                          )}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-end gap-0.5">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label={`Edytuj ${occupant.fullName}`}
                                onClick={() => openEdit(occupant)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
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
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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

      <PropertyUnitRegistryCard
        locationId={locationId}
        orgId={orgId}
        communityId={communityId}
        canManage={canManage}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj mieszkańca</DialogTitle>
            <DialogDescription>
              Zmiana e-maila odcina poprzednie konto od tego lokalu w DOMIO Home.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="occupant-name">Imię i nazwisko</Label>
              <Input
                id="occupant-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="occupant-email">E-mail</Label>
              <Input
                id="occupant-email"
                type="email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Anuluj
            </Button>
            <Button
              type="button"
              disabled={updateOccupant.isPending || editName.trim().length === 0 || editEmail.trim().length === 0}
              onClick={onSaveOccupant}
            >
              {updateOccupant.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddResidentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        locationId={locationId}
        units={units}
      />

      <ResidentCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        locationId={locationId}
        existingNormalized={existingNormalized}
      />
    </div>
  );
}
