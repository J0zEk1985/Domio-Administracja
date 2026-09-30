import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";

import {
  canonicalResidentHeader,
  isValidExtractedUnit,
  isValidResidentEmail,
  mapResidentSourceFields,
} from "@/lib/residentImportMapping";

const REQUIRED_FIELDS = ["email", "full_name", "unit_number"] as const;

const MISSING_COLUMNS_MESSAGE =
  "Plik musi mieć kolumny: Osoba, Lokale oraz Adresy e-mail do emisji dokumentów na datę (albo email, full_name, unit_number).";

const rowSchema = z.object({
  email: z
    .string()
    .min(1, "Adres e-mail jest pusty.")
    .max(320, "Adres e-mail jest za długi.")
    .refine((value) => isValidResidentEmail(value), "Niepoprawny format e-mail."),
  full_name: z
    .string()
    .min(1, "Podaj imię i nazwisko.")
    .max(200, "Imię i nazwisko może mieć najwyżej 200 znaków."),
  unit_number: z
    .string()
    .min(1, "Podaj numer lokalu.")
    .max(80, "Numer lokalu jest za długi.")
    .refine((value) => isValidExtractedUnit(value), "Lokal nie ma poprawnej struktury."),
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

function previewErrorRow(
  rowIndex: number,
  candidate: { email: string; full_name: string; unit_number: string },
  error: string
): CsvPreviewRow {
  return {
    rowIndex,
    email: candidate.email,
    fullName: candidate.full_name,
    unitNumber: candidate.unit_number,
    normalizedUnit: normalizeUnitNumber(candidate.unit_number),
    willCreateUnit: false,
    error,
  };
}

function isBlankSourceRow(raw: Record<string, string>): boolean {
  return !(raw.email ?? "").trim() && !(raw.full_name ?? "").trim() && !(raw.unit_number ?? "").trim();
}

export function parseResidentRecords(
  records: Array<{ rowIndex: number; raw: Record<string, string> }>,
  existingNormalized: ReadonlySet<string>
): CsvPreviewRow[] {
  const rows: CsvPreviewRow[] = [];

  for (const record of records) {
    if (isBlankSourceRow(record.raw)) continue;

    const candidate = mapResidentSourceFields(record.raw);
    if (candidate.unitError) {
      rows.push(previewErrorRow(record.rowIndex, candidate, candidate.unitError));
      continue;
    }

    const checked = rowSchema.safeParse(candidate);
    if (!checked.success) {
      const issue = checked.error.issues[0]?.message ?? "Niepoprawny wiersz.";
      rows.push(previewErrorRow(record.rowIndex, candidate, issue));
      continue;
    }

    const normalizedUnit = normalizeUnitNumber(checked.data.unit_number);
    if (!normalizedUnit) {
      rows.push(previewErrorRow(record.rowIndex, checked.data, "Podaj numer lokalu."));
      continue;
    }

    rows.push({
      rowIndex: record.rowIndex,
      email: checked.data.email,
      fullName: checked.data.full_name,
      unitNumber: checked.data.unit_number,
      normalizedUnit,
      willCreateUnit: !existingNormalized.has(normalizedUnit),
      error: null,
    });
  }

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

  return rows;
}

function parseMappedTable(
  fields: string[],
  records: Array<{ rowIndex: number; raw: Record<string, string> }>,
  existingNormalized: ReadonlySet<string>
): CsvParseResult {
  const mapped = fields.map((field) => canonicalResidentHeader(field) ?? field.trim());
  const missing = REQUIRED_FIELDS.filter((name) => !mapped.includes(name));
  if (missing.length > 0) {
    return { rows: [], fileError: MISSING_COLUMNS_MESSAGE };
  }
  return { rows: parseResidentRecords(records, existingNormalized), fileError: null };
}

export function parseResidentCsv(text: string, existingNormalized: ReadonlySet<string>): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => canonicalResidentHeader(header) ?? header.trim(),
  });

  const fields = (parsed.meta.fields ?? []).filter((field) => field.length > 0);
  const records = parsed.data.map((raw, index) => ({
    rowIndex: index + 2,
    raw: {
      email: raw.email ?? "",
      full_name: raw.full_name ?? "",
      unit_number: raw.unit_number ?? "",
    },
  }));

  return parseMappedTable(fields, records, existingNormalized);
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value);
}

export function parseResidentWorkbook(
  data: ArrayBuffer,
  existingNormalized: ReadonlySet<string>
): CsvParseResult {
  const workbook = XLSX.read(new Uint8Array(data), { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], fileError: "Plik Excel nie zawiera arkusza." };
  }

  const sheet = workbook.Sheets[sheetName];
  const table = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });

  if (table.length === 0) {
    return { rows: [], fileError: MISSING_COLUMNS_MESSAGE };
  }

  const headerRow = (table[0] ?? []).map((cell) => cellToString(cell));
  const fields = headerRow.map((header) => canonicalResidentHeader(header) ?? header.trim());
  const records: Array<{ rowIndex: number; raw: Record<string, string> }> = [];

  for (let index = 1; index < table.length; index += 1) {
    const line = table[index] ?? [];
    const raw: Record<string, string> = {};
    for (let col = 0; col < headerRow.length; col += 1) {
      const key = fields[col];
      if (!key) continue;
      raw[key] = cellToString(line[col]);
    }
    records.push({ rowIndex: index + 1, raw });
  }

  return parseMappedTable(fields, records, existingNormalized);
}

export function isResidentImportSpreadsheet(fileName: string): boolean {
  return /\.xlsx?$/i.test(fileName);
}

export function isResidentImportFile(fileName: string): boolean {
  return /\.(csv|xlsx|xls)$/i.test(fileName);
}

export const RESIDENT_CSV_TEMPLATE =
  "Osoba,Lokale,Adresy e-mail do emisji dokumentów na datę\nJan Kowalski,ul. Czechosłowacka 40/1,jan.kowalski@example.com\n";
