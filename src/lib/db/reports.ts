import "server-only";

import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/format";
import type { DateRange, Bucket } from "@/components/reports/date-range";
import { bucketIndexFor, buildBuckets } from "@/components/reports/date-range";
import { LIVESTOCK_ONLY } from "@/lib/species-catalogue";

/**
 * Aggregation queries behind the reports.
 *
 * These deliberately return plain numbers rather than pre-formatted strings,
 * and they bucket by date range rather than by a fixed period, so the same
 * query serves the dashboard's short window and a year-long review.
 */

// ---------------------------------------------------------------------------
// Breeding
// ---------------------------------------------------------------------------

export type ConceptionRow = {
  id: string;
  tagNumber: string;
  name: string | null;
  matings: number;
  conceived: number;
  /** Null under three settled outcomes — below that it is noise, not a rate. */
  rate: number | null;
};

const MIN_OUTCOMES_FOR_RATE = 3;

async function conceptionBy(
  farmId: string,
  range: DateRange,
  side: "sireId" | "damId"
): Promise<ConceptionRow[]> {
  const records = await prisma.breedingRecord.findMany({
    where: {
      farmId,
      breedingDate: { gte: range.from, lte: range.to },
      pregnancyStatus: { not: "PENDING" },
    },
    select: {
      pregnancyStatus: true,
      sire: { select: { id: true, tagNumber: true, name: true } },
      dam: { select: { id: true, tagNumber: true, name: true } },
    },
  });

  const totals = new Map<string, ConceptionRow>();

  for (const record of records) {
    const animal = side === "sireId" ? record.sire : record.dam;
    const row =
      totals.get(animal.id) ??
      ({
        id: animal.id,
        tagNumber: animal.tagNumber,
        name: animal.name,
        matings: 0,
        conceived: 0,
        rate: null,
      } satisfies ConceptionRow);

    row.matings += 1;
    if (record.pregnancyStatus === "CONFIRMED" || record.pregnancyStatus === "FARROWED") {
      row.conceived += 1;
    }
    totals.set(animal.id, row);
  }

  return [...totals.values()]
    .map((row) => ({
      ...row,
      rate: row.matings >= MIN_OUTCOMES_FOR_RATE ? row.conceived / row.matings : null,
    }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
}

export const conceptionBySire = (farmId: string, range: DateRange) =>
  conceptionBy(farmId, range, "sireId");
export const conceptionByDam = (farmId: string, range: DateRange) =>
  conceptionBy(farmId, range, "damId");

export type LitterStats = {
  litters: number;
  totalBornAlive: number;
  totalStillborn: number;
  totalMummified: number;
  totalWeaned: number;
  avgBornAlive: number | null;
  avgWeaned: number | null;
  stillbirthRate: number | null;
  preWeaningMortality: number | null;
};

export async function litterStats(farmId: string, range: DateRange): Promise<LitterStats> {
  const litters = await prisma.litter.findMany({
    where: {
      breedingRecord: { farmId },
      farrowingDate: { gte: range.from, lte: range.to },
    },
    select: { bornAlive: true, stillborn: true, mummified: true, weanedCount: true },
  });

  const totalBornAlive = litters.reduce((s, l) => s + l.bornAlive, 0);
  const totalStillborn = litters.reduce((s, l) => s + l.stillborn, 0);
  const totalMummified = litters.reduce((s, l) => s + l.mummified, 0);

  const weanedLitters = litters.filter((l) => l.weanedCount !== null);
  const totalWeaned = weanedLitters.reduce((s, l) => s + (l.weanedCount ?? 0), 0);
  const bornAliveInWeaned = weanedLitters.reduce((s, l) => s + l.bornAlive, 0);

  const totalBorn = totalBornAlive + totalStillborn + totalMummified;

  return {
    litters: litters.length,
    totalBornAlive,
    totalStillborn,
    totalMummified,
    totalWeaned,
    avgBornAlive: litters.length > 0 ? totalBornAlive / litters.length : null,
    avgWeaned: weanedLitters.length > 0 ? totalWeaned / weanedLitters.length : null,
    stillbirthRate: totalBorn > 0 ? (totalStillborn + totalMummified) / totalBorn : null,
    // Measured only over litters that reached weaning: including litters still
    // on the sow would report every recent farrowing as 100% mortality.
    preWeaningMortality:
      bornAliveInWeaned > 0 ? (bornAliveInWeaned - totalWeaned) / bornAliveInWeaned : null,
  };
}

export type BucketedSeries = { buckets: Bucket[]; values: (number | null)[] };

/** Average litter size per bucket — the trend the spec asks for (§5.2). */
export async function litterSizeTrend(farmId: string, range: DateRange): Promise<BucketedSeries> {
  const buckets = buildBuckets(range);

  const litters = await prisma.litter.findMany({
    where: {
      breedingRecord: { farmId },
      farrowingDate: { gte: range.from, lte: range.to },
    },
    select: { farrowingDate: true, bornAlive: true },
  });

  const sums = buckets.map(() => 0);
  const counts = buckets.map(() => 0);

  for (const litter of litters) {
    const index = bucketIndexFor(buckets, litter.farrowingDate);
    if (index < 0) continue;
    sums[index] += litter.bornAlive;
    counts[index] += 1;
  }

  return {
    buckets,
    // Null, not zero: "no litters that month" is not "litters of zero offspring",
    // and a zero would drag the trend line through the floor.
    values: sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : null)),
  };
}

export type SowProductivityRow = {
  id: string;
  tagNumber: string;
  name: string | null;
  parity: number;
  totalBornAlive: number;
  totalWeaned: number;
  avgBornAlive: number | null;
  /** Mean days between consecutive farrowings; null with fewer than two. */
  farrowingIntervalDays: number | null;
};

export async function sowProductivity(farmId: string): Promise<SowProductivityRow[]> {
  const sows = await prisma.animal.findMany({
    where: { farmId, sex: "FEMALE", ...LIVESTOCK_ONLY, breedingsAsDam: { some: { litter: { isNot: null } } } },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      breedingsAsDam: {
        where: { litter: { isNot: null } },
        select: { litter: { select: { farrowingDate: true, bornAlive: true, weanedCount: true } } },
      },
    },
  });

  return sows
    .map((sow) => {
      const litters = sow.breedingsAsDam
        .map((record) => record.litter)
        .filter((litter): litter is NonNullable<typeof litter> => litter !== null)
        .sort((a, b) => a.farrowingDate.getTime() - b.farrowingDate.getTime());

      const totalBornAlive = litters.reduce((s, l) => s + l.bornAlive, 0);
      const totalWeaned = litters.reduce((s, l) => s + (l.weanedCount ?? 0), 0);

      let intervalDays: number | null = null;
      if (litters.length >= 2) {
        const gaps = litters
          .slice(1)
          .map((litter, i) => daysBetween(litters[i].farrowingDate, litter.farrowingDate));
        intervalDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      }

      return {
        id: sow.id,
        tagNumber: sow.tagNumber,
        name: sow.name,
        parity: litters.length,
        totalBornAlive,
        totalWeaned,
        avgBornAlive: litters.length > 0 ? totalBornAlive / litters.length : null,
        farrowingIntervalDays: intervalDays,
      };
    })
    .sort((a, b) => b.totalBornAlive - a.totalBornAlive);
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export type GrowthRow = {
  animalId: string;
  tagNumber: string;
  breed: string;
  penName: string | null;
  ageDays: number;
  latestWeightKg: number;
  /** kg/day between the first and last weigh-in in range. */
  adgKgPerDay: number | null;
};

export async function growthRows(farmId: string, range: DateRange): Promise<GrowthRow[]> {
  const animals = await prisma.animal.findMany({
    where: { farmId, ...LIVESTOCK_ONLY, weightRecords: { some: { recordedAt: { gte: range.from, lte: range.to } } } },
    select: {
      id: true,
      tagNumber: true,
      breed: true,
      dateOfBirth: true,
      pen: { select: { name: true } },
      weightRecords: {
        where: { recordedAt: { gte: range.from, lte: range.to } },
        select: { recordedAt: true, weightKg: true },
        orderBy: { recordedAt: "asc" },
      },
    },
  });

  const now = new Date();

  return animals.map((animal) => {
    const first = animal.weightRecords[0];
    const last = animal.weightRecords[animal.weightRecords.length - 1];
    const days = daysBetween(first.recordedAt, last.recordedAt);

    return {
      animalId: animal.id,
      tagNumber: animal.tagNumber,
      breed: animal.breed,
      penName: animal.pen?.name ?? null,
      ageDays: daysBetween(animal.dateOfBirth, now),
      latestWeightKg: last.weightKg,
      // Needs two readings genuinely apart in time; same-day repeats would
      // divide by zero and produce an infinite daily gain.
      adgKgPerDay: days > 0 ? (last.weightKg - first.weightKg) / days : null,
    };
  });
}

export type MortalityRow = { label: string; deaths: number; total: number; rate: number | null };

export async function mortalityByPen(farmId: string, range: DateRange): Promise<MortalityRow[]> {
  const [deaths, population] = await Promise.all([
    prisma.animal.groupBy({
      by: ["penId"],
      where: {
        farmId,
        status: { in: ["DECEASED", "CULLED"] },
        dateExit: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
    }),
    prisma.animal.groupBy({ by: ["penId"], where: { farmId }, _count: { _all: true } }),
  ]);

  const pens = await prisma.pen.findMany({
    where: { farmId },
    select: { id: true, name: true },
  });
  const names = new Map(pens.map((pen) => [pen.id, pen.name]));

  const totals = new Map(population.map((row) => [row.penId, row._count._all]));

  return deaths
    .map((row) => {
      const total = totals.get(row.penId) ?? 0;
      return {
        label: row.penId ? (names.get(row.penId) ?? "Unknown pen") : "No pen recorded",
        deaths: row._count._all,
        total,
        rate: total > 0 ? row._count._all / total : null,
      };
    })
    .sort((a, b) => b.deaths - a.deaths);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function diseasePrevalence(
  farmId: string,
  range: DateRange
): Promise<{ buckets: Bucket[]; series: { name: string; values: number[] }[] }> {
  const buckets = buildBuckets(range);

  const records = await prisma.healthRecord.findMany({
    where: {
      farmId,
      recordedAt: { gte: range.from, lte: range.to },
      recordType: { in: ["ILLNESS", "INJURY"] },
    },
    select: { recordedAt: true, category: true },
  });

  const byCategory = new Map<string, number[]>();

  for (const record of records) {
    const index = bucketIndexFor(buckets, record.recordedAt);
    if (index < 0) continue;
    const values = byCategory.get(record.category) ?? buckets.map(() => 0);
    values[index] += 1;
    byCategory.set(record.category, values);
  }

  return {
    buckets,
    series: [...byCategory.entries()].map(([name, values]) => ({ name, values })),
  };
}

export type AntibioticUsage = {
  buckets: Bucket[];
  courses: number[];
  animals: number[];
  totalCourses: number;
  totalAnimals: number;
};

/**
 * Antibiotic usage over time (§3.2). Tracked because resistance monitoring is
 * a genuine regulatory and welfare concern, and because a farm that cannot say
 * how much it used cannot tell whether it is reducing.
 */
export async function antibioticUsage(farmId: string, range: DateRange): Promise<AntibioticUsage> {
  const buckets = buildBuckets(range);

  const medications = await prisma.medication.findMany({
    where: {
      isAntibiotic: true,
      healthRecord: { farmId },
      startDate: { gte: range.from, lte: range.to },
    },
    select: { startDate: true, healthRecord: { select: { animalId: true } } },
  });

  const courses = buckets.map(() => 0);
  const animalSets = buckets.map(() => new Set<string>());

  for (const medication of medications) {
    const index = bucketIndexFor(buckets, medication.startDate);
    if (index < 0) continue;
    courses[index] += 1;
    // Antibiotic *courses* count either way; distinct animals treated can only
    // count the ones a record actually names.
    if (medication.healthRecord.animalId) {
      animalSets[index].add(medication.healthRecord.animalId);
    }
  }

  return {
    buckets,
    courses,
    animals: animalSets.map((set) => set.size),
    totalCourses: medications.length,
    totalAnimals: new Set(medications.map((m) => m.healthRecord.animalId)).size,
  };
}

export type TreatmentCostRow = { category: string; costCents: number; cases: number };

export async function treatmentCostByCategory(
  farmId: string,
  range: DateRange
): Promise<TreatmentCostRow[]> {
  const rows = await prisma.healthRecord.groupBy({
    by: ["category"],
    where: { farmId, recordedAt: { gte: range.from, lte: range.to } },
    _sum: { costCents: true },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({
      category: row.category,
      costCents: row._sum.costCents ?? 0,
      cases: row._count._all,
    }))
    .sort((a, b) => b.costCents - a.costCents);
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export type FeedUsageRow = {
  feedTypeId: string;
  name: string;
  allocatedKg: number;
  consumedKg: number;
  costCents: number;
  supplierName: string | null;
};

export async function feedUsage(farmId: string, range: DateRange): Promise<FeedUsageRow[]> {
  const records = await prisma.feedingRecord.findMany({
    where: { farmId, fedAt: { gte: range.from, lte: range.to } },
    select: {
      allocatedKg: true,
      consumedKg: true,
      costPerKgCents: true,
      feedType: {
        select: {
          id: true,
          name: true,
          costPerKgCents: true,
          supplier: { select: { name: true } },
        },
      },
    },
  });

  const totals = new Map<string, FeedUsageRow>();

  for (const record of records) {
    const row =
      totals.get(record.feedType.id) ??
      ({
        feedTypeId: record.feedType.id,
        name: record.feedType.name,
        allocatedKg: 0,
        consumedKg: 0,
        costCents: 0,
        supplierName: record.feedType.supplier?.name ?? null,
      } satisfies FeedUsageRow);

    row.allocatedKg += record.allocatedKg;
    row.consumedKg += record.consumedKg ?? record.allocatedKg;
    // Prefer the price snapshotted on the record: the feed type's current
    // price is today's, and restating last quarter's cost at it would be wrong.
    row.costCents += record.allocatedKg * (record.costPerKgCents ?? record.feedType.costPerKgCents ?? 0);
    totals.set(record.feedType.id, row);
  }

  return [...totals.values()]
    .map((row) => ({ ...row, costCents: Math.round(row.costCents) }))
    .sort((a, b) => b.costCents - a.costCents);
}

/** Total feed weight and cost in range, against total liveweight gain. */
export async function feedEfficiency(farmId: string, range: DateRange) {
  const [usage, growth] = await Promise.all([
    feedUsage(farmId, range),
    growthRows(farmId, range),
  ]);

  const feedKg = usage.reduce((sum, row) => sum + row.consumedKg, 0);
  const feedCostCents = usage.reduce((sum, row) => sum + row.costCents, 0);

  const gainKg = growth.reduce((sum, row) => {
    if (row.adgKgPerDay === null) return sum;
    return sum + Math.max(0, row.adgKgPerDay * range.days);
  }, 0);

  return {
    feedKg,
    feedCostCents,
    gainKg,
    fcr: gainKg > 0 ? feedKg / gainKg : null,
    costPerKgGainCents: gainKg > 0 ? Math.round(feedCostCents / gainKg) : null,
  };
}
