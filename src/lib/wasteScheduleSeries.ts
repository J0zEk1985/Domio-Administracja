/**
 * Generates a half-year (or custom range) waste collection series
 * from a start date and a fixed interval.
 */

export type WasteScheduleInterval = "weekly" | "biweekly" | "every_4_weeks" | "monthly";

export const WASTE_SCHEDULE_INTERVALS: { value: WasteScheduleInterval; label: string }[] = [
  { value: "weekly", label: "Co tydzień" },
  { value: "biweekly", label: "Co 2 tygodnie" },
  { value: "every_4_weeks", label: "Co 4 tygodnie" },
  { value: "monthly", label: "Co miesiąc" },
];

/** Two years of weekly pickups. Longer ranges are split across saves. */
export const MAX_WASTE_SERIES_DATES = 104;

const INTERVAL_DAYS: Record<Exclude<WasteScheduleInterval, "monthly">, number> = {
  weekly: 7,
  biweekly: 14,
  every_4_weeks: 28,
};

export function parseIsoDateLocal(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function formatIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarMonths(start: Date, months: number): Date {
  const day = start.getDate();
  const target = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonthsToIsoDate(isoDate: string, months: number): string {
  const start = parseIsoDateLocal(isoDate);
  if (!start) return isoDate;
  return formatIsoDateLocal(addCalendarMonths(start, months));
}

export function generateWasteCollectionDates(
  startDate: string,
  endDate: string,
  interval: WasteScheduleInterval,
  maxDates = MAX_WASTE_SERIES_DATES,
): { dates: string[]; truncated: boolean } {
  const start = parseIsoDateLocal(startDate);
  const end = parseIsoDateLocal(endDate);

  if (!start || !end || start > end || maxDates < 1) {
    return { dates: [], truncated: false };
  }

  const dates: string[] = [];
  let step = 0;
  let truncated = false;

  while (true) {
    const cursor =
      interval === "monthly"
        ? addCalendarMonths(start, step)
        : addDays(start, INTERVAL_DAYS[interval] * step);

    if (cursor > end) break;

    if (dates.length >= maxDates) {
      truncated = true;
      break;
    }

    dates.push(formatIsoDateLocal(cursor));
    step += 1;
  }

  return { dates, truncated };
}
