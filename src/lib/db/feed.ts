import "server-only";

import { prisma } from "@/lib/prisma";
import { getFarmSettings } from "@/lib/active-farm";
import { deriveLifeStage } from "@/lib/life-stage";
import { ageInDays } from "@/lib/format";
import {
  allocatableBatches,
  expiredStockKg,
  expiresWithin,
  hasStock,
  isExpired,
  roundKg,
  type AllocatableBatch,
} from "@/lib/feed/allocation";
import type { FeedClassification, LifeStage, Prisma } from "@prisma/client";
import { LIVESTOCK_ONLY } from "@/lib/species-catalogue";

/**
 * Shared feed queries. The dashboard, reports and finance modules read stock
 * and consumption from here rather than re-deriving either.
 *
 * Two things to know before adding a query:
 *
 * 1. `FeedBatch` has no `farmId` of its own — it is scoped through its
 *    `FeedType`. Every batch query therefore filters on
 *    `feedType: { farmId }`, never on the batch alone.
 * 2. Stock is the sum of `remainingKg` across batches, never a column. That is
 *    deliberate (see the schema comment on `FeedType`): a running total on the
 *    product would make lot traceability impossible.
 */

/** Batches expiring inside this many days are called out as "use it now". */
export const EXPIRY_WARNING_DAYS = 30;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export async function listFeedTypes(farmId: string, { activeOnly = false } = {}) {
  return prisma.feedType.findMany({
    where: { farmId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { supplier: { select: { id: true, name: true } } },
  });
}

export async function getFeedType(farmId: string, id: string) {
  return prisma.feedType.findFirst({
    where: { id, farmId },
    include: { supplier: { select: { id: true, name: true } } },
  });
}

export async function listSuppliers(farmId: string, { activeOnly = false } = {}) {
  return prisma.supplier.findMany({
    where: { farmId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { feedTypes: true, feedBatches: true } },
    },
  });
}

export async function getSupplier(farmId: string, id: string) {
  return prisma.supplier.findFirst({ where: { id, farmId } });
}

export async function listFeedingPrograms(farmId: string, { activeOnly = false } = {}) {
  return prisma.feedingProgram.findMany({
    where: { farmId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: "desc" }, { stage: "asc" }, { name: "asc" }],
    include: {
      feedType: { select: { id: true, name: true, classification: true, costPerKgCents: true } },
    },
  });
}

export async function getFeedingProgram(farmId: string, id: string) {
  return prisma.feedingProgram.findFirst({
    where: { id, farmId },
    include: { feedType: { select: { id: true, name: true, classification: true } } },
  });
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export type StorageLocationFill = {
  id: string;
  name: string;
  capacityKg: number | null;
  notes: string | null;
  isActive: boolean;
  batchCount: number;
  storedKg: number;
  /** 0-1, or null when the location has no declared capacity. */
  fillFraction: number | null;
  overCapacity: boolean;
};

export async function listStorageLocations(farmId: string): Promise<StorageLocationFill[]> {
  const locations = await prisma.feedStorageLocation.findMany({
    where: { farmId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      batches: { select: { remainingKg: true } },
    },
  });

  return locations.map((location) => {
    const held = location.batches.filter((b) => b.remainingKg > 0);
    const storedKg = roundKg(held.reduce((sum, b) => sum + b.remainingKg, 0));
    const fillFraction =
      location.capacityKg && location.capacityKg > 0 ? storedKg / location.capacityKg : null;

    return {
      id: location.id,
      name: location.name,
      capacityKg: location.capacityKg,
      notes: location.notes,
      isActive: location.isActive,
      batchCount: held.length,
      storedKg,
      fillFraction,
      overCapacity: fillFraction !== null && fillFraction > 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Stock levels
// ---------------------------------------------------------------------------

export type BatchStockRow = AllocatableBatch & {
  quantityKg: number;
  expired: boolean;
  expiringSoon: boolean;
  valueCents: number;
};

export type FeedStockLevel = {
  feedTypeId: string;
  name: string;
  classification: FeedClassification;
  isActive: boolean;
  reorderLevelKg: number;
  supplierName: string | null;
  defaultCostPerKgCents: number | null;
  /** In-date stock only — what can actually be fed today. */
  usableKg: number;
  /** In stock but expired: still on the shelf, not feedable (§8.4). */
  expiredKg: number;
  totalKg: number;
  valueCents: number;
  belowReorderLevel: boolean;
  outOfStock: boolean;
  expiringSoonKg: number;
  lastReceivedDate: Date | null;
  nextExpiryDate: Date | null;
  batches: BatchStockRow[];
};

/**
 * Stock on hand per feed type, with the reorder and expiry signals the
 * inventory screen is built around.
 *
 * "Usable" excludes expired stock on purpose: a store holding 400 kg of
 * out-of-date starter is out of starter as far as any decision goes, and
 * showing it as covered is how a farm ends up with nothing to feed weaners on
 * a Monday morning.
 */
export async function getFeedStockLevels(
  farmId: string,
  asOf: Date = new Date()
): Promise<FeedStockLevel[]> {
  const feedTypes = await prisma.feedType.findMany({
    where: { farmId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      supplier: { select: { name: true } },
      batches: {
        orderBy: { receivedDate: "asc" },
        select: {
          id: true,
          batchCode: true,
          receivedDate: true,
          expirationDate: true,
          quantityKg: true,
          remainingKg: true,
          costPerKgCents: true,
        },
      },
    },
  });

  return feedTypes.map((feedType) => {
    const batches: BatchStockRow[] = feedType.batches.map((batch) => ({
      ...batch,
      expired: isExpired(batch, asOf),
      expiringSoon: expiresWithin(batch, EXPIRY_WARNING_DAYS, asOf),
      valueCents: Math.round(batch.remainingKg * batch.costPerKgCents),
    }));

    const inStock = batches.filter((b) => hasStock(b));
    const usableKg = roundKg(
      allocatableBatches(feedType.batches, asOf).reduce((sum, b) => sum + b.remainingKg, 0)
    );
    const expiredKg = expiredStockKg(feedType.batches, asOf);
    const expiringSoonKg = roundKg(
      inStock.filter((b) => b.expiringSoon).reduce((sum, b) => sum + b.remainingKg, 0)
    );

    const expiryDates = inStock
      .filter((b) => !b.expired && b.expirationDate)
      .map((b) => b.expirationDate as Date)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      feedTypeId: feedType.id,
      name: feedType.name,
      classification: feedType.classification,
      isActive: feedType.isActive,
      reorderLevelKg: feedType.reorderLevelKg,
      supplierName: feedType.supplier?.name ?? null,
      defaultCostPerKgCents: feedType.costPerKgCents,
      usableKg,
      expiredKg,
      totalKg: roundKg(usableKg + expiredKg),
      valueCents: inStock.reduce((sum, b) => sum + b.valueCents, 0),
      belowReorderLevel: feedType.reorderLevelKg > 0 && usableKg < feedType.reorderLevelKg,
      outOfStock: usableKg <= 0,
      expiringSoonKg,
      lastReceivedDate:
        feedType.batches.length > 0
          ? feedType.batches[feedType.batches.length - 1].receivedDate
          : null,
      nextExpiryDate: expiryDates[0] ?? null,
      batches,
    };
  });
}

export type InventorySummary = {
  feedTypeCount: number;
  usableKg: number;
  expiredKg: number;
  valueCents: number;
  expiredValueCents: number;
  reorderCount: number;
  outOfStockCount: number;
  expiringSoonCount: number;
};

export function summariseStock(levels: readonly FeedStockLevel[]): InventorySummary {
  return {
    feedTypeCount: levels.filter((l) => l.isActive).length,
    usableKg: roundKg(levels.reduce((sum, l) => sum + l.usableKg, 0)),
    expiredKg: roundKg(levels.reduce((sum, l) => sum + l.expiredKg, 0)),
    valueCents: levels.reduce((sum, l) => sum + l.valueCents, 0),
    expiredValueCents: levels.reduce(
      (sum, l) =>
        sum +
        l.batches
          .filter((b) => b.expired && hasStock(b))
          .reduce((inner, b) => inner + b.valueCents, 0),
      0
    ),
    reorderCount: levels.filter((l) => l.isActive && l.belowReorderLevel).length,
    outOfStockCount: levels.filter((l) => l.isActive && l.outOfStock).length,
    expiringSoonCount: levels.reduce(
      (sum, l) => sum + l.batches.filter((b) => b.expiringSoon && hasStock(b)).length,
      0
    ),
  };
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export type BatchFilter = {
  feedTypeId?: string;
  supplierId?: string;
  storageLocationId?: string;
  /** "in-stock" hides emptied batches; "expired" shows only unusable stock. */
  view?: "all" | "in-stock" | "expired" | "expiring";
};

export async function listBatches(farmId: string, filter: BatchFilter = {}) {
  const where: Prisma.FeedBatchWhereInput = {
    feedType: { farmId },
    ...(filter.feedTypeId ? { feedTypeId: filter.feedTypeId } : {}),
    ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
    ...(filter.storageLocationId ? { storageLocationId: filter.storageLocationId } : {}),
    ...(filter.view === "in-stock" || filter.view === "expiring"
      ? { remainingKg: { gt: 0 } }
      : {}),
    ...(filter.view === "expired"
      ? { remainingKg: { gt: 0 }, expirationDate: { lt: new Date() } }
      : {}),
    ...(filter.view === "expiring"
      ? {
          expirationDate: {
            gte: new Date(),
            lte: new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000),
          },
        }
      : {}),
  };

  return prisma.feedBatch.findMany({
    where,
    orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
    include: {
      feedType: { select: { id: true, name: true, classification: true } },
      supplier: { select: { id: true, name: true } },
      storageLocation: { select: { id: true, name: true } },
      _count: { select: { feedingRecords: true } },
    },
  });
}

/**
 * One batch with everything that ate from it — the recall path (§3.3). If a
 * supplier reports contamination on a lot, this is the query that answers
 * "which animals are affected" without a spreadsheet.
 */
export async function getBatchDetail(farmId: string, id: string) {
  return prisma.feedBatch.findFirst({
    where: { id, feedType: { farmId } },
    include: {
      feedType: true,
      supplier: true,
      storageLocation: true,
      receivedBy: { select: { id: true, name: true } },
      feedingRecords: {
        orderBy: { fedAt: "desc" },
        include: {
          pen: { select: { id: true, name: true } },
          animal: { select: { id: true, tagNumber: true, name: true, status: true } },
          recordedBy: { select: { name: true } },
        },
      },
    },
  });
}

/** Batch rows in the shape `allocateFifo` wants, for one feed type. */
export async function getAllocatableBatches(
  farmId: string,
  feedTypeId: string
): Promise<AllocatableBatch[]> {
  return prisma.feedBatch.findMany({
    where: { feedTypeId, feedType: { farmId }, remainingKg: { gt: 0 } },
    orderBy: { receivedDate: "asc" },
    select: {
      id: true,
      batchCode: true,
      receivedDate: true,
      expirationDate: true,
      remainingKg: true,
      costPerKgCents: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Feeding records
// ---------------------------------------------------------------------------

export type FeedingFilter = {
  penId?: string;
  animalId?: string;
  feedTypeId?: string;
  feedBatchId?: string;
  from?: Date;
  to?: Date;
  take?: number;
};

function feedingWhere(farmId: string, filter: FeedingFilter): Prisma.FeedingRecordWhereInput {
  return {
    farmId,
    ...(filter.penId ? { penId: filter.penId } : {}),
    ...(filter.animalId ? { animalId: filter.animalId } : {}),
    ...(filter.feedTypeId ? { feedTypeId: filter.feedTypeId } : {}),
    ...(filter.feedBatchId ? { feedBatchId: filter.feedBatchId } : {}),
    ...(filter.from || filter.to
      ? {
          fedAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };
}

export async function listFeedingRecords(farmId: string, filter: FeedingFilter = {}) {
  return prisma.feedingRecord.findMany({
    where: feedingWhere(farmId, filter),
    orderBy: [{ fedAt: "desc" }, { createdAt: "desc" }],
    ...(filter.take ? { take: filter.take } : {}),
    include: {
      feedType: { select: { id: true, name: true, classification: true } },
      feedBatch: { select: { id: true, batchCode: true } },
      pen: { select: { id: true, name: true } },
      animal: { select: { id: true, tagNumber: true, name: true } },
      recordedBy: { select: { name: true } },
    },
  });
}

/** Intake rows in the shape `src/lib/feed/fcr.ts` wants. */
export async function getIntakeRecords(farmId: string, filter: FeedingFilter = {}) {
  return prisma.feedingRecord.findMany({
    where: feedingWhere(farmId, filter),
    orderBy: { fedAt: "asc" },
    select: {
      fedAt: true,
      allocatedKg: true,
      consumedKg: true,
      costPerKgCents: true,
      animalCount: true,
      penId: true,
      animalId: true,
      feedTypeId: true,
    },
  });
}

export type ConsumptionByFeedType = {
  feedTypeId: string;
  name: string;
  classification: FeedClassification;
  allocatedKg: number;
  consumedKg: number;
  costCents: number;
  recordCount: number;
};

/**
 * Consumption totalled by feed type over a window. Cost uses the snapshotted
 * `costPerKgCents` on each record, not today's price — the point of the
 * snapshot is that a historical total does not move when feed gets dearer.
 */
export async function getConsumptionByFeedType(
  farmId: string,
  { from, to }: { from?: Date; to?: Date } = {}
): Promise<ConsumptionByFeedType[]> {
  const records = await prisma.feedingRecord.findMany({
    where: feedingWhere(farmId, { from, to }),
    select: {
      allocatedKg: true,
      consumedKg: true,
      costPerKgCents: true,
      feedType: { select: { id: true, name: true, classification: true } },
    },
  });

  const byType = new Map<string, ConsumptionByFeedType>();

  for (const record of records) {
    const key = record.feedType.id;
    const row =
      byType.get(key) ??
      ({
        feedTypeId: key,
        name: record.feedType.name,
        classification: record.feedType.classification,
        allocatedKg: 0,
        consumedKg: 0,
        costCents: 0,
        recordCount: 0,
      } satisfies ConsumptionByFeedType);

    const eaten = record.consumedKg ?? record.allocatedKg;
    row.allocatedKg += record.allocatedKg;
    row.consumedKg += eaten;
    row.costCents += Math.round(eaten * (record.costPerKgCents ?? 0));
    row.recordCount += 1;
    byType.set(key, row);
  }

  return [...byType.values()]
    .map((row) => ({
      ...row,
      allocatedKg: roundKg(row.allocatedKg),
      consumedKg: roundKg(row.consumedKg),
    }))
    .sort((a, b) => b.consumedKg - a.consumedKg);
}

// ---------------------------------------------------------------------------
// Herd, for rations and stage matching
// ---------------------------------------------------------------------------

export type HerdAnimal = {
  id: string;
  tagNumber: string;
  name: string | null;
  sex: "MALE" | "FEMALE";
  dateOfBirth: Date;
  ageDays: number;
  currentWeightKg: number | null;
  penId: string | null;
  penName: string | null;
  stage: LifeStage;
};

/**
 * Every live animal with its derived life stage, which is what feeding
 * programs target. Parity is counted from farrowed litters rather than stored,
 * because a gilt becomes a sow — and changes ration — the day she farrows.
 */
export async function getHerdWithStages(
  farmId: string,
  asOf: Date = new Date()
): Promise<HerdAnimal[]> {
  const [settings, animals, litters] = await Promise.all([
    getFarmSettings(farmId),
    // Ration planning covers the farmed herd. Dogs are fed, but not from the
    // livestock feed programmes, and counting them would overstate demand.
    prisma.animal.findMany({
      where: { farmId, status: "ACTIVE", ...LIVESTOCK_ONLY },
      orderBy: { tagNumber: "asc" },
      select: {
        id: true,
        tagNumber: true,
        name: true,
        sex: true,
        dateOfBirth: true,
        currentWeightKg: true,
        penId: true,
        pen: { select: { name: true } },
      },
    }),
    prisma.litter.findMany({
      where: { breedingRecord: { farmId } },
      select: { breedingRecord: { select: { damId: true } } },
    }),
  ]);

  const parityByDam = new Map<string, number>();
  for (const litter of litters) {
    const damId = litter.breedingRecord.damId;
    parityByDam.set(damId, (parityByDam.get(damId) ?? 0) + 1);
  }

  return animals.map((animal) => ({
    id: animal.id,
    tagNumber: animal.tagNumber,
    name: animal.name,
    sex: animal.sex,
    dateOfBirth: animal.dateOfBirth,
    ageDays: ageInDays(animal.dateOfBirth, asOf),
    currentWeightKg: animal.currentWeightKg,
    penId: animal.penId,
    penName: animal.pen?.name ?? null,
    stage: deriveLifeStage({
      dateOfBirth: animal.dateOfBirth,
      sex: animal.sex,
      parity: parityByDam.get(animal.id) ?? 0,
      weaningAgeDays: settings.weaningAgeDays,
      minBreedingAgeDays:
        animal.sex === "FEMALE"
          ? settings.minBreedingAgeDaysFemale
          : settings.minBreedingAgeDaysMale,
      asOf,
    }),
  }));
}

export type PenHerd = {
  penId: string;
  penName: string;
  housingType: string;
  capacity: number;
  animals: HerdAnimal[];
  stageCounts: Map<LifeStage, number>;
  /** The stage most of the pen is at — what its ration should be built for. */
  dominantStage: LifeStage | null;
};

export async function getPensWithHerd(
  farmId: string,
  asOf: Date = new Date()
): Promise<PenHerd[]> {
  const [pens, herd] = await Promise.all([
    prisma.pen.findMany({
      where: { farmId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, housingType: true, capacity: true },
    }),
    getHerdWithStages(farmId, asOf),
  ]);

  return pens.map((pen) => {
    const animals = herd.filter((a) => a.penId === pen.id);
    const stageCounts = new Map<LifeStage, number>();
    for (const animal of animals) {
      stageCounts.set(animal.stage, (stageCounts.get(animal.stage) ?? 0) + 1);
    }

    let dominantStage: LifeStage | null = null;
    let best = 0;
    for (const [stage, count] of stageCounts) {
      if (count > best) {
        best = count;
        dominantStage = stage;
      }
    }

    return {
      penId: pen.id,
      penName: pen.name,
      housingType: pen.housingType,
      capacity: pen.capacity,
      animals,
      stageCounts,
      dominantStage,
    };
  });
}

/** Stage tallies for the whole herd, for the daily-requirement projection. */
export function stageTally(herd: readonly HerdAnimal[]): Map<LifeStage, number> {
  const counts = new Map<LifeStage, number>();
  for (const animal of herd) {
    counts.set(animal.stage, (counts.get(animal.stage) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Weights, for FCR
// ---------------------------------------------------------------------------

export async function getWeightRecords(
  farmId: string,
  { animalIds, from, to }: { animalIds?: string[]; from?: Date; to?: Date } = {}
) {
  return prisma.weightRecord.findMany({
    where: {
      animal: { farmId, ...(animalIds ? { id: { in: animalIds } } : {}) },
      ...(from || to
        ? { recordedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { recordedAt: "asc" },
    select: { animalId: true, recordedAt: true, weightKg: true },
  });
}
