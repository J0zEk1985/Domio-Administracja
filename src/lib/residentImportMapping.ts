const EMAIL_PATTERN = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

/** Apartment token stored in community_units / sent to import_location_residents. */
const UNIT_PATTERN = /^[0-9]+[a-z]{0,2}$/i;

const UNIT_PREFIX_PATTERN = /^(m|lok|lokal|mieszkanie)[.\s]*/i;

const headerAliases: Record<string, "email" | "full_name" | "unit_number"> = {
  email: "email",
  "e-mail": "email",
  mail: "email",
  full_name: "full_name",
  fullname: "full_name",
  name: "full_name",
  "imie i nazwisko": "full_name",
  "imię i nazwisko": "full_name",
  osoba: "full_name",
  unit_number: "unit_number",
  lokal: "unit_number",
  lokale: "unit_number",
  numer: "unit_number",
  "numer lokalu": "unit_number",
};

export function canonicalResidentHeader(header: string): "email" | "full_name" | "unit_number" | null {
  const key = header.trim().toLowerCase().replace(/\s+/g, " ");
  if (headerAliases[key]) return headerAliases[key];
  if (key.includes("adresy e-mail") || key.includes("adresy email")) return "email";
  return null;
}

export function isValidResidentEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function isValidExtractedUnit(value: string): boolean {
  return UNIT_PATTERN.test(value);
}

/**
 * Maps "Lokale" (full address or compact unit) to the apartment number expected by
 * import_location_residents. "ul. Czechosłowacka 40/1" → "1".
 */
export function extractUnitNumberFromLokale(value: string): { unitNumber: string | null; error: string | null } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { unitNumber: null, error: "Pole lokalu jest puste." };
  }

  if (trimmed.includes("/")) {
    const apartment = trimmed.slice(trimmed.lastIndexOf("/") + 1).trim();
    if (!isValidExtractedUnit(apartment)) {
      return { unitNumber: null, error: "Lokal nie ma poprawnej struktury." };
    }
    return { unitNumber: apartment, error: null };
  }

  const withoutPrefix = trimmed.replace(UNIT_PREFIX_PATTERN, "").replace(/\s+/g, "");
  if (!isValidExtractedUnit(withoutPrefix)) {
    return { unitNumber: null, error: "Lokal nie ma poprawnej struktury." };
  }
  return { unitNumber: withoutPrefix, error: null };
}

export function mapResidentSourceFields(raw: Record<string, string>): {
  email: string;
  full_name: string;
  unit_number: string;
  unitError: string | null;
} {
  const full_name = (raw.full_name ?? "").trim();
  const email = (raw.email ?? "").toLowerCase().trim();
  const lokale = (raw.unit_number ?? "").trim();
  const extracted = extractUnitNumberFromLokale(lokale);
  return {
    email,
    full_name,
    unit_number: extracted.unitNumber ?? lokale,
    unitError: extracted.error,
  };
}
