import Papa from "papaparse";

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Neutralises spreadsheet formula injection (CWE-1236): a cell starting with
 * = + - @ TAB or CR is prefixed with an apostrophe.
 */
export function sanitizeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (typeof value === "number") return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Builds a UTF-8 CSV (with BOM for Excel) using `;` — the usual separator in French locales. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const data = rows.map((r) => columns.map((c) => sanitizeCell(c.value(r))));
  return "﻿" + Papa.unparse({ fields: columns.map((c) => c.header), data }, { delimiter: ";", quotes: true });
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeHeader(h),
    transform: (v) => v.trim(),
  });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
