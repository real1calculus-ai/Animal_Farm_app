"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LifeStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, WRITE_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  assertNotFuture,
  optionalFloat,
  optionalString,
  requireDate,
  requireFloat,
  requireInt,
  requireString,
} from "@/lib/validation";
import {
  KG_EPSILON,
  allocateFifo,
  assertConsumptionWithinTolerance,
  roundKg,
  type BatchDraw,
} from "@/lib/feed/allocation";
import { stageMismatchWarning } from "@/lib/feed/stage-match";
import { getHerdWithStages } from "@/lib/db/feed";

/**
 * Feeding records.
 *
 * A WORKER may record feeding — that is the daily job this app exists to make
 * possible — but only management may delete a record, because deleting one
 * puts feed back into a batch and moves every downstream cost figure with it.
 */

type FeedingInput = {
  farmId: string;
  userId: string;
  fedAt: Date;
  feedTypeId: string;
  penId: string | null;
  animalId: string | null;
  animalCount: number;
  allocatedKg: number;
  consumedKg: number | null;
  preferredBatchId: string | null;
  notes: string | null;
};

/**
 * Allocates feed FIFO and writes the feeding record(s), all inside one
 * transaction.
 *
 * One allocation can produce several `FeedingRecord` rows — one per batch it
 * drew from. That is deliberate: `FeedingRecord.feedBatchId` is a single
 * column, and it is the column that answers "which animals ate this lot"
 * during a recall (§3.3). Collapsing a two-batch allocation into one row with
 * one batch id would quietly lose half the trail, so the allocation is split
 * instead, with consumption apportioned across the rows in proportion.
 *
 * The batch decrement is a guarded `updateMany` rather than a plain update:
 * two workers feeding different pens from the last of a batch at the same
 * moment would otherwise both succeed and drive `remainingKg` negative. The
 * `gte` in the where clause makes the loser's update match zero rows, and this
 * throws instead of writing an impossible stock level.
 */
async function writeFeeding(input: FeedingInput): Promise<{
  recordIds: string[];
  draws: BatchDraw[];
  totalCostCents: number;
}> {
  return prisma.$transaction(async (tx) => {
    const batches = await tx.feedBatch.findMany({
      where: {
        feedTypeId: input.feedTypeId,
        feedType: { farmId: input.farmId },
        remainingKg: { gt: 0 },
      },
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

    // Expiry is judged as at the feeding date, not today: a record entered on
    // Monday for Saturday's feeding should not be refused because the batch
    // went out of date on Sunday.
    const allocation = allocateFifo(batches, input.allocatedKg, {
      asOf: input.fedAt,
      preferredBatchId: input.preferredBatchId,
    });

    const recordIds: string[] = [];
    let consumedAssigned = 0;

    for (const [index, draw] of allocation.draws.entries()) {
      const decremented = await tx.feedBatch.updateMany({
        where: { id: draw.batchId, remainingKg: { gte: draw.kg - KG_EPSILON } },
        data: { remainingKg: { decrement: draw.kg } },
      });
      if (decremented.count !== 1) {
        throw new Error(
          `Batch ${draw.batchCode} no longer holds ${draw.kg.toFixed(1)} kg — someone else recorded feeding from it. Check the stock level and try again.`
        );
      }

      let consumedKg: number | null = null;
      if (input.consumedKg !== null) {
        const isLast = index === allocation.draws.length - 1;
        // The last row takes the remainder so the split sums back to exactly
        // what was typed, rather than to a rounding error.
        consumedKg = isLast
          ? roundKg(input.consumedKg - consumedAssigned)
          : roundKg(input.consumedKg * (draw.kg / allocation.totalKg));
        consumedAssigned = roundKg(consumedAssigned + consumedKg);
      }

      const record = await tx.feedingRecord.create({
        data: {
          farmId: input.farmId,
          fedAt: input.fedAt,
          penId: input.penId,
          animalId: input.animalId,
          animalCount: input.animalCount,
          feedTypeId: input.feedTypeId,
          feedBatchId: draw.batchId,
          allocatedKg: draw.kg,
          consumedKg,
          // Snapshotted from the batch, not looked up later: the point of the
          // snapshot is that a historical feed cost stops moving once recorded.
          costPerKgCents: draw.costPerKgCents,
          notes: input.notes,
          recordedByProfileId: input.userId,
        },
        select: { id: true },
      });
      recordIds.push(record.id);
    }

    return {
      recordIds,
      draws: allocation.draws,
      totalCostCents: allocation.totalCostCents,
    };
  });
}

/** Stage tally for whatever the feeding targets, for the §8.4 stage check. */
async function targetStageCounts(
  farmId: string,
  { penId, animalId }: { penId: string | null; animalId: string | null }
): Promise<Map<LifeStage, number>> {
  const herd = await getHerdWithStages(farmId);
  const animals = animalId
    ? herd.filter((a) => a.id === animalId)
    : penId
      ? herd.filter((a) => a.penId === penId)
      : [];

  const counts = new Map<LifeStage, number>();
  for (const animal of animals) {
    counts.set(animal.stage, (counts.get(animal.stage) ?? 0) + 1);
  }
  return counts;
}

function revalidateFeeding(penId?: string | null, animalId?: string | null) {
  revalidatePath("/feed");
  revalidatePath("/feed/records");
  revalidatePath("/feed/batches");
  revalidatePath("/feed/analysis");
  if (animalId) revalidatePath(`/animals/${animalId}`);
  if (penId) revalidatePath(`/pens/${penId}`);
}

export async function recordFeeding(formData: FormData) {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const target = requireString(formData, "target");
  if (target !== "PEN" && target !== "PIG") {
    throw new Error("Feeding must be recorded against a pen or an animal");
  }

  const fedAt = requireDate(formData, "fedAt");
  assertNotFuture(fedAt, "Feeding date");

  const feedTypeId = requireString(formData, "feedTypeId");
  const feedType = await prisma.feedType.findFirst({
    where: { id: feedTypeId, farmId },
    select: { id: true, classification: true },
  });
  if (!feedType) throw new Error("That feed type does not belong to this farm");

  let penId: string | null = null;
  let animalId: string | null = null;
  let animalCount: number;

  if (target === "PEN") {
    penId = requireString(formData, "penId");
    const pen = await prisma.pen.findFirst({
      where: { id: penId, farmId },
      select: { id: true, _count: { select: { animals: { where: { status: "ACTIVE" } } } } },
    });
    if (!pen) throw new Error("That pen does not belong to this farm");

    // The headcount is captured at feeding time (schema comment on
    // `FeedingRecord.animalCount`) so cost-per-animal doesn't shift when animals
    // are moved later. The form pre-fills it from live occupancy; a worker can
    // correct it, because a pen sheet and the database disagree often enough.
    animalCount = optionalFloat(formData, "animalCount") !== null
      ? requireInt(formData, "animalCount")
      : pen._count.animals;
  } else {
    animalId = requireString(formData, "animalId");
    const animal = await prisma.animal.findFirst({
      where: { id: animalId, farmId },
      select: { id: true, penId: true },
    });
    if (!animal) throw new Error("That animal does not belong to this farm");
    animalCount = 1;
  }

  if (!Number.isFinite(animalCount) || animalCount < 1) {
    throw new Error("Animal count must be at least 1");
  }

  const allocatedKg = requireFloat(formData, "allocatedKg");
  if (allocatedKg <= 0) throw new Error("Allocated quantity must be greater than zero");

  const consumedKg = optionalFloat(formData, "consumedKg");
  // §8.4 — consumption may not exceed the allocation by more than 10%.
  assertConsumptionWithinTolerance(allocatedKg, consumedKg);

  const preferredBatchId = optionalString(formData, "feedBatchId");
  if (preferredBatchId) {
    const batch = await prisma.feedBatch.findFirst({
      where: { id: preferredBatchId, feedTypeId, feedType: { farmId } },
      select: { id: true },
    });
    if (!batch) throw new Error("That batch does not belong to this feed type");
  }

  await writeFeeding({
    farmId,
    userId: user.id,
    fedAt,
    feedTypeId,
    penId,
    animalId,
    animalCount,
    allocatedKg,
    consumedKg,
    preferredBatchId,
    notes: optionalString(formData, "notes"),
  });

  // §8.4 — feed stage should match the animals. A warning, not a refusal: see
  // src/lib/feed/stage-match.ts for why blocking this costs more than it saves.
  const warning = stageMismatchWarning(
    feedType.classification,
    await targetStageCounts(farmId, { penId, animalId })
  );

  revalidateFeeding(penId, animalId);
  redirect(
    warning
      ? `/feed/records?saved=1&warn=${encodeURIComponent(warning)}`
      : "/feed/records?saved=1"
  );
}

/**
 * "Feed every pen its programme ration" in one submit.
 *
 * Daily logging one form at a time for twenty pens does not get done, and an
 * unrecorded feeding is not a neutral gap — it makes every FCR, cost-per-kg
 * and intake trend downstream read better than reality. So this exists.
 *
 * Each pen gets its OWN transaction rather than one transaction for the lot:
 * with twenty pens, one feed type running short would otherwise roll back the
 * nineteen that were fine and leave the whole morning unrecorded. Failures are
 * collected and reported by pen instead.
 */
export async function recordBulkFeeding(formData: FormData) {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const fedAt = requireDate(formData, "fedAt");
  assertNotFuture(fedAt, "Feeding date");

  const penIds = formData.getAll("penId").filter((v): v is string => typeof v === "string");
  if (penIds.length === 0) {
    throw new Error("Select at least one pen to record feeding for");
  }

  const pens = await prisma.pen.findMany({
    where: { id: { in: penIds }, farmId },
    select: { id: true, name: true },
  });
  if (pens.length !== penIds.length) {
    throw new Error("One of those pens does not belong to this farm");
  }

  const feedTypes = await prisma.feedType.findMany({
    where: { farmId },
    select: { id: true, classification: true },
  });
  const feedTypeById = new Map(feedTypes.map((f) => [f.id, f]));
  const herd = await getHerdWithStages(farmId);

  let recorded = 0;
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const pen of pens) {
    const feedTypeId = String(formData.get(`feedType-${pen.id}`) ?? "").trim();
    const feedType = feedTypeById.get(feedTypeId);
    const kg = Number.parseFloat(String(formData.get(`kg-${pen.id}`) ?? ""));
    const count = Number.parseInt(String(formData.get(`count-${pen.id}`) ?? ""), 10);

    if (!feedType) {
      failures.push(`${pen.name}: no feed type selected`);
      continue;
    }
    if (!Number.isFinite(kg) || kg <= 0) {
      failures.push(`${pen.name}: quantity must be greater than zero`);
      continue;
    }
    if (!Number.isFinite(count) || count < 1) {
      failures.push(`${pen.name}: no animals in the pen`);
      continue;
    }

    try {
      await writeFeeding({
        farmId,
        userId: user.id,
        fedAt,
        feedTypeId,
        penId: pen.id,
        animalId: null,
        animalCount: count,
        allocatedKg: kg,
        // Bulk entry records what was put out. Consumption is observed
        // per-pen afterwards, on the individual form, when it differs.
        consumedKg: null,
        preferredBatchId: null,
        notes: optionalString(formData, "notes"),
      });
      recorded += 1;

      const counts = new Map<LifeStage, number>();
      for (const animal of herd.filter((a) => a.penId === pen.id)) {
        counts.set(animal.stage, (counts.get(animal.stage) ?? 0) + 1);
      }
      const warning = stageMismatchWarning(feedType.classification, counts);
      if (warning) warnings.push(`${pen.name}: ${warning}`);
    } catch (error) {
      failures.push(`${pen.name}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  revalidateFeeding();

  const params = new URLSearchParams({ recorded: String(recorded) });
  if (failures.length > 0) params.set("failed", failures.join(" • "));
  if (warnings.length > 0) params.set("warn", warnings.join(" • "));
  redirect(`/feed/records?${params.toString()}`);
}

/**
 * Deleting a feeding record returns its feed to the batch it came from. A
 * mistyped 500 kg that stays subtracted would have the store showing empty and
 * a reorder alert firing for feed that is physically sitting there.
 */
export async function deleteFeedingRecord(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.feedingRecord.findFirst({
    where: { id, farmId },
    select: { id: true, penId: true, animalId: true, feedBatchId: true, allocatedKg: true },
  });
  if (!existing) throw new Error("Feeding record not found");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (existing.feedBatchId) {
      await tx.feedBatch.update({
        where: { id: existing.feedBatchId },
        data: { remainingKg: { increment: existing.allocatedKg } },
      });
    }
    await tx.feedingRecord.delete({ where: { id: existing.id } });
  });

  revalidateFeeding(existing.penId, existing.animalId);
}
