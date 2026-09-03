/**
 * Date-range handling shared by every report.
 *
 * The range lives in the URL rather than in component state so a report is
 * linkable and survives a reload — a farm manager comparing two periods opens
 * two tabs, and a manager sending "look at last quarter's conception rate" to
 * the vet needs the link to carry the period with it.
 */

export const RANGE_PRESETS = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "6m", label: "Last 6 months", days: 183 },
  { key: "12m", label: "Last 12 months", days: 365 },
  { key: "24m", label: "Last 2 years", days: 730 },
  { key: "ytd", label: "This year to date", days: 0 },
  { key: "all", label: "All time", days: 0 },
] as const;

export type RangePresetKey = (typeof RANGE_PRESETS)[number]["key"];

export type DateRange = {
  from: Date;
  to: Date;
  /** "custom" when explicit from/to params were supplied. */
  preset: RangePresetKey | "custom";
  label: string;
  /** Whole days covered, used to choose weekly vs monthly buckets. */
  days: number;
};

export type SearchParamRecord = Record<string, string | string[] | undefined>;

const MS_PER_DAY = 86_400_000;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Resolves the range from `searchParams`. Falls back to the last 12 months —
 * long enough for a full breeding cycle plus a farrowing, which is the shortest
 * window in which most of these reports say anything at all.
 */
export function resolveDateRange(
  searchParams: SearchParamRecord,
  fallback: RangePresetKey = "12m"
): DateRange {
  const now = new Date();
  const explicitFrom = parseDate(first(searchParams.from));
  const explicitTo = parseDate(first(searchParams.to));

  if (explicitFrom || explicitTo) {
    const from = startOfDay(explicitFrom ?? new Date(now.getTime() - 365 * MS_PER_DAY));
    const to = endOfDay(explicitTo ?? now);
    // A backwards range is a typo, not an intent: swap rather than return zero rows.
    const [lo, hi] = from <= to ? [from, to] : [startOfDay(to), endOfDay(from)];
    return {
      from: lo,
      to: hi,
      preset: "custom",
      label: "Custom range",
      days: Math.max(1, Math.round((hi.getTime() - lo.getTime()) / MS_PER_DAY)),
    };
  }

  const requested = first(searchParams.range);
  const preset =
    RANGE_PRESETS.find((p) => p.key === requested) ??
    RANGE_PRESETS.find((p) => p.key === fallback)!;

  const to = endOfDay(now);
  let from: Date;

  if (preset.key === "ytd") {
    from = startOfDay(new Date(now.getFullYear(), 0, 1));
  } else if (preset.key === "all") {
    // Far enough back to include any plausible record, without Date(0)'s
    // timezone oddities showing up in axis labels.
    from = startOfDay(new Date(2000, 0, 1));
  } else {
    from = startOfDay(new Date(now.getTime() - preset.days * MS_PER_DAY));
  }

  return {
    from,
    to,
    preset: preset.key,
    label: preset.label,
    days: Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)),
  };
}

/** Query string that carries the current range onto another report link. */
export function rangeQuery(range: DateRange): string {
  if (range.preset === "custom") {
    return `?from=${toParam(range.from)}&to=${toParam(range.to)}`;
  }
  return `?range=${range.preset}`;
}

export function toParam(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type Bucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

/**
 * Splits the range into buckets for the time-series charts: weeks for short
 * ranges, months for long ones. Bucketing on read (rather than storing
 * pre-aggregated periods) keeps a late-entered record landing in the period it
 * actually happened in.
 */
export function buildBuckets(range: DateRange): Bucket[] {
  return range.days <= 120 ? weekBuckets(range) : monthBuckets(range);
}

export function monthBuckets(range: DateRange): Bucket[] {
  const buckets: Bucket[] = [];
  const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  // Guard against an "all time" range on a farm with a stray far-future date.
  let guard = 0;
  while (cursor <= range.to && guard < 400) {
    const start = new Date(cursor);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    buckets.push({
      key: `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, "0")}`,
      label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      start,
      end,
    });
    cursor.setMonth(cursor.getMonth() + 1);
    guard += 1;
  }
  return buckets;
}

export function weekBuckets(range: DateRange): Bucket[] {
  const buckets: Bucket[] = [];
  const cursor = startOfWeek(range.from);
  let guard = 0;
  while (cursor <= range.to && guard < 200) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + 7 * MS_PER_DAY - 1);
    buckets.push({
      key: toParam(start),
      label: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      start,
      end,
    });
    cursor.setDate(cursor.getDate() + 7);
    guard += 1;
  }
  return buckets;
}

/** Monday-anchored, matching how farm weeks are actually counted. */
export function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

/** Index of the bucket a date falls into, or -1 if it is outside the range. */
export function bucketIndexFor(buckets: Bucket[], date: Date): number {
  const time = date.getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (time >= buckets[i].start.getTime() && time <= buckets[i].end.getTime()) return i;
  }
  return -1;
}
