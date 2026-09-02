/**
 * Money is stored throughout as integer minor units ("cents" — kobo for the
 * default NGN locale) so arithmetic never drifts the way float currency does.
 * These helpers are the only place that conversion happens.
 */

const DEFAULT_CURRENCY = "NGN";

/** Formats integer minor units as a currency string, e.g. 125000 -> "₦1,250.00". */
export function formatCents(cents: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Formats integer minor units with no decimals, for dense tables and tiles. */
export function formatCentsCompact(cents: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Parses a user-typed amount ("1,250.50") into integer minor units. */
export function toCents(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return Number.NaN;
  // Round rather than truncate: 12.345 -> 1235, not 1234.
  return Math.round(parsed * 100);
}

export function formatKg(kg: number | null | undefined, digits = 1): string {
  if (kg === null || kg === undefined) return "—";
  return `${kg.toFixed(digits)} kg`;
}

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Value for an <input type="date">. */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export const MS_PER_DAY = 86_400_000;

/** Whole days between two instants (b - a), floored. */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Age in days as of `asOf` (defaults to now). */
export function ageInDays(dateOfBirth: Date, asOf: Date = new Date()): number {
  return daysBetween(dateOfBirth, asOf);
}

/** Human-readable age: "3 yr 2 mo" / "14 wk" / "5 d". */
export function formatAge(dateOfBirth: Date | null | undefined, asOf: Date = new Date()): string {
  if (!dateOfBirth) return "—";
  const days = ageInDays(dateOfBirth, asOf);
  if (days < 0) return "—";
  if (days < 14) return `${days} d`;
  if (days < 120) return `${Math.floor(days / 7)} wk`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years < 1) return `${Math.floor(days / 30)} mo`;
  return months > 0 ? `${years} yr ${months} mo` : `${years} yr`;
}
