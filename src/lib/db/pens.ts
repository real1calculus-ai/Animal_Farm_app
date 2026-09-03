import "server-only";

import { Prisma } from "@prisma/client";
import type { HousingType, PenTaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Pen and housing queries. Occupancy is counted from live animals rather than
 * stored on the pen: a denormalised `currentOccupancy` column is wrong the
 * moment a pig dies or is sold without someone remembering to decrement it,
 * and an over-capacity warning that fires on a stale number is worse than no
 * warning at all.
 *
 * Every export takes `farmId` explicitly — see the note in `db/animals.ts`.
 */

export type PrismaLike = Prisma.TransactionClient;

/** Task types whose lapse is a biosecurity record, not just housekeeping (§3.5). */
export const BIOSECURITY_TASK_TYPES: PenTaskType[] = ["CLEANING", "DISINFECTION"];

// ---------------------------------------------------------------------------
// Listing and occupancy
// ---------------------------------------------------------------------------

export type PenOccupancyRow = {
  id: string;
  name: string;
  housingType: HousingType;
  capacity: number;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  occupancy: number;
  /** Occupancy as a fraction of capacity; null when capacity is zero. */
  utilisation: number | null;
  overCapacityBy: number;
  isOverCapacity: boolean;
  /** Latest cleaning/disinfection due date across biosecurity task types. */
  nextBiosecurityDueAt: Date | null;
  lastCleanedAt: Date | null;
  /** True when a biosecurity task is past its due date. */
  biosecurityOverdue: boolean;
  /** True when no cleaning or disinfection has ever been recorded. */
  neverCleaned: boolean;
};

/**
 * Every pen with its live occupancy, capacity pressure and cleaning status.
 *
 * Occupancy comes from one grouped count rather than a per-pen query, so the
 * list stays a fixed three round trips however many pens the farm has.
 */
export async function listPensWithOccupancy(
  farmId: string,
  options: { includeInactive?: boolean; asOf?: Date } = {}
): Promise<PenOccupancyRow[]> {
  const asOf = options.asOf ?? new Date();

  const pens = await prisma.pen.findMany({
    where: { farmId, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ housingType: "asc" }, { name: "asc" }],
  });

  if (pens.length === 0) return [];
  const penIds = pens.map((p) => p.id);

  const [counts, tasks] = await Promise.all([
    prisma.pig.groupBy({
      by: ["penId"],
      where: { farmId, status: "ACTIVE", penId: { in: penIds } },
      _count: { _all: true },
    }),
    // Only biosecurity tasks matter for the overdue flag; repairs have their
    // own cadence and are not a compliance record.
    prisma.penTask.findMany({
      where: { penId: { in: penIds }, taskType: { in: BIOSECURITY_TASK_TYPES } },
      select: { penId: true, taskType: true, performedAt: true, nextDueAt: true },
      orderBy: { performedAt: "desc" },
    }),
  ]);

  const countByPen = new Map<string, number>();
  for (const row of counts) {
    if (row.penId) countByPen.set(row.penId, row._count._all);
  }

  // The most recent task of each (pen, type); its `nextDueAt` is what is owed.
  const latestByPenType = new Map<string, { performedAt: Date; nextDueAt: Date | null }>();
  for (const task of tasks) {
    const key = `${task.penId}:${task.taskType}`;
    if (!latestByPenType.has(key)) {
      latestByPenType.set(key, { performedAt: task.performedAt, nextDueAt: task.nextDueAt });
    }
  }

  return pens.map((pen) => {
    const occupancy = countByPen.get(pen.id) ?? 0;
    const overCapacityBy = Math.max(0, occupancy - pen.capacity);

    let nextBiosecurityDueAt: Date | null = null;
    let lastCleanedAt: Date | null = null;
    let seenAny = false;

    for (const type of BIOSECURITY_TASK_TYPES) {
      const latest = latestByPenType.get(`${pen.id}:${type}`);
      if (!latest) continue;
      seenAny = true;
      if (!lastCleanedAt || latest.performedAt > lastCleanedAt) {
        lastCleanedAt = latest.performedAt;
      }
      if (latest.nextDueAt && (!nextBiosecurityDueAt || latest.nextDueAt < nextBiosecurityDueAt)) {
        nextBiosecurityDueAt = latest.nextDueAt;
      }
    }

    return {
      id: pen.id,
      name: pen.name,
      housingType: pen.housingType,
      capacity: pen.capacity,
      location: pen.location,
      notes: pen.notes,
      isActive: pen.isActive,
      occupancy,
      utilisation: pen.capacity > 0 ? occupancy / pen.capacity : null,
      overCapacityBy,
      isOverCapacity: overCapacityBy > 0,
      nextBiosecurityDueAt,
      lastCleanedAt,
      biosecurityOverdue: nextBiosecurityDueAt !== null && nextBiosecurityDueAt < asOf,
      // Only an occupied pen that has never been cleaned is worth flagging; an
      // empty, unused pen with no history is not a biosecurity failure.
      neverCleaned: !seenAny && occupancy > 0,
    };
  });
}

export type PenSummary = {
  penCount: number;
  totalCapacity: number;
  totalOccupancy: number;
  overCapacityCount: number;
  biosecurityOverdueCount: number;
  /** Herd-wide utilisation, for the dashboard tile. */
  utilisation: number | null;
};

/** Headline occupancy numbers. Read by the dashboard as well as /pens. */
export async function getPenSummary(farmId: string, asOf?: Date): Promise<PenSummary> {
  const pens = await listPensWithOccupancy(farmId, { asOf });

  const totalCapacity = pens.reduce((sum, pen) => sum + pen.capacity, 0);
  const totalOccupancy = pens.reduce((sum, pen) => sum + pen.occupancy, 0);

  return {
    penCount: pens.length,
    totalCapacity,
    totalOccupancy,
    overCapacityCount: pens.filter((pen) => pen.isOverCapacity).length,
    biosecurityOverdueCount: pens.filter((pen) => pen.biosecurityOverdue || pen.neverCleaned)
      .length,
    utilisation: totalCapacity > 0 ? totalOccupancy / totalCapacity : null,
  };
}

/** Pens whose cleaning or disinfection has lapsed. Feeds the alerts module. */
export async function listPensWithOverdueBiosecurity(
  farmId: string,
  asOf?: Date
): Promise<PenOccupancyRow[]> {
  const pens = await listPensWithOccupancy(farmId, { asOf });
  return pens.filter((pen) => pen.biosecurityOverdue || pen.neverCleaned);
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getPen(farmId: string, id: string) {
  return prisma.pen.findFirst({ where: { id, farmId } });
}

export async function getPenOccupants(farmId: string, penId: string) {
  return prisma.pig.findMany({
    where: { farmId, penId, status: "ACTIVE" },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      breed: true,
      sex: true,
      dateOfBirth: true,
      currentWeightKg: true,
      dateMovedIn: true,
    },
    orderBy: { tagNumber: "asc" },
  });
}

/** Movements in and out of a pen, newest first — the occupancy history. */
export async function getPenMovementHistory(penId: string, limit = 100) {
  return prisma.penMovement.findMany({
    where: { penId },
    select: {
      id: true,
      movedAt: true,
      reason: true,
      fromPenName: true,
      toPenName: true,
      pig: { select: { id: true, tagNumber: true, name: true } },
      movedBy: { select: { name: true } },
    },
    orderBy: { movedAt: "desc" },
    take: limit,
  });
}

export async function listPenTasks(penId: string, limit = 100) {
  return prisma.penTask.findMany({
    where: { penId },
    select: {
      id: true,
      taskType: true,
      performedAt: true,
      notes: true,
      costCents: true,
      nextDueAt: true,
      performedBy: { select: { name: true } },
    },
    orderBy: { performedAt: "desc" },
    take: limit,
  });
}

/** Total spent on a pen's tasks — the housing cost the ledger mirrors. */
export async function getPenTaskCostCents(penId: string): Promise<number> {
  const result = await prisma.penTask.aggregate({
    where: { penId },
    _sum: { costCents: true },
  });
  return result._sum.costCents ?? 0;
}

/** Pens as `<select>` options, with occupancy so a full pen reads as full. */
export async function listPenOptions(farmId: string) {
  const pens = await listPensWithOccupancy(farmId);
  return pens.map((pen) => ({
    id: pen.id,
    name: pen.name,
    housingType: pen.housingType,
    occupancy: pen.occupancy,
    capacity: pen.capacity,
    isOverCapacity: pen.isOverCapacity,
  }));
}
