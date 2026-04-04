import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

function formatTimeForDisplay(t: string | null | undefined): string | null {
  if (t == null || String(t).trim() === "") {
    return null;
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(t).trim());
  if (!m) {
    return null;
  }
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * One line for list/detail: date range plus optional daily time window (Postgres TIME strings).
 */
export function formatInspectionCampaignSchedule(
  startIso: string,
  endIso: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const a = parseISO(startIso);
  const b = parseISO(endIso);
  if (!isValid(a) || !isValid(b)) {
    return "—";
  }
  const datePart = `${format(a, "d MMM yyyy", { locale: pl })} — ${format(b, "d MMM yyyy", { locale: pl })}`;
  const st = formatTimeForDisplay(startTime);
  const et = formatTimeForDisplay(endTime);
  if (st && et) {
    return `${datePart}, ${st} – ${et}`;
  }
  return datePart;
}
