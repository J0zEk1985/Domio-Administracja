/**
 * DOMIO Administracja - Gospodarka Odpadami
 * Panel zarządzania harmonogramem odbioru odpadów dla wspólnoty
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useWasteSchedule,
  useCreateWasteSchedule,
  useUpdateWasteSchedule,
  useDeleteWasteSchedule,
  useSyncWasteScheduleFromCity,
} from "@/hooks/useWasteManagement";
import { fetchWasteSyncLogs } from "@/lib/wasteManagementApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Plus, RefreshCw, Trash2, AlertCircle, Download, Edit } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { getWasteTypeConfig } from "@/lib/wasteConstants";
import type { WasteType, WasteCollectionSchedule } from "@/types/wasteManagement";
import type { CommunityLocationRow } from "@/hooks/useProperties";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";

type Props = {
  communityId: string;
  orgId: string;
  buildings: CommunityLocationRow[];
};

export function CommunityWasteTab({ communityId, orgId, buildings }: Props) {
  const primaryLocation = buildings[0];
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WasteCollectionSchedule | null>(null);

  // Pobierz harmonogram dla pierwszego budynku (reprezentuje wspólnotę)
  const {
    data: schedules,
    isLoading: schedulesLoading,
    error: schedulesError,
  } = useWasteSchedule(primaryLocation?.id || "", {
    enabled: Boolean(primaryLocation?.id),
  });

  // Mutations
  const createMutation = useCreateWasteSchedule();
  const updateMutation = useUpdateWasteSchedule();
  const deleteMutation = useDeleteWasteSchedule();
  const syncMutation = useSyncWasteScheduleFromCity();

  if (!primaryLocation) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Dodaj co najmniej jeden budynek do wspólnoty, aby zarządzać harmonogramem odbioru odpadów.
        </AlertDescription>
      </Alert>
    );
  }

  const handleDelete = async (schedule: WasteCollectionSchedule) => {
    if (!confirm(`Czy na pewno chcesz usunąć termin odbioru ${getWasteTypeConfig(schedule.wasteType).label} z dnia ${format(parseISO(schedule.collectionDate), "d MMMM yyyy", { locale: pl })}?`)) {
      return;
    }

    deleteMutation.mutate(
      { scheduleId: schedule.id, locationId: primaryLocation.id },
      {
        onSuccess: () => {
          toast.success("Termin odbioru został usunięty");
        },
        onError: (error) => {
          toast.error(`Błąd: ${error.message}`);
        },
      }
    );
  };

  const handleCancelSchedule = (schedule: WasteCollectionSchedule) => {
    updateMutation.mutate(
      {
        scheduleId: schedule.id,
        locationId: primaryLocation.id,
        updates: {
          isCancelled: true,
          cancellationNote: "Anulowane przez administratora",
        },
      },
      {
        onSuccess: () => {
          toast.success("Termin został anulowany");
        },
        onError: (error) => {
          toast.error(`Błąd: ${error.message}`);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header z akcjami */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Harmonogram Odbioru Odpadów</CardTitle>
              <CardDescription>
                Zarządzaj terminami wywozu odpadów dla wspólnoty
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <AddScheduleDialog
                locationId={primaryLocation.id}
                orgId={orgId}
                open={addDialogOpen}
                onOpenChange={setAddDialogOpen}
              />
              <SyncFromCityDialog
                locationId={primaryLocation.id}
                orgId={orgId}
                address={primaryLocation.address}
                open={syncDialogOpen}
                onOpenChange={setSyncDialogOpen}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {schedulesLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {schedulesError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Błąd: {(schedulesError as Error).message}
              </AlertDescription>
            </Alert>
          )}

          {!schedulesLoading && schedules && schedules.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Brak harmonogramu odbioru odpadów
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dodaj terminy ręcznie lub zsynchronizuj z miastem
              </p>
            </div>
          )}

          {!schedulesLoading && schedules && schedules.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Typ odpadu</TableHead>
                  <TableHead>Godziny</TableHead>
                  <TableHead>Źródło</TableHead>
                  <TableHead>Notatki</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const config = getWasteTypeConfig(schedule.wasteType);
                  const date = parseISO(schedule.collectionDate);

                  return (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-medium">
                        {format(date, "d MMMM yyyy", { locale: pl })}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${config.bgColor} ${config.color} border-0`}>
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {schedule.collectionTimeFrom
                          ? `${schedule.collectionTimeFrom}${schedule.collectionTimeUntil ? ` - ${schedule.collectionTimeUntil}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {schedule.dataSource === "manual"
                            ? "Ręcznie"
                            : schedule.cityAdapter || "Miasto"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {schedule.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingSchedule(schedule)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(schedule)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Logi synchronizacji */}
      <SyncLogsCard locationId={primaryLocation.id} />

      {/* Dialog edycji */}
      {editingSchedule && (
        <EditScheduleDialog
          schedule={editingSchedule}
          locationId={primaryLocation.id}
          open={Boolean(editingSchedule)}
          onOpenChange={(open) => !open && setEditingSchedule(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Dialogi
// ============================================================================

function AddScheduleDialog({
  locationId,
  orgId,
  open,
  onOpenChange,
}: {
  locationId: string;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [wasteType, setWasteType] = useState<WasteType>("bulk");
  const [collectionDate, setCollectionDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeUntil, setTimeUntil] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreateWasteSchedule();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!collectionDate) {
      toast.error("Podaj datę odbioru");
      return;
    }

    createMutation.mutate(
      {
        locationId,
        orgId,
        wasteType,
        collectionDate,
        collectionTimeFrom: timeFrom || undefined,
        collectionTimeUntil: timeUntil || undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Termin odbioru został dodany");
          onOpenChange(false);
          // Reset form
          setCollectionDate("");
          setTimeFrom("");
          setTimeUntil("");
          setNotes("");
        },
        onError: (error) => {
          toast.error(`Błąd: ${error.message}`);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Dodaj termin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dodaj termin odbioru</DialogTitle>
            <DialogDescription>
              Wprowadź dane harmonogramu ręcznie
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="waste-type">Typ odpadu</Label>
              <Select value={wasteType} onValueChange={(v) => setWasteType(v as WasteType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bulk">Gabaryty</SelectItem>
                  <SelectItem value="plastic">Metale i tworzywa sztuczne (Żółty)</SelectItem>
                  <SelectItem value="paper">Papier (Niebieski)</SelectItem>
                  <SelectItem value="glass">Szkło (Zielony)</SelectItem>
                  <SelectItem value="bio">Bio (Brązowy)</SelectItem>
                  <SelectItem value="mixed">Zmieszane (Czarny)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="collection-date">Data odbioru</Label>
              <Input
                id="collection-date"
                type="date"
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time-from">Godzina od</Label>
                <Input
                  id="time-from"
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time-until">Godzina do</Label>
                <Input
                  id="time-until"
                  type="time"
                  value={timeUntil}
                  onChange={(e) => setTimeUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notatki</Label>
              <Textarea
                id="notes"
                placeholder="Dodatkowe informacje dla mieszkańców..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Dodawanie..." : "Dodaj termin"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SyncFromCityDialog({
  locationId,
  orgId,
  address,
  open,
  onOpenChange,
}: {
  locationId: string;
  orgId: string;
  address: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [street, setStreet] = useState("");
  const [buildingNumber, setBuildingNumber] = useState("");
  const [cityAdapter, setCityAdapter] = useState("lodz");

  const syncMutation = useSyncWasteScheduleFromCity();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!street || !buildingNumber) {
      toast.error("Podaj adres budynku");
      return;
    }

    syncMutation.mutate(
      {
        locationId,
        orgId,
        cityAdapter,
        street,
        buildingNumber,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success(`Zsynchronizowano ${result.recordsAdded} terminów z miasta`);
            onOpenChange(false);
          } else {
            toast.error(`Błąd synchronizacji: ${result.error}`);
          }
        },
        onError: (error) => {
          toast.error(`Błąd: ${error.message}`);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Synchronizuj z miastem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Synchronizacja z harmonogramem miasta</DialogTitle>
            <DialogDescription>
              Pobierz terminy odbioru ze strony UML Łódź
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Uwaga:</strong> Obecnie adapter Łodzi używa mockowych danych.
                Do produkcji wymaga implementacji scrapera strony UML.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="city-adapter">Miasto</Label>
              <Select value={cityAdapter} onValueChange={setCityAdapter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lodz">Łódź</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Ulica</Label>
              <Input
                id="street"
                placeholder="np. Piotrkowska"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="building-number">Numer budynku</Label>
              <Input
                id="building-number"
                placeholder="np. 104"
                value={buildingNumber}
                onChange={(e) => setBuildingNumber(e.target.value)}
                required
              />
            </div>

            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Adres budynku: {address}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={syncMutation.isPending}>
              {syncMutation.isPending ? "Synchronizuję..." : "Synchronizuj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditScheduleDialog({
  schedule,
  locationId,
  open,
  onOpenChange,
}: {
  schedule: WasteCollectionSchedule;
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [notes, setNotes] = useState(schedule.notes || "");
  const [timeFrom, setTimeFrom] = useState(schedule.collectionTimeFrom || "");
  const [timeUntil, setTimeUntil] = useState(schedule.collectionTimeUntil || "");

  const updateMutation = useUpdateWasteSchedule();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    updateMutation.mutate(
      {
        scheduleId: schedule.id,
        locationId,
        updates: {
          collectionTimeFrom: timeFrom || null,
          collectionTimeUntil: timeUntil || null,
          notes: notes || null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Termin został zaktualizowany");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(`Błąd: ${error.message}`);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edytuj termin odbioru</DialogTitle>
            <DialogDescription>
              {getWasteTypeConfig(schedule.wasteType).label} -{" "}
              {format(parseISO(schedule.collectionDate), "d MMMM yyyy", { locale: pl })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-time-from">Godzina od</Label>
                <Input
                  id="edit-time-from"
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time-until">Godzina do</Label>
                <Input
                  id="edit-time-until"
                  type="time"
                  value={timeUntil}
                  onChange={(e) => setTimeUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notatki</Label>
              <Textarea
                id="edit-notes"
                placeholder="Dodatkowe informacje dla mieszkańców..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Zapisuję..." : "Zapisz zmiany"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SyncLogsCard({ locationId }: { locationId: string }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["waste-sync-logs", locationId],
    queryFn: () => fetchWasteSyncLogs(locationId, 5),
    enabled: Boolean(locationId),
  });

  if (isLoading) {
    return null;
  }

  if (!logs || logs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historia synchronizacji</CardTitle>
        <CardDescription>Ostatnie 5 synchronizacji z harmonogramem miasta</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Miasto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dodano</TableHead>
              <TableHead>Błąd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm">
                  {format(parseISO(log.syncedAt), "d.MM.yyyy HH:mm", { locale: pl })}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{log.cityAdapter}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={log.syncStatus === "success" ? "default" : "destructive"}
                  >
                    {log.syncStatus === "success" ? "Sukces" : "Błąd"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {log.recordsAdded}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-destructive">
                  {log.errorMessage || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
