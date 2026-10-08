/**
 * Komponenty panelu zarządcy - wszystkie w jednym pliku
 * CreateResourceDialog, EditResourceDialog, PendingBookingsView, 
 * UsageReportsView, AvailabilityCalendarView
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import {
  useCreateCommunityResource,
  useUpdateResource,
  useResourceUsageReport,
  useAvailableResources,
} from "@/hooks/useSharedResources";
import { formatPrice } from "@/lib/sharedResourcesHelpers";
import type { SharedResource, BillingUnitType } from "@/types/sharedResources";

export { PendingBookingsView } from "@/components/shared-resources/admin/PendingBookingsView";
export { AvailabilityCalendarView } from "@/components/shared-resources/admin/AvailabilityCalendarView";

// ============================================================================
// CreateResourceDialog
// ============================================================================

interface CreateResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  locationId: string;
}

export function CreateResourceDialog({
  open,
  onOpenChange,
  communityId,
  locationId,
}: CreateResourceDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [billingUnit, setBillingUnit] = useState<BillingUnitType>("hourly");
  const [isFree, setIsFree] = useState(true);
  const [pricePerHour, setPricePerHour] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [requiresCheckIn, setRequiresCheckIn] = useState(false);
  const [requiresCheckOut, setRequiresCheckOut] = useState(false);
  const [requiresCheckOutPhoto, setRequiresCheckOutPhoto] = useState(false);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState("30");
  const [maxBookingsPerMonth, setMaxBookingsPerMonth] = useState("");
  const [maxHoursPerMonth, setMaxHoursPerMonth] = useState("");

  const createResource = useCreateCommunityResource();

  const handleSubmit = async () => {
    if (!name.trim()) return;

    const result = await createResource.mutateAsync({
      communityId,
      locationId,
      name: name.trim(),
      description: description.trim() || undefined,
      category: category || undefined,
      billingUnit,
      isFree,
      pricePerHour: isFree ? 0 : parseFloat(pricePerHour) || 0,
      pricePerDay: isFree ? 0 : parseFloat(pricePerDay) || 0,
      requiresManagerApproval: requiresApproval,
      requiresCheckIn,
      requiresCheckOut,
      requiresCheckOutPhoto,
      maxAdvanceBookingDays: parseInt(maxAdvanceDays) || 30,
      maxBookingsPerUnitMonthly: maxBookingsPerMonth
        ? parseInt(maxBookingsPerMonth)
        : undefined,
      maxHoursPerUnitMonthly: maxHoursPerMonth
        ? parseInt(maxHoursPerMonth)
        : undefined,
    });

    if (!result.error) {
      onOpenChange(false);
      // Reset
      setName("");
      setDescription("");
      setCategory("");
      setIsFree(true);
      setPricePerHour("");
      setPricePerDay("");
      setRequiresApproval(false);
      setRequiresCheckIn(false);
      setRequiresCheckOut(false);
      setRequiresCheckOutPhoto(false);
      setMaxAdvanceDays("30");
      setMaxBookingsPerMonth("");
      setMaxHoursPerMonth("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dodaj zasób wspólny</DialogTitle>
          <DialogDescription>
            Utwórz nowy zasób dostępny dla mieszkańców wspólnoty
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">
              Nazwa <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="np. Miejsca parkingowe dla gości"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Opis</Label>
            <Textarea
              id="description"
              placeholder="Opisz zasób..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Kategoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz kategorię" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parking">Parking</SelectItem>
                <SelectItem value="storage">Magazyn/Komórka</SelectItem>
                <SelectItem value="equipment">Sprzęt</SelectItem>
                <SelectItem value="recreation">Rekreacja</SelectItem>
                <SelectItem value="other">Inne</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>Bezpłatny zasób</Label>
              <p className="text-sm text-muted-foreground">
                Rezerwacja bez opłat
              </p>
            </div>
            <Switch checked={isFree} onCheckedChange={setIsFree} />
          </div>

          {!isFree && (
            <>
              <RadioGroup
                value={billingUnit}
                onValueChange={(v) => setBillingUnit(v as BillingUnitType)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="hourly" id="hourly" />
                  <Label htmlFor="hourly">Za godzinę</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="daily" id="daily" />
                  <Label htmlFor="daily">Za dobę</Label>
                </div>
              </RadioGroup>

              {billingUnit === "hourly" ? (
                <div className="grid gap-2">
                  <Label>Cena za godzinę (PLN)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={pricePerHour}
                    onChange={(e) => setPricePerHour(e.target.value)}
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>Cena za dobę (PLN)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={pricePerDay}
                    onChange={(e) => setPricePerDay(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="font-medium">Wymagania rezerwacji</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Wymaga zatwierdzenia zarządcy</Label>
                <Switch
                  checked={requiresApproval}
                  onCheckedChange={setRequiresApproval}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Wymaga check-in</Label>
                <Switch
                  checked={requiresCheckIn}
                  onCheckedChange={setRequiresCheckIn}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Wymaga check-out</Label>
                <Switch
                  checked={requiresCheckOut}
                  onCheckedChange={setRequiresCheckOut}
                />
              </div>
              {requiresCheckOut && (
                <div className="flex items-center justify-between">
                  <Label>Zdjęcie przy check-out</Label>
                  <Switch
                    checked={requiresCheckOutPhoto}
                    onCheckedChange={setRequiresCheckOutPhoto}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="font-medium">Limity Fair-Play</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Max rezerwacji/m-c na lokal</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Brak limitu"
                  value={maxBookingsPerMonth}
                  onChange={(e) => setMaxBookingsPerMonth(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Max godzin/m-c na lokal</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Brak limitu"
                  value={maxHoursPerMonth}
                  onChange={(e) => setMaxHoursPerMonth(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Maksymalne wyprzedzenie (dni)</Label>
            <Select value={maxAdvanceDays} onValueChange={setMaxAdvanceDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dni</SelectItem>
                <SelectItem value="14">14 dni</SelectItem>
                <SelectItem value="30">30 dni</SelectItem>
                <SelectItem value="60">60 dni</SelectItem>
                <SelectItem value="90">90 dni</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createResource.isPending}
          >
            {createResource.isPending ? (
              "Dodawanie..."
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Dodaj zasób
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EditResourceDialog - Podobny do Create, ale z istniejącymi wartościami
// ============================================================================

interface EditResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: SharedResource;
}

export function EditResourceDialog({
  open,
  onOpenChange,
  resource,
}: EditResourceDialogProps) {
  const [name, setName] = useState(resource.name);
  const [description, setDescription] = useState(resource.description || "");
  const [isFree, setIsFree] = useState(resource.isFree);
  const [pricePerHour, setPricePerHour] = useState(
    resource.pricePerHour.toString()
  );
  const [pricePerDay, setPricePerDay] = useState(
    resource.pricePerDay.toString()
  );

  const updateResource = useUpdateResource(resource.id);

  const handleSubmit = async () => {
    await updateResource.mutateAsync({
      name,
      description: description || null,
      is_free: isFree,
      price_per_hour: isFree ? 0 : parseFloat(pricePerHour) || 0,
      price_per_day: isFree ? 0 : parseFloat(pricePerDay) || 0,
    } as any);

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edytuj zasób</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nazwa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Opis</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <Label>Bezpłatny zasób</Label>
            <Switch checked={isFree} onCheckedChange={setIsFree} />
          </div>

          {!isFree && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Cena za godzinę (PLN)</Label>
                <Input
                  type="number"
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Cena za dobę (PLN)</Label>
                <Input
                  type="number"
                  value={pricePerDay}
                  onChange={(e) => setPricePerDay(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateResource.isPending}
          >
            {updateResource.isPending ? "Zapisywanie..." : "Zapisz zmiany"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ============================================================================
// UsageReportsView - Raporty wykorzystania zasobów
// ============================================================================

interface UsageReportsViewProps {
  communityId: string;
}

export function UsageReportsView({ communityId }: UsageReportsViewProps) {
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const { data: resources } = useAvailableResources({
    communityId,
    resourceType: "community_managed",
  });

  const { data: report, isLoading } = useResourceUsageReport(
    selectedResourceId,
    year,
    month
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raport wykorzystania zasobów</CardTitle>
        <CardDescription>
          Statystyki rezerwacji i wykorzystania per lokal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Zasób</Label>
            <Select
              value={selectedResourceId}
              onValueChange={setSelectedResourceId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz zasób" />
              </SelectTrigger>
              <SelectContent>
                {resources?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Rok</Label>
            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Miesiąc</Label>
            <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(2000, i).toLocaleString("pl-PL", {
                      month: "long",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-[200px]" />
        ) : report && report.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lokal</TableHead>
                  <TableHead>Rezerwacje</TableHead>
                  <TableHead>Godziny</TableHead>
                  <TableHead>Koszt</TableHead>
                  <TableHead>Wykorzystanie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((stat: any) => (
                  <TableRow key={stat.unit_id}>
                    <TableCell>{stat.unit_number}</TableCell>
                    <TableCell>
                      {stat.total_bookings}
                      {stat.limit_bookings && (
                        <span className="text-muted-foreground">
                          {" "}
                          / {stat.limit_bookings}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {stat.total_hours?.toFixed(1)}
                      {stat.limit_hours && (
                        <span className="text-muted-foreground">
                          {" "}
                          / {stat.limit_hours}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatPrice(stat.total_cost)}</TableCell>
                    <TableCell>
                      {stat.limit_hours && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${Math.min(
                                  (stat.total_hours / stat.limit_hours) * 100,
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm">
                            {((stat.total_hours / stat.limit_hours) * 100).toFixed(
                              0
                            )}
                            %
                          </span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {selectedResourceId
                ? "Brak danych dla wybranego okresu"
                : "Wybierz zasób aby zobaczyć raport"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

