/**
 * Hand-picked waste collection dates.
 * Used when pickups are irregular, such as bulk waste every 9 or 10 days.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import {
  formatIsoDateLocal,
  formatWasteDateCount,
  MAX_WASTE_SERIES_DATES,
  parseIsoDateLocal,
} from "@/lib/wasteScheduleSeries";

type Props = {
  dates: string[];
  onChange: (dates: string[]) => void;
};

function formatPickedDate(isoDate: string): string {
  const date = parseIsoDateLocal(isoDate);
  if (!date) return isoDate;
  return format(date, "EEEE, d MMMM yyyy", { locale: pl });
}

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates.filter((date) => parseIsoDateLocal(date)))].sort();
}

export function PickedWasteDatesEditor({ dates, onChange }: Props) {
  const [draftDate, setDraftDate] = useState("");

  const applyDates = (next: string[]) => {
    const unique = uniqueSortedDates(next);
    if (unique.length > MAX_WASTE_SERIES_DATES) {
      toast.error(`Można zaznaczyć najwyżej ${MAX_WASTE_SERIES_DATES} terminów naraz`);
      onChange(unique.slice(0, MAX_WASTE_SERIES_DATES));
      return;
    }
    onChange(unique);
  };

  const selected = dates
    .map((isoDate) => parseIsoDateLocal(isoDate))
    .filter((date): date is Date => date !== null);

  const addDraft = () => {
    if (!parseIsoDateLocal(draftDate)) {
      toast.error("Wybierz datę");
      return;
    }
    if (dates.includes(draftDate)) {
      toast.error("Ta data jest już na liście");
      return;
    }
    applyDates([...dates, draftDate]);
    setDraftDate("");
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Zaznacz daty w kalendarzu</Label>
        <p className="text-xs text-muted-foreground">
          Kliknij dni odbioru. Zmień miesiąc i dopisz kolejne terminy, także gdy odstępy nie są równe.
        </p>
        <div className="flex justify-center rounded-md border">
          <Calendar
            mode="multiple"
            selected={selected}
            onSelect={(next) => applyDates((next ?? []).map((date) => formatIsoDateLocal(date)))}
            locale={pl}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="picked-date">Albo wpisz datę</Label>
        <div className="flex gap-2">
          <Input
            id="picked-date"
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addDraft();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addDraft}>
            Dodaj datę
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Wybrane terminy</Label>
          <span className="text-xs text-muted-foreground">
            {dates.length === 0 ? "brak" : formatWasteDateCount(dates.length)}
          </span>
        </div>
        {dates.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            Nie zaznaczono żadnej daty.
          </p>
        ) : (
          <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
            {dates.map((date) => (
              <li key={date} className="flex items-center justify-between gap-2 rounded px-1 py-1 text-sm">
                <span>{formatPickedDate(date)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  aria-label={`Usuń ${formatPickedDate(date)}`}
                  onClick={() => onChange(dates.filter((item) => item !== date))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
