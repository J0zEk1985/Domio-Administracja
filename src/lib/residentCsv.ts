import Papa from "papaparse";
import { z } from "zod";

const EMAIL_PATTERN = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

const headerAliases: Record<string, "email" | "full_name" | "unit_number"> = {
  email: "email",
  "e-mail": "email",
  mail: "email",
  full_name: "full_name",
  fullname: "full_name",
  name: "full_name",
  "imie i nazwisko": "full_name",
  "imię i nazwisko": "full_name",
  unit_number: "unit_number",
  lokal: "unit_number",
  numer: "unit_number",
  "numer lokalu": "unit_number",
};

const rowSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Podaj adres e-mail.")
    .max(320, "Adres e-mail jest za długi.")
    .refine((value) => EMAIL_PATTERN.test(value), "Niepoprawny format e-mail."),
  full_name: z
    .string()
    .trim()
    .min(1, "Podaj imię i nazwisko.")
    .max(200, "Imię i nazwisko może mieć najwyżej 200 znaków."),
  unit_number: z.string().trim().min(1, "Podaj numer lokalu.").max(80, "Numer lokalu jest za długi."),
});

export type CsvPreviewRow = {
  rowIndex: number;
  email: string;
  fullName: string;
  unitNumber: string;
  normalizedUnit: string | null;
  willCreateUnit: boolean;
  error: string | null;
};

export type CsvParseResult = {
  rows: CsvPreviewRow[];
  fileError: string | null;
};

/** Same rules as public.normalize_unit_number. */
export function normalizeUnitNumber(value: string | null | undefined): string | null {
  const stripped = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(m|lok|lokal|mieszkanie)[.\s]*/i, "")
    .replace(/\s+/g, "");
  return stripped.length > 0 ? stripped : null;
}

function canonicalHeader(header: string): "email" | "full_name" | "unit_number" | null {
  const key = header.trim().toLowerCase().replace(/\s+/g, " ");
  return headerAliases[key] ?? null;
}

export function parseResidentCsv(text: string, existingNormalized: ReadonlySet<string>): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => canonicalHeader(header) ?? header.trim(),
  });

  const fields = (parsed.meta.fields ?? []).filter((field) => field.length > 0);
  const missing = (["email", "full_name", "unit_number"] as const).filter((name) => !fields.includes(name));
  if (missing.length > 0) {
    return {
      rows: [],
      fileError: "Plik CSV musi mieć kolumny: email, full_name, unit_number.",
    };
  }

  const rows: CsvPreviewRow[] = parsed.data.map((raw, index) => {
    const rowIndex = index + 2;
    const candidate = {
      email: raw.email ?? "",
      full_name: raw.full_name ?? "",
      unit_number: raw.unit_number ?? "",
    };
    const checked = rowSchema.safeParse(candidate);
    if (!checked.success) {
      const issue = checked.error.issues[0]?.message ?? "Niepoprawny wiersz.";
      return {
        rowIndex,
        email: candidate.email.trim(),
        fullName: candidate.full_name.trim(),
        unitNumber: candidate.unit_number.trim(),
        normalizedUnit: normalizeUnitNumber(candidate.unit_number),
        willCreateUnit: false,
        error: issue,
      };
    }

    const normalizedUnit = normalizeUnitNumber(checked.data.unit_number);
    if (!normalizedUnit) {
      return {
        rowIndex,
        email: checked.data.email,
        fullName: checked.data.full_name,
        unitNumber: checked.data.unit_number,
        normalizedUnit: null,
        willCreateUnit: false,
        error: "Podaj numer lokalu.",
      };
    }

    return {
      rowIndex,
      email: checked.data.email.trim().toLowerCase(),
      fullName: checked.data.full_name.trim(),
      unitNumber: checked.data.unit_number.trim(),
      normalizedUnit,
      willCreateUnit: !existingNormalized.has(normalizedUnit),
      error: null,
    };
  });

  const seen = new Set<string>();
  for (const row of rows) {
    if (row.error || !row.normalizedUnit) continue;
    const key = `${row.email}\0${row.normalizedUnit}`;
    if (seen.has(key)) {
      row.error = "Ten e-mail powtarza się dla tego lokalu w pliku.";
      row.willCreateUnit = false;
    } else {
      seen.add(key);
    }
  }

  return { rows, fileError: null };
}

export const RESIDENT_CSV_TEMPLATE = "email,full_name,unit_number\njan.kowalski@example.com,Jan Kowalski,12\n";
