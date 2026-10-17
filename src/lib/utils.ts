import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOCALE = "fr-FR";

export function formatMoney(amount: number | null | undefined, currency = "XOF"): string {
  const value = Number(amount ?? 0);
  const fractionDigits = ["XOF", "XAF", "GNF", "JPY"].includes(currency) ? 0 : 2;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function formatScore(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: digits }).format(value);
}

/** Dates are stored as ISO `YYYY-MM-DD` (date) or full timestamps. */
export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", ...opts }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, { hour: "2-digit", minute: "2-digit" });
}

export function fullName(p: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!p) return "—";
  return [p.first_name, p.last_name?.toUpperCase()].filter(Boolean).join(" ") || "—";
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Local calendar date as YYYY-MM-DD (avoids UTC shifts). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
