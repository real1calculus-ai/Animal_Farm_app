/**
 * Reporting periods for the finance screens.
 *
 * A period is a half-open interval `[start, end)`. Half-open on purpose: an
 * inclusive end date has to be written as "23:59:59.999" to catch a
 * transaction recorded late in the evening, and every place that forgets to do
 * that silently drops the last day of the month out of the P&L.
 */

export const PERIOD_PRESETS = [
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
  "THIS_YEAR",
  "CUSTOM",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  THIS_MONTH: "This month",
  LAST_MONTH: "Last month",
  THIS_QUARTER: "This quarter",
  THIS_YEAR: "This year",
  CUSTOM: "Custom range",
};

export type Period = {
  preset: PeriodPreset;
  /** Inclusive. */
  start: Date;
  /** Exclusive — the instant after the last moment in the period. */
  end: Date;
  label: string;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function rangeLabel(start: Date, end: Date): string {
  const lastDay = new Date(end.getTime() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt(start)} — ${fmt(lastDay)}`;
}

/**
 * Resolves a preset (and, for CUSTOM, the two date strings from the query
 * string) into a concrete interval. Anything unparseable falls back to the
 * current month rather than throwing: this is driven by a URL the user can
 * hand-edit, and a mistyped date should re-render the page, not 500 it.
 */
export function resolvePeriod(
  preset: string | undefined,
  fromRaw?: string,
  toRaw?: string,
  now: Date = new Date()
): Period {
  const resolved: PeriodPreset = (PERIOD_PRESETS as readonly string[]).includes(preset ?? "")
    ? (preset as PeriodPreset)
    : "THIS_MONTH";

  if (resolved === "CUSTOM") {
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      const start = startOfDay(from);
      // `to` is the last day the user wants included, so the exclusive end is
      // the start of the following day.
      const end = new Date(startOfDay(to).getTime() + 86_400_000);
      if (end > start) {
        return { preset: "CUSTOM", start, end, label: rangeLabel(start, end) };
      }
    }
    // Fall through to this month when the custom range is absent or backwards.
  }

  switch (resolved) {
    case "LAST_MONTH": {
      const start = addMonths(startOfMonth(now), -1);
      const end = startOfMonth(now);
      return { preset: "LAST_MONTH", start, end, label: monthLabel(start) };
    }
    case "THIS_QUARTER": {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 1);
      return {
        preset: "THIS_QUARTER",
        start,
        end,
        label: `Q${quarter + 1} ${now.getFullYear()}`,
      };
    }
    case "THIS_YEAR": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      return { preset: "THIS_YEAR", start, end, label: String(now.getFullYear()) };
    }
    default: {
      const start = startOfMonth(now);
      const end = addMonths(start, 1);
      return { preset: "THIS_MONTH", start, end, label: monthLabel(start) };
    }
  }
}

/** The same-length interval immediately before `period`, for month-over-month. */
export function previousPeriod(period: Period): { start: Date; end: Date } {
  if (period.preset === "THIS_MONTH" || period.preset === "LAST_MONTH") {
    return { start: addMonths(period.start, -1), end: period.start };
  }
  const span = period.end.getTime() - period.start.getTime();
  return { start: new Date(period.start.getTime() - span), end: period.start };
}

/** The last `count` whole months ending with the month containing `now`. */
export function recentMonths(count: number, now: Date = new Date()): { start: Date; end: Date; label: string }[] {
  const current = startOfMonth(now);
  const months: { start: Date; end: Date; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = addMonths(current, -i);
    months.push({
      start,
      end: addMonths(start, 1),
      label: start.toLocaleDateString("en-GB", { month: "short" }),
    });
  }
  return months;
}

/** Percentage change as a fraction, or null when the baseline is zero. */
export function changeFraction(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
