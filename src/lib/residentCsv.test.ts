import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  parseResidentCsv,
  parseResidentWorkbook,
  normalizeUnitNumber,
} from "@/lib/residentCsv";
import { extractUnitNumberFromLokale } from "@/lib/residentImportMapping";

describe("normalizeUnitNumber", () => {
  it("strips a unit prefix and spaces", () => {
    expect(normalizeUnitNumber("  m. 12 ")).toBe("12");
    expect(normalizeUnitNumber("lok. 4")).toBe("4");
  });

  it("returns null for an empty label", () => {
    expect(normalizeUnitNumber("  m. ")).toBeNull();
  });
});

describe("extractUnitNumberFromLokale", () => {
  it("takes the apartment after the last slash in a street address", () => {
    expect(extractUnitNumberFromLokale("ul. Czechosłowacka 40/1")).toEqual({
      unitNumber: "1",
      error: null,
    });
    expect(extractUnitNumberFromLokale("  ul. Czechosłowacka 40/12A ")).toEqual({
      unitNumber: "12A",
      error: null,
    });
  });

  it("keeps a compact unit number", () => {
    expect(extractUnitNumberFromLokale("12")).toEqual({ unitNumber: "12", error: null });
    expect(extractUnitNumberFromLokale("m. 7")).toEqual({ unitNumber: "7", error: null });
  });

  it("rejects an address without an apartment number", () => {
    expect(extractUnitNumberFromLokale("ul. Czechosłowacka 40").error).toBe(
      "Lokal nie ma poprawnej struktury."
    );
  });

  it("rejects an empty lokale cell", () => {
    expect(extractUnitNumberFromLokale("   ").error).toBe("Pole lokalu jest puste.");
  });
});

describe("parseResidentCsv", () => {
  it("maps the Polish document-export headers and extracts the unit", () => {
    const csv =
      " Osoba , Lokale , Adresy e-mail do emisji dokumentów na datę \n" +
      " Jan Kowalski , ul. Czechosłowacka 40/1 , JakKowalwski@wp.pl \n";
    const result = parseResidentCsv(csv, new Set(["1"]));
    expect(result.fileError).toBeNull();
    expect(result.rows[0]).toMatchObject({
      rowIndex: 2,
      email: "jakkowalwski@wp.pl",
      fullName: "Jan Kowalski",
      unitNumber: "1",
      normalizedUnit: "1",
      willCreateUnit: false,
      error: null,
    });
  });

  it("marks a missing residential unit as one that will be created", () => {
    const result = parseResidentCsv(
      "email,full_name,unit_number\nAnna@Example.com,Anna Nowak,m. 7\n",
      new Set(["1"])
    );
    expect(result.fileError).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowIndex: 2,
      email: "anna@example.com",
      fullName: "Anna Nowak",
      normalizedUnit: "7",
      willCreateUnit: true,
      error: null,
    });
  });

  it("keeps a format error on the source row", () => {
    const result = parseResidentCsv(
      "email,full_name,unit_number\nnie-email,Jan Kowalski,3\n",
      new Set()
    );
    expect(result.rows[0]?.error).toBe("Niepoprawny format e-mail.");
    expect(result.rows[0]?.rowIndex).toBe(2);
  });

  it("reports an empty email with the source row index", () => {
    const result = parseResidentCsv(
      "Osoba,Lokale,Adresy e-mail do emisji dokumentów na datę\nJan Kowalski,40/1,\n",
      new Set()
    );
    expect(result.rows[0]?.error).toBe("Adres e-mail jest pusty.");
    expect(result.rows[0]?.rowIndex).toBe(2);
  });
});

describe("parseResidentWorkbook", () => {
  it("validates the sample Excel schema row by row", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Osoba", "Lokale", "Adresy e-mail do emisji dokumentów na datę"],
      ["Jan Kowalski", "ul. Czechosłowacka 40/1", "jakkowalwski@wp.pl"],
      ["  Anna Nowak  ", " ul. Czechosłowacka 40/2 ", " Anna.Nowak@Example.com "],
      ["Piotr Lis", "ul. Czechosłowacka 40", "piotr.lis@example.com"],
      ["Ewa Bąk", "40/3", "nie-email"],
      ["Marek Zieliński", "40/4", ""],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Mieszkańcy");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const result = parseResidentWorkbook(buffer, new Set(["1"]));
    expect(result.fileError).toBeNull();
    expect(result.rows).toHaveLength(5);

    expect(result.rows[0]).toMatchObject({
      rowIndex: 2,
      email: "jakkowalwski@wp.pl",
      fullName: "Jan Kowalski",
      unitNumber: "1",
      willCreateUnit: false,
      error: null,
    });
    expect(result.rows[1]).toMatchObject({
      rowIndex: 3,
      email: "anna.nowak@example.com",
      unitNumber: "2",
      willCreateUnit: true,
      error: null,
    });
    expect(result.rows[2]).toMatchObject({
      rowIndex: 4,
      error: "Lokal nie ma poprawnej struktury.",
    });
    expect(result.rows[3]).toMatchObject({
      rowIndex: 5,
      error: "Niepoprawny format e-mail.",
    });
    expect(result.rows[4]).toMatchObject({
      rowIndex: 6,
      error: "Adres e-mail jest pusty.",
    });
  });
});
