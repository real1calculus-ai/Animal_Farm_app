/**
 * Nutritional performance maths — pure functions, no database access.
 *
 * Feed conversion ratio and average daily gain themselves live in
 * `src/lib/life-stage.ts` and are imported rather than re-implemented; this
 * module is the layer that turns rows of feeding and weight records into the
 * windows those two functions expect, and adds the things only the feed module
 * needs: cost per kg of gain, expected-versus-actual weight, and the
 * consumption-drop signal.
 */

import { averageDailyGain, feedConversionRatio } from "@/lib/life-stage";
import { MS_PER_DAY } from "@/lib/format";
import { roundKg } from "@/lib/feed/allocation";

/** The shape this module needs from a `FeedingRecord` row. */
export type IntakeRecord = {
  fedAt: Date;
  allocatedKg: number;
  consumedKg: number | null;
  costPerKgCents: number | null;
  animalCount: number;
};

/** The shape this module needs from a `WeightRecord` row. */
export type WeighIn = {
  recordedAt: Date;
  weightKg: number;
};

/**
 * What an animal actually ate. Falls back to the allocated figure when
 * consumption wasn't observed — on a real farm the trough is usually emptied,
 * and treating an unrecorded consumption as zero would make every FCR that
 * touches it meaningless rather than merely approximate.
 */
export function effectiveIntakeKg(record: IntakeRecord): number {
  return record.consumedKg ?? record.allocatedKg;
}

export function totalIntakeKg(records: readonly IntakeRecord[]): number {
  return roundKg(records.reduce((sum, r) => sum + effectiveIntakeKg(r), 0));
}

export function totalFeedCostCents(records: readonly IntakeRecord[]): number {
  return records.reduce(
    (sum, r) => sum + Math.round(effectiveIntakeKg(r) * (r.costPerKgCents ?? 0)),
    0
  );
}

export type GrowthWindow = {
  from: Date;
  to: Date;
  startWeightKg: number;
  endWeightKg: number;
  gainKg: number;
  days: number;
  /** kg/day, or null when the window is too short to be meaningful. */
  adgKgPerDay: number | null;
};

/**
 * First and last weigh-in in a series. Two weigh-ins are the minimum: gain is
 * a difference, and a single weight is not one.
 */
export function growthWindow(weighIns: readonly WeighIn[]): GrowthWindow | null {
  if (weighIns.length < 2) return null;

  const sorted = [...weighIns].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const days = (last.recordedAt.getTime() - first.recordedAt.getTime()) / MS_PER_DAY;
  if (days <= 0) return null;

  return {
    from: first.recordedAt,
    to: last.recordedAt,
    startWeightKg: first.weightKg,
    endWeightKg: last.weightKg,
    gainKg: roundKg(last.weightKg - first.weightKg),
    days,
    adgKgPerDay: averageDailyGain(first, last),
  };
}

export type PerformanceSummary = {
  feedKg: number;
  feedCostCents: number;
  gainKg: number | null;
  days: number | null;
  adgKgPerDay: number | null;
  /** kg feed per kg gain. Null on zero or negative gain. */
  fcr: number | null;
  /** Cost of the feed it took to put on one kg of liveweight. */
  costPerKgGainCents: number | null;
};

/**
 * Ties feed intake to liveweight gain over the same window.
 *
 * Only feeding records that fall inside the weigh-in window are counted —
 * charging six months of feed against a gain measured over two weeks would
 * produce an FCR that looks catastrophic for no reason.
 */
export function summarisePerformance(
  records: readonly IntakeRecord[],
  weighIns: readonly WeighIn[]
): PerformanceSummary {
  const window = growthWindow(weighIns);

  const inWindow = window
    ? records.filter(
        (r) =>
          r.fedAt.getTime() >= window.from.getTime() &&
          r.fedAt.getTime() <= window.to.getTime()
      )
    : records;

  const feedKg = totalIntakeKg(inWindow);
  const feedCostCents = totalFeedCostCents(inWindow);
  const gainKg = window?.gainKg ?? null;
  const fcr = gainKg === null ? null : feedConversionRatio(feedKg, gainKg);

  return {
    feedKg,
    feedCostCents,
    gainKg,
    days: window?.days ?? null,
    adgKgPerDay: window?.adgKgPerDay ?? null,
    fcr,
    costPerKgGainCents:
      gainKg !== null && gainKg > 0 ? Math.round(feedCostCents / gainKg) : null,
  };
}

/**
 * Reference growth curve for a commercial crossbred animal: age in days against
 * expected liveweight in kg. Interpolated linearly between points, and
 * extended past the last point at the final slope.
 *
 * This is a planning benchmark, not a breed standard — a farm running a
 * heritage breed will legitimately sit below it. It exists so "slow grower"
 * means something specific and consistent rather than a manager's impression.
 */
const REFERENCE_CURVE: readonly [ageDays: number, weightKg: number][] = [
  [0, 1.4],
  [21, 6],
  [28, 7.5],
  [42, 12],
  [56, 18],
  [70, 25],
  [84, 34],
  [98, 45],
  [112, 57],
  [126, 70],
  [140, 84],
  [154, 97],
  [168, 110],
  [182, 121],
];

export function expectedWeightKg(ageDays: number): number {
  if (ageDays <= 0) return REFERENCE_CURVE[0][1];

  for (let i = 1; i < REFERENCE_CURVE.length; i++) {
    const [prevAge, prevWeight] = REFERENCE_CURVE[i - 1];
    const [age, weight] = REFERENCE_CURVE[i];
    if (ageDays <= age) {
      const fraction = (ageDays - prevAge) / (age - prevAge);
      return prevWeight + fraction * (weight - prevWeight);
    }
  }

  const [lastAge, lastWeight] = REFERENCE_CURVE[REFERENCE_CURVE.length - 1];
  const [prevAge, prevWeight] = REFERENCE_CURVE[REFERENCE_CURVE.length - 2];
  const slope = (lastWeight - prevWeight) / (lastAge - prevAge);
  return lastWeight + (ageDays - lastAge) * slope;
}

/** Fraction above (+) or below (-) the reference curve. */
export function weightVariance(actualKg: number, ageDays: number): number {
  const expected = expectedWeightKg(ageDays);
  if (expected <= 0) return 0;
  return (actualKg - expected) / expected;
}

/** More than 15% under the curve is the threshold worth investigating. */
export const SLOW_GROWER_VARIANCE = -0.15;

export function isSlowGrower(actualKg: number, ageDays: number): boolean {
  return weightVariance(actualKg, ageDays) <= SLOW_GROWER_VARIANCE;
}

export type DailyIntake = {
  /** Midnight-anchored day key, `YYYY-MM-DD`. */
  day: string;
  date: Date;
  kg: number;
  animalCount: number;
  /** kg per animal — the figure that is actually comparable across days. */
  kgPerAnimal: number;
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Collapses feeding records into one row per day. Per-animal intake is
 * carried alongside the total because a pen's total drops when animals are sold
 * out of it, and that is not the drop anyone wants to be alerted about.
 */
export function dailyIntakeSeries(records: readonly IntakeRecord[]): DailyIntake[] {
  const byDay = new Map<string, { kg: number; animals: number; entries: number }>();

  for (const record of records) {
    const key = dayKey(record.fedAt);
    const bucket = byDay.get(key) ?? { kg: 0, animals: 0, entries: 0 };
    bucket.kg += effectiveIntakeKg(record);
    bucket.animals += record.animalCount;
    bucket.entries += 1;
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bucket]) => {
      // Average headcount across the day's entries, not the sum — feeding a
      // pen of 20 twice a day is 20 animals, not 40.
      const animalCount = bucket.entries > 0 ? bucket.animals / bucket.entries : 0;
      return {
        day,
        date: new Date(`${day}T00:00:00.000Z`),
        kg: roundKg(bucket.kg),
        animalCount: Math.round(animalCount),
        kgPerAnimal: animalCount > 0 ? roundKg(bucket.kg / animalCount) : 0,
      };
    });
}

export type ConsumptionDrop = {
  flagged: boolean;
  /** Mean kg/animal/day over the comparison baseline. */
  baselineKgPerAnimal: number;
  /** Mean kg/animal/day over the most recent days. */
  recentKgPerAnimal: number;
  /** Fraction below baseline, 0.32 = "down 32%". */
  dropFraction: number;
  baselineDays: number;
  recentDays: number;
};

/** A fifth off the usual intake is the point at which it is worth a look. */
export const CONSUMPTION_DROP_THRESHOLD = 0.2;

/**
 * Compares the last `recentDays` of intake against the `baselineDays` before
 * them and flags a sustained fall.
 *
 * A pen going off its feed is usually the first visible sign of illness, a
 * day or two before anything else shows — which is most of what this module
 * is for. Compared per animal so a sale out of the pen doesn't read as sick
 * animals, and it needs a full baseline before it will fire, because a new pen
 * with three days of history would otherwise flag constantly.
 */
export function detectConsumptionDrop(
  series: readonly DailyIntake[],
  {
    recentDays = 2,
    baselineDays = 7,
    threshold = CONSUMPTION_DROP_THRESHOLD,
  }: { recentDays?: number; baselineDays?: number; threshold?: number } = {}
): ConsumptionDrop | null {
  if (series.length < recentDays + baselineDays) return null;

  const recent = series.slice(-recentDays);
  const baseline = series.slice(-(recentDays + baselineDays), -recentDays);

  const mean = (rows: readonly DailyIntake[]) =>
    rows.reduce((sum, r) => sum + r.kgPerAnimal, 0) / rows.length;

  const baselineKgPerAnimal = mean(baseline);
  const recentKgPerAnimal = mean(recent);
  if (baselineKgPerAnimal <= 0) return null;

  const dropFraction = (baselineKgPerAnimal - recentKgPerAnimal) / baselineKgPerAnimal;

  return {
    flagged: dropFraction >= threshold,
    baselineKgPerAnimal: roundKg(baselineKgPerAnimal),
    recentKgPerAnimal: roundKg(recentKgPerAnimal),
    dropFraction,
    baselineDays: baseline.length,
    recentDays: recent.length,
  };
}
