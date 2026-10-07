/**
 * Łódź bulky-waste schedule client for Karta Łodzianina.
 *
 * The UM Łódź page embeds this endpoint. `typyOdpadow=470331414` is the
 * bulky-waste fraction ("Gabaryty"). `rodzajZabudowy=2` is multi-family housing.
 *
 * Source page:
 * https://uml.lodz.pl/dla-mieszkancow/ochrona-srodowiska/czyste-miasto/gospodarka-odpadami/harmonogramy-odbioru-odpadow/
 */

export const LODZ_BULK_WASTE_TYPE_ID = "470331414";
export const LODZ_MULTI_FAMILY_BUILDING_TYPE = "2";
export const LODZ_WASTE_ENDPOINT = "https://kartalodzianina.pl/wywozOdpadowTypy";
export const LODZ_WASTE_SCHEDULE_SOURCE =
  "https://uml.lodz.pl/dla-mieszkancow/ochrona-srodowiska/czyste-miasto/gospodarka-odpadami/harmonogramy-odbioru-odpadow/";

const NO_SCHEDULE_MARKER = "Brak dostępnego harmonogramu dla wskazanego adresu";
const UPSTREAM_ERROR_MARKER = "Ups... stało się coś nieoczekiwanego";

export type LodzBulkWasteDate = {
  wasteType: "bulk";
  collectionDate: string;
};

export type LodzBulkWasteQueryResult = {
  success: boolean;
  schedules: LodzBulkWasteDate[];
  error?: string;
  source?: string;
};

export function normalizeLodzStreet(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(ul\.?|ulica)\s+/i, "")
    .trim();
}

export function normalizeLodzBuildingNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export function assertLodzAddress(streetRaw: string, buildingRaw: string): {
  street: string;
  buildingNumber: string;
} {
  const street = normalizeLodzStreet(streetRaw);
  const buildingNumber = normalizeLodzBuildingNumber(buildingRaw);

  if (street.length < 2) {
    throw new Error("Podaj nazwę ulicy.");
  }
  if (street.length > 80) {
    throw new Error("Nazwa ulicy jest zbyt długa.");
  }
  if (!buildingNumber) {
    throw new Error("Podaj numer budynku.");
  }
  if (buildingNumber.length > 16) {
    throw new Error("Numer budynku jest zbyt długi.");
  }

  return { street, buildingNumber };
}

export function buildLodzBulkWasteRequestUrl(street: string, buildingNumber: string): string {
  const query = [
    "ajax",
    `typyOdpadow=${LODZ_BULK_WASTE_TYPE_ID}`,
    `ulica=${encodeURIComponent(street)}`,
    `nrDomu=${encodeURIComponent(buildingNumber)}`,
    "idMiejscowosci=undefined",
    `rodzajZabudowy=${LODZ_MULTI_FAMILY_BUILDING_TYPE}`,
    "scrollTop=0",
  ].join("&");

  return `${LODZ_WASTE_ENDPOINT}?${query}`;
}

export function parseLodzBulkWasteHtml(html: string): LodzBulkWasteDate[] {
  const events = extractEvents(html);
  if (!events) {
    if (html.includes(NO_SCHEDULE_MARKER)) {
      throw new Error("Brak dostępnego harmonogramu dla wskazanego adresu.");
    }
    // The success page embeds this sentence inside a script that searches for it.
    // A real upstream failure places the same sentence at the start of the HTML.
    if (html.indexOf(UPSTREAM_ERROR_MARKER) >= 0 && html.indexOf(UPSTREAM_ERROR_MARKER) < 500) {
      throw new Error("Serwer harmonogramu UM Łódź zwrócił błąd. Spróbuj ponownie za chwilę.");
    }
    throw new Error("Nie udało się odczytać harmonogramu ze strony miasta.");
  }

  const dates = new Set<string>();
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const record = event as { title?: unknown; description?: unknown; start?: unknown };
    const label = typeof record.title === "string" ? record.title : "";
    const description = typeof record.description === "string" ? record.description : "";
    if (!isBulkWasteLabel(label) && !isBulkWasteLabel(description)) continue;
    if (typeof record.start !== "string" || !isIsoDate(record.start.slice(0, 10))) continue;
    dates.add(record.start.slice(0, 10));
  }

  if (dates.size === 0) {
    throw new Error("Nie znaleziono terminów odbioru odpadów gabarytowych dla tego adresu.");
  }

  return [...dates]
    .sort((a, b) => a.localeCompare(b))
    .map((collectionDate) => ({ wasteType: "bulk", collectionDate }));
}

export async function queryLodzBulkWasteSchedule(
  streetRaw: string,
  buildingRaw: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LodzBulkWasteQueryResult> {
  try {
    const { street, buildingNumber } = assertLodzAddress(streetRaw, buildingRaw);
    const url = buildLodzBulkWasteRequestUrl(street, buildingNumber);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
        origin: "https://kartalodzianina.pl",
        referer: buildReferer(street, buildingNumber),
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
      signal: requestTimeoutSignal(20_000),
    });

    if (!response.ok) {
      throw new Error(`Serwer harmonogramu zwrócił błąd (HTTP ${response.status}).`);
    }

    const html = await response.text();
    const schedules = parseLodzBulkWasteHtml(html);
    return {
      success: true,
      schedules,
      source: LODZ_WASTE_SCHEDULE_SOURCE,
    };
  } catch (error) {
    console.error("[lodzBulkWasteScraper]", error);
    return {
      success: false,
      schedules: [],
      error: error instanceof Error ? error.message : "Nieznany błąd podczas pobierania harmonogramu",
    };
  }
}

function requestTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    timer.unref();
  }
  return controller.signal;
}

function buildReferer(street: string, buildingNumber: string): string {
  const query = [
    "iframe",
    "actionPerformedWyszukajTyp",
    "odpad=",
    `ulica=${encodeURIComponent(street)}`,
    `nrDomu=${encodeURIComponent(buildingNumber)}`,
    "idMiejscowosci=undefined",
    `rodzajZabudowy=${LODZ_MULTI_FAMILY_BUILDING_TYPE}`,
  ].join("&");
  return `https://kartalodzianina.pl/wywoz-odpadow?${query}`;
}

function isBulkWasteLabel(label: string): boolean {
  return label.toLowerCase().includes("gabaryt");
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function extractEvents(html: string): unknown[] | null {
  const marker = html.indexOf("events:");
  if (marker < 0) return null;
  const start = html.indexOf("[", marker);
  if (start < 0) return null;

  const end = findJsonArrayEnd(html, start);
  if (end < 0) return null;

  try {
    const parsed: unknown = JSON.parse(html.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error("[lodzBulkWasteScraper] events JSON parse failed:", error);
    return null;
  }
}

function findJsonArrayEnd(html: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(html.length, start + 200_000);

  for (let i = start; i < limit; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}
