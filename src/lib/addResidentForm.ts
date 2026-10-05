import {
  extractUnitNumberFromLokale,
  isValidResidentEmail,
} from "@/lib/residentImportMapping";
import { normalizeUnitNumber } from "@/lib/residentCsv";

export type AddResidentUnitHint = {
  kind: "residential" | "technical";
  unitNumber: string;
  normalizedUnitNumber: string;
};

export type AddResidentFormInput = {
  fullName: string;
  email: string;
  unitNumber: string;
};

export type AddResidentFormResult =
  | { ok: false; error: string }
  | {
      ok: true;
      fullName: string;
      email: string;
      unitNumber: string;
      willCreateUnit: boolean;
    };

export function parseAddResidentForm(
  input: AddResidentFormInput,
  units: readonly AddResidentUnitHint[]
): AddResidentFormResult {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const extracted = extractUnitNumberFromLokale(input.unitNumber);

  if (fullName.length === 0) {
    return { ok: false, error: "Podaj imię i nazwisko." };
  }
  if (fullName.length > 200) {
    return { ok: false, error: "Imię i nazwisko może mieć najwyżej 200 znaków." };
  }
  if (!isValidResidentEmail(email)) {
    return { ok: false, error: "Podaj poprawny adres e-mail." };
  }
  if (extracted.error || !extracted.unitNumber) {
    return { ok: false, error: extracted.error ?? "Podaj numer lokalu." };
  }

  const normalized = normalizeUnitNumber(extracted.unitNumber);
  if (!normalized) {
    return { ok: false, error: "Podaj numer lokalu." };
  }

  const existing = units.find((unit) => unit.normalizedUnitNumber === normalized);
  if (existing?.kind === "technical") {
    return { ok: false, error: "Ten numer jest pomieszczeniem technicznym." };
  }

  return {
    ok: true,
    fullName,
    email,
    unitNumber: extracted.unitNumber,
    willCreateUnit: !existing,
  };
}
