import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { toast } from "@/components/ui/sonner";
import {
  useCreateResidentialUnit,
  useCreateTechnicalUnit,
  useDeletePropertyUnit,
  usePropertyResidents,
  useUpdatePropertyUnit,
  type PropertyUnitRow,
} from "@/hooks/usePropertyResidents";

type PropertyUnitRegistryCardProps = {
  locationId: string;
  orgId: string;
  communityId: string | null;
  canManage: boolean;
};

export function PropertyUnitRegistryCard({
  locationId,
  orgId,
  communityId,
  canManage,
}: PropertyUnitRegistryCardProps) {
  const residentsQuery = usePropertyResidents(locationId);
  const createTechnical = useCreateTechnicalUnit(locationId);
  const createResidential = useCreateResidentialUnit(locationId);
  const updateUnit = useUpdatePropertyUnit(locationId);
  const deleteUnit = useDeletePropertyUnit(locationId);
  const [technicalName, setTechnicalName] = useState("");
  const [residentialNumber, setResidentialNumber] = useState("");
  const [editingUnit, setEditingUnit] = useState<PropertyUnitRow | null>(null);
  const [editValue, setEditValue] = useState("");

  const units = residentsQuery.data?.units ?? [];
  const occupants = residentsQuery.data?.occupants ?? [];
  const occupantCountByUnit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const occupant of occupants) {
      counts.set(occupant.unitId, (counts.get(occupant.unitId) ?? 0) + 1);
    }
    return counts;
  }, [occupants]);

  const onAddResidential = () => {
    if (!communityId) return;
    createResidential.mutate(
      { orgId, communityId, unitNumber: residentialNumber },
      {
        onSuccess: () => {
          setResidentialNumber("");
          toast.success("Dodano lokal.");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Nie udało się dodać lokalu.");
        },
      }
    );
  };

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

  const onSaveEdit = () => {
    if (!editingUnit) return;
    updateUnit.mutate(
      { unitId: editingUnit.id, unitNumber: editValue, kind: editingUnit.kind },
      {
        onSuccess: () => {
          setEditingUnit(null);
          toast.success("Zapisano zmiany lokalu.");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Nie udało się zapisać lokalu.");
        },
      }
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Rejestr lokali</CardTitle>
          <CardDescription>
            Dodaj lokal mieszkalny albo pomieszczenie techniczne ręcznie. Import CSV nadal zakłada brakujące mieszkania.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage && communityId ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="residential-unit">Lokal mieszkalny</Label>
                  <Input
                    id="residential-unit"
                    value={residentialNumber}
                    placeholder="np. 12"
                    onChange={(event) => setResidentialNumber(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={createResidential.isPending || residentialNumber.trim().length === 0}
                  onClick={onAddResidential}
                >
                  {createResidential.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Dodaj
                </Button>
              </div>
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
            </div>
          ) : null}

          {residentsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : units.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rejestr jest pusty. Dodaj lokal albo wgraj plik CSV.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numer / nazwa</TableHead>
                    <TableHead>Rodzaj</TableHead>
                    <TableHead>Mieszkańcy</TableHead>
                    {canManage ? <TableHead className="w-24 text-right">Akcje</TableHead> : null}
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
                              aria-label={`Edytuj ${title}`}
                              onClick={() => {
                                setEditingUnit(unit);
                                setEditValue(title);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
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

      <Dialog open={editingUnit !== null} onOpenChange={(open) => !open && setEditingUnit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUnit?.kind === "technical" ? "Edytuj pomieszczenie" : "Edytuj lokal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="edit-unit">{editingUnit?.kind === "technical" ? "Nazwa" : "Numer lokalu"}</Label>
            <Input id="edit-unit" value={editValue} onChange={(event) => setEditValue(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingUnit(null)}>
              Anuluj
            </Button>
            <Button
              type="button"
              disabled={updateUnit.isPending || editValue.trim().length === 0}
              onClick={onSaveEdit}
            >
              {updateUnit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
