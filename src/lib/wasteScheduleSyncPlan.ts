/**
 * Decides which city-sync rows can be inserted.
 *
 * waste_collection_schedules rejects dates older than 7 days, and the only
 * uniqueness rule for automatic rows is a partial index. PostgREST upsert
 * cannot target that index, so the caller inserts the planned rows itself.
 */

export type WasteScheduleIdentity = {
  wasteType: string;
  collectionDate: string;
};

export type WasteScheduleInsertPlan<T extends WasteScheduleIdentity> = {
  toInsert: T[];
  skippedExisting: number;
  skippedTooOld: number;
};

const STORED_DATE_WINDOW_DAYS = 7;

export function minimumStoredCollectionDate(todayIso: string): string {
  const [year, month, day] = todayIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - STORED_DATE_WINDOW_DAYS);
  return date.toISOString().slice(0, 10);
}

export function todayIsoInWarsaw(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);
}

export function planWasteScheduleInserts<T extends WasteScheduleIdentity>(
  incoming: T[],
  existingKeys: ReadonlySet<string>,
  todayIso: string,
): WasteScheduleInsertPlan<T> {
  const minimumDate = minimumStoredCollectionDate(todayIso);
  const seen = new Set<string>();
  const toInsert: T[] = [];
  let skippedExisting = 0;
  let skippedTooOld = 0;

  for (const schedule of incoming) {
    const key = `${schedule.wasteType}|${schedule.collectionDate}`;
    if (schedule.collectionDate < minimumDate) {
      skippedTooOld += 1;
      continue;
    }
    if (seen.has(key) || existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    seen.add(key);
    toInsert.push(schedule);
  }

  return { toInsert, skippedExisting, skippedTooOld };
}
