import "server-only";

import { prisma } from "@/lib/prisma";
import {
  batchAges,
  batchFcr,
  countFromEvents,
  layPercentage,
  mortalityStats,
  reconcile,
  type CountingEvent,
} from "@/lib/batch-metrics";
import type { AnimalBatch, BatchStatus, Prisma, Species } from "@prisma/client";

const batchSelect = {
  id: true,
  name: true,
  batchCode: true,
  status: true,
  startDate: true,
  startAgeDays: true,
  endDate: true,
  initialCount: true,
  currentCount: true,
  source: true,
  acquisitionCostCents: true,
  avgWeightKg: true,
  notes: true,
  species: {
    select: { id: true, name: true, code: true, trackingMode: true, youngTerm: true, groupTerm: true },
  },
  pen: { select: { id: true, name: true } },
} satisfies Prisma.AnimalBatchSelect;

export type BatchRow = Prisma.AnimalBatchGetPayload<{ select: typeof batchSelect }> & {
  daysOnFarm: number;
  ageDays: number;
};

export async function listBatches(
  farmId: string,
  filters: { status?: BatchStatus; speciesId?: string } = {}
): Promise<BatchRow[]> {
  const rows = await prisma.animalBatch.findMany({
    where: {
      farmId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.speciesId ? { speciesId: filters.speciesId } : {}),
    },
    select: batchSelect,
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  const now = new Date();
  return rows.map((row) => ({ ...row, ...batchAges(row.startDate, row.startAgeDays, now) }));
}

export type BatchDetail = BatchRow & {
  events: {
    id: string;
    eventType: CountingEvent["eventType"];
    occurredAt: Date;
    quantity: number;
    weightKg: number | null;
    reason: string | null;
    notes: string | null;
    createdBy: { name: string } | null;
  }[];
  production: {
    id: string;
    productionType: "EGGS" | "MILK" | "OTHER";
    collectedAt: Date;
    quantity: number;
    rejectedQuantity: number;
    unit: string;
    notes: string | null;
  }[];
  metrics: {
    mortality: ReturnType<typeof mortalityStats>;
    reconciliation: ReturnType<typeof reconcile>;
    feedKg: number;
    feedCostCents: number;
    gainKg: number;
    fcr: number | null;
    costPerKgCents: number | null;
    /** Null for anything that is not laying. */
    layRate: number | null;
    totalProduced: number;
  };
};

export async function getBatch(farmId: string, id: string): Promise<BatchDetail | null> {
  const batch = await prisma.animalBatch.findFirst({ where: { id, farmId }, select: batchSelect });
  if (!batch) return null;

  const [events, production, feed] = await Promise.all([
    prisma.batchEvent.findMany({
      where: { batchId: id },
      select: {
        id: true,
        eventType: true,
        occurredAt: true,
        quantity: true,
        weightKg: true,
        reason: true,
        notes: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.batchProductionRecord.findMany({
      where: { batchId: id },
      select: {
        id: true,
        productionType: true,
        collectedAt: true,
        quantity: true,
        rejectedQuantity: true,
        unit: true,
        notes: true,
      },
      orderBy: { collectedAt: "desc" },
      take: 90,
    }),
    prisma.feedingRecord.findMany({
      where: { batchId: id },
      select: { allocatedKg: true, consumedKg: true, costPerKgCents: true },
    }),
  ]);

  const counting: CountingEvent[] = events.map((e) => ({
    eventType: e.eventType,
    quantity: e.quantity,
    occurredAt: e.occurredAt,
  }));

  const feedKg = feed.reduce((sum, r) => sum + (r.consumedKg ?? r.allocatedKg), 0);
  const feedCostCents = Math.round(
    feed.reduce((sum, r) => sum + r.allocatedKg * (r.costPerKgCents ?? 0), 0)
  );

  // Weight at arrival, taken from the earliest sample if one exists. Day-old
  // chicks are ~0.04 kg, which rounds to nothing against a finished bird, but
  // fingerlings and point-of-lay pullets arrive heavy enough to matter.
  const firstSample = [...events]
    .filter((e) => e.eventType === "WEIGHT_SAMPLE" && e.weightKg !== null)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0];

  const { gainKg, fcr } = batchFcr({
    feedKg,
    currentCount: batch.currentCount,
    avgWeightKg: batch.avgWeightKg,
    initialCount: batch.initialCount,
    startWeightKg: firstSample?.weightKg ?? null,
  });

  const eggs = production.filter((p) => p.productionType === "EGGS");
  const totalProduced = production.reduce((sum, p) => sum + p.quantity, 0);
  const layDays = new Set(eggs.map((p) => p.collectedAt.toISOString().slice(0, 10))).size;

  const ages = batchAges(batch.startDate, batch.startAgeDays);

  return {
    ...batch,
    ...ages,
    events,
    production,
    metrics: {
      mortality: mortalityStats(batch.startDate, batch.initialCount, counting),
      reconciliation: reconcile(batch.currentCount, batch.initialCount, counting),
      feedKg,
      feedCostCents,
      gainKg,
      fcr,
      costPerKgCents: gainKg > 0 ? Math.round(feedCostCents / gainKg) : null,
      layRate:
        eggs.length > 0
          ? layPercentage(
              eggs.reduce((sum, p) => sum + p.quantity, 0),
              batch.currentCount,
              layDays
            )
          : null,
      totalProduced,
    },
  };
}

export type BatchSummary = {
  activeBatches: number;
  totalAnimals: number;
  /** Batches whose cached count disagrees with their own event log. */
  driftingBatches: number;
};

export async function getBatchSummary(farmId: string): Promise<BatchSummary> {
  const batches = await prisma.animalBatch.findMany({
    where: { farmId, status: "ACTIVE" },
    select: {
      currentCount: true,
      initialCount: true,
      events: { select: { eventType: true, quantity: true, occurredAt: true } },
    },
  });

  return {
    activeBatches: batches.length,
    totalAnimals: batches.reduce((sum, b) => sum + b.currentCount, 0),
    driftingBatches: batches.filter(
      (b) => countFromEvents(b.initialCount, b.events) !== b.currentCount
    ).length,
  };
}

/** Species that are counted as batches — what the "new batch" form offers. */
export async function listBatchSpecies(farmId: string): Promise<Species[]> {
  return prisma.species.findMany({
    where: { farmId, isActive: true, trackingMode: { in: ["BATCH", "HYBRID"] } },
    orderBy: { name: "asc" },
  });
}

export async function getBatchForUpdate(farmId: string, id: string): Promise<AnimalBatch | null> {
  return prisma.animalBatch.findFirst({ where: { id, farmId } });
}
