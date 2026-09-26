"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { countFromEvents } from "@/lib/batch-metrics";
import {
  assertNotFuture,
  optionalCents,
  optionalDate,
  optionalFloat,
  optionalInt,
  optionalString,
  requireDate,
  requireEnum,
  requireFloat,
  requireInt,
  requireString,
} from "@/lib/validation";

const EVENT_TYPES = [
  "STOCKED",
  "MORTALITY",
  "CULL",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "SALE",
  "WEIGHT_SAMPLE",
] as const;

const PRODUCTION_TYPES = ["EGGS", "MILK", "OTHER"] as const;
const STATUSES = ["ACTIVE", "SOLD", "CLOSED"] as const;

/** Events that reduce the headcount, and so can be over-applied. */
const REMOVES_ANIMALS = new Set(["MORTALITY", "CULL", "TRANSFER_OUT", "SALE"]);

export async function createBatch(formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const speciesId = requireString(formData, "speciesId");
  const species = await prisma.species.findFirst({
    where: { id: speciesId, farmId },
    select: { id: true, code: true, trackingMode: true },
  });
  if (!species) throw new Error("That species does not belong to this farm");
  if (species.trackingMode === "INDIVIDUAL") {
    throw new Error(
      "This species is tracked as individual animals. Add them from the Animals screen instead."
    );
  }

  const startDate = requireDate(formData, "startDate");
  assertNotFuture(startDate, "Start date");

  const initialCount = requireInt(formData, "initialCount");
  if (initialCount <= 0) throw new Error("A batch must start with at least one animal");

  const startAgeDays = optionalInt(formData, "startAgeDays") ?? 0;
  if (startAgeDays < 0) throw new Error("Age on arrival cannot be negative");

  const penId = optionalString(formData, "penId");
  if (penId) {
    const pen = await prisma.pen.findFirst({ where: { id: penId, farmId }, select: { id: true } });
    if (!pen) throw new Error("That pen does not belong to this farm");
  }

  const acquisitionCostCents = optionalCents(formData, "acquisitionCostCents");
  const batchCode = requireString(formData, "batchCode");

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.animalBatch.create({
        data: {
          farmId,
          speciesId,
          name: requireString(formData, "name"),
          batchCode,
          penId,
          startDate,
          startAgeDays,
          initialCount,
          // Seeded equal to the opening count; every later change goes through
          // an event so the two can always be reconciled.
          currentCount: initialCount,
          source: optionalString(formData, "source"),
          acquisitionCostCents,
          avgWeightKg: optionalFloat(formData, "avgWeightKg"),
          notes: optionalString(formData, "notes"),
        },
        select: { id: true },
      });

      // The opening stock is itself an event. Without it the log would not
      // explain where the initial count came from, and reconciliation would
      // have to special-case the first row forever.
      await tx.batchEvent.create({
        data: {
          batchId: batch.id,
          eventType: "STOCKED",
          occurredAt: startDate,
          quantity: 0,
          reason: optionalString(formData, "source") ?? "Opening stock",
          createdByProfileId: user.id,
        },
      });

      if (acquisitionCostCents && acquisitionCostCents > 0) {
        await tx.financialTransaction.create({
          data: {
            farmId,
            occurredAt: startDate,
            direction: "EXPENSE",
            category: "OTHER_EXPENSE",
            amountCents: acquisitionCostCents,
            description: `Stocked ${initialCount} — ${requireString(formData, "name")}`,
            createdByProfileId: user.id,
          },
        });
      }
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new Error(`A batch with the code "${batchCode}" already exists on this farm`);
    }
    throw error;
  }

  revalidatePath("/batches");
  redirect("/batches");
}

/**
 * Records an event and moves the cached headcount in the same transaction.
 *
 * The two must never be written apart. The event log is the authority, but
 * every list screen reads `currentCount`, so a half-applied write leaves the
 * farm looking at a number the log disagrees with and nothing to announce it.
 */
export async function recordBatchEvent(batchId: string, formData: FormData): Promise<void> {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const batch = await prisma.animalBatch.findFirst({
    where: { id: batchId, farmId },
    select: { id: true, currentCount: true, status: true, name: true },
  });
  if (!batch) throw new Error("Batch not found");
  if (batch.status !== "ACTIVE") throw new Error("This batch is closed. Reopen it before recording events.");

  const eventType = requireEnum(formData, "eventType", EVENT_TYPES);
  const occurredAt = requireDate(formData, "occurredAt");
  assertNotFuture(occurredAt, "Event date");

  const weightKg = optionalFloat(formData, "weightKg");
  const quantity = eventType === "WEIGHT_SAMPLE" ? 0 : requireInt(formData, "quantity");

  if (eventType === "WEIGHT_SAMPLE") {
    if (weightKg === null || weightKg <= 0) {
      throw new Error("A weight sample needs an average weight");
    }
  } else if (quantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  // Refuse rather than clamp. Recording 40 deaths in a pen of 30 is a
  // mistyped figure, and silently accepting it would leave a mortality rate
  // that is wrong in the direction nobody checks.
  if (REMOVES_ANIMALS.has(eventType) && quantity > batch.currentCount) {
    throw new Error(
      `Cannot record ${quantity} — the batch holds ${batch.currentCount}. Check the figure.`
    );
  }

  const delta =
    eventType === "WEIGHT_SAMPLE" ? 0 : REMOVES_ANIMALS.has(eventType) ? -quantity : quantity;

  await prisma.$transaction(async (tx) => {
    await tx.batchEvent.create({
      data: {
        batchId,
        eventType,
        occurredAt,
        quantity,
        weightKg,
        reason: optionalString(formData, "reason"),
        notes: optionalString(formData, "notes"),
        createdByProfileId: user.id,
      },
    });

    await tx.animalBatch.update({
      where: { id: batchId },
      data: {
        currentCount: { increment: delta },
        // A weight sample is how a batch's average weight is known at all —
        // nobody weighs every bird, so the latest sample is the figure every
        // growth and conversion number downstream is built on.
        ...(weightKg !== null && weightKg > 0 ? { avgWeightKg: weightKg } : {}),
      },
    });
  });

  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
}

export async function recordBatchProduction(batchId: string, formData: FormData): Promise<void> {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const batch = await prisma.animalBatch.findFirst({
    where: { id: batchId, farmId },
    select: { id: true },
  });
  if (!batch) throw new Error("Batch not found");

  const collectedAt = requireDate(formData, "collectedAt");
  assertNotFuture(collectedAt, "Collection date");

  const quantity = requireFloat(formData, "quantity");
  if (quantity < 0) throw new Error("Quantity cannot be negative");

  const rejectedQuantity = optionalFloat(formData, "rejectedQuantity") ?? 0;
  if (rejectedQuantity < 0) throw new Error("Rejected quantity cannot be negative");
  if (rejectedQuantity > quantity) {
    throw new Error("Rejected cannot exceed the total collected");
  }

  await prisma.batchProductionRecord.create({
    data: {
      batchId,
      productionType: requireEnum(formData, "productionType", PRODUCTION_TYPES),
      collectedAt,
      quantity,
      rejectedQuantity,
      unit: optionalString(formData, "unit") ?? "count",
      notes: optionalString(formData, "notes"),
      createdByProfileId: user.id,
    },
  });

  revalidatePath(`/batches/${batchId}`);
}

export async function updateBatchStatus(batchId: string, formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const batch = await prisma.animalBatch.findFirst({
    where: { id: batchId, farmId },
    select: { id: true },
  });
  if (!batch) throw new Error("Batch not found");

  const status = requireEnum(formData, "status", STATUSES);

  await prisma.animalBatch.update({
    where: { id: batchId },
    data: {
      status,
      endDate: status === "ACTIVE" ? null : (optionalDate(formData, "endDate") ?? new Date()),
    },
  });

  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
}

/**
 * Rebuilds the cached headcount from the event log.
 *
 * Offered rather than done automatically: drift means something went wrong,
 * and quietly correcting it would erase the only evidence. The user sees the
 * discrepancy, then chooses to trust the log.
 */
export async function reconcileBatchCount(batchId: string): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const batch = await prisma.animalBatch.findFirst({
    where: { id: batchId, farmId },
    select: {
      id: true,
      initialCount: true,
      events: { select: { eventType: true, quantity: true, occurredAt: true } },
    },
  });
  if (!batch) throw new Error("Batch not found");

  await prisma.animalBatch.update({
    where: { id: batchId },
    data: { currentCount: countFromEvents(batch.initialCount, batch.events) },
  });

  revalidatePath(`/batches/${batchId}`);
}
