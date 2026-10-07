/**
 * Bulk waste collection dates: one waste type, a fixed interval,
 * and a horizon (default six months) saved in a single request.
 */

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

import { useCreateWasteSchedules } from "@/hooks/useWasteManagement";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import {
  addMonthsToIsoDate,
  generateWasteCollectionDates,
  parseIsoDateLocal,
  WASTE_SCHEDULE_INTERVALS,
  type WasteScheduleInterval,
} from "@/lib/wasteScheduleSeries";
import type { WasteType } from "@/types/wasteManagement";

function polishTerminCount(count: number): string {
  if (count === 1) return "1 termin";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} terminy`;
  }
  return `${count} terminów`;
}

function formatSeriesDate(isoDate: string): string {
  const date = parseIsoDateLocal(isoDate);
  if (!date) return isoDate;
  return format(date, "EEEE, d MMMM yyyy", { locale: pl });
}

const HORIZON_PRESETS = [
  { months: 3, label: "3 mies." },
  { months: 6, label: "6 mies." },
  { months: 12, label: "12 mies." },
] as const;

type Props = {
  locationId: string;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddWasteScheduleSeriesDialog({ locationId, orgId, open, onOpenChange }: Props) {
  const [wasteType, setWasteType] = useState<WasteType>("mixed");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [horizonMonths, setHorizonMonths] = useState<3 | 6 | 12 | null>(6);
  const [interval, setInterval] = useState<WasteScheduleInterval>("weekly");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeUntil, setTimeUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  const createMutation = useCreateWasteSchedules();

  const series = useMemo(
    () => (startDate && endDate ? generateWasteCollectionDates(startDate, endDate, interval) : { dates: [], truncated: false }),
    [startDate, endDate, interval],
  );

  const selectedDates = series.dates.filter((date) => !excluded.has(date));

  const applyStartDate = (value: string) => {
    setStartDate(value);
    setExcluded(new Set());
    if (value && horizonMonths) {
      setEndDate(addMonthsToIsoDate(value, horizonMonths));
    }
  };

  const applyHorizon = (months: 3 | 6 | 12) => {
    setHorizonMonths(months);
    setExcluded(new Set());
    if (startDate) {
      setEndDate(addMonthsToIsoDate(startDate, months));
    }
  };

  const resetForm = () => {
    setStartDate("");
    setEndDate("");
    setHorizonMonths(6);
    setTimeFrom("");
    setTimeUntil("");
    setNotes("");
    setExcluded(new Set());
  };

  const toggleDate = (date: string, checked: boolean) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (checked) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!startDate || !endDate) {
      toast.error("Podaj datę pierwszego i ostatniego odbioru");
      return;
    }

    if (endDate < startDate) {
      toast.error("Data końcowa nie może być wcześniejsza niż pierwszy odbiór");
      return;
    }

    if (selectedDates.length === 0) {
      toast.error("Zaznacz co najmniej jeden termin");
      return;
    }

    createMutation.mutate(
      selectedDates.map((collectionDate) => ({
        locationId,
        orgId,
        wasteType,
        collectionDate,
        collectionTimeFrom: timeFrom || undefined,
        collectionTimeUntil: timeUntil || undefined,
        notes: notes || undefined,
      })),
      {
        onSuccess: (result) => {
          if (result.created.length === 0) {
            toast.error("Te terminy są już w harmonogramie");
            return;
          }

          if (result.skipped > 0) {
            toast.success(
              `Dodano ${polishTerminCount(result.created.length)}. Pominięto ${result.skipped} już zapisanych.`,
            );
          } else {
            toast.success(`Dodano ${polishTerminCount(result.created.length)} odbioru`);
          }

          onOpenChange(false);
          resetForm();
        },
        onError: (error) => {
          toast.error(`Błąd: ${error.message}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-2">
          <CalendarRange className="h-4 w-4" />
          Dodaj zbiorczo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dodaj terminy zbiorczo</DialogTitle>
            <DialogDescription>
              Wygeneruj serię odbiorów, na przykład co tydzień przez najbliższe pół roku.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="series-waste-type">Typ odpadu</Label>
              <Select value={wasteType} onValueChange={(value) => setWasteType(value as WasteType)}>
                <SelectTrigger id="series-waste-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Zmieszane (Czarny)</SelectItem>
                  <SelectItem value="plastic">Metale i tworzywa sztuczne (Żółty)</SelectItem>
                  <SelectItem value="paper">Papier (Niebieski)</SelectItem>
                  <SelectItem value="glass">Szkło (Zielony)</SelectItem>
                  <SelectItem value="bio">Bio (Brązowy)</SelectItem>
                  <SelectItem value="bulk">Gabaryty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="series-start">Pierwszy odbiór</Label>
                <Input
                  id="series-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => applyStartDate(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="series-end">Ostatni odbiór</Label>
                <Input
                  id="series-end"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => {
                    setHorizonMonths(null);
                    setExcluded(new Set());
                    setEndDate(event.target.value);
                  }}
                  required
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {HORIZON_PRESETS.map((preset) => (
                <Button
                  key={preset.months}
                  type="button"
                  size="sm"
                  variant={horizonMonths === preset.months ? "default" : "outline"}
                  onClick={() => applyHorizon(preset.months)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="series-interval">Częstotliwość</Label>
              <Select
                value={interval}
                onValueChange={(value) => {
                  setExcluded(new Set());
                  setInterval(value as WasteScheduleInterval);
                }}
              >
                <SelectTrigger id="series-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WASTE_SCHEDULE_INTERVALS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="series-time-from">Godzina od</Label>
                <Input
                  id="series-time-from"
                  type="time"
                  value={timeFrom}
                  onChange={(event) => setTimeFrom(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="series-time-until">Godzina do</Label>
                <Input
                  id="series-time-until"
                  type="time"
                  value={timeUntil}
                  onChange={(event) => setTimeUntil(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="series-notes">Notatki</Label>
              <Textarea
                id="series-notes"
                placeholder="Dodatkowe informacje dla mieszkańców..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Terminy do dodania</Label>
                <span className="text-xs text-muted-foreground">{polishTerminCount(selectedDates.length)}</span>
              </div>
              {series.dates.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  Wybierz datę pierwszego odbioru. Koniec serii ustawi się na 6 miesięcy do przodu.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {series.dates.map((date) => (
                    <label key={date} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60">
                      <Checkbox
                        checked={!excluded.has(date)}
                        onCheckedChange={(checked) => toggleDate(date, checked === true)}
                        aria-label={formatSeriesDate(date)}
                      />
                      <span>{formatSeriesDate(date)}</span>
                    </label>
                  ))}
                </div>
              )}
              {series.truncated && (
                <p className="text-xs text-muted-foreground">
                  Pokazano pierwsze {series.dates.length} terminów. Skróć zakres albo zapisz tę część i dodaj kolejną.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={createMutation.isPending || selectedDates.length === 0}>
              {createMutation.isPending ? "Dodawanie..." : `Dodaj ${polishTerminCount(selectedDates.length)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
