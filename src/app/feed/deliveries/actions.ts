"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  assertNotFuture,
  optionalDate,
  optionalString,
  requireCents,
  requireDate,
  requireFloat,
  requireString,
} from "@/lib/validation";

/**
 * Recording a feed delivery.
 *
 * The batch and its ledger entry are written in ONE `prisma.$transaction`, and
 * that is the whole point of this action. Feed is the largest recurring cost on
 * a pig farm; if the ledger row were written separately — or, worse, left for
 * the finance module to re-derive by summing batches — then any failure between
 * the two writes produces stock that exists but was never paid for, and the P&L
 * silently under-reports. The finance module reads `FinancialTransaction` and
 * nothing else, so this transaction is the only thing keeping the two in step.
 */
export async function recordDelivery(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const feedTypeId = requireString(formData, "feedTypeId");
  const feedType = await prisma.feedType.findFirst({
    where: { id: feedTypeId, farmId },
    select: { id: true, name: true },
  });
  if (!feedType) throw new Error("That feed type does not belong to this farm");

  const batchCode = requireString(formData, "batchCode");
  const receivedDate = requireDate(formData, "receivedDate");
  assertNotFuture(receivedDate, "Received date");

  const expirationDate = optionalDate(formData, "expirationDate");
  if (expirationDate && expirationDate.getTime() < receivedDate.getTime()) {
    throw new Error("Expiry date cannot be before the received date");
  }

  const quantityKg = requireFloat(formData, "quantityKg");
  if (quantityKg <= 0) throw new Error("Quantity must be greater than zero");

  const costPerKgCents = requireCents(formData, "costPerKg");

  const supplierId = optionalString(formData, "supplierId");
  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, farmId },
      select: { id: true },
    });
    if (!supplier) throw new Error("That supplier does not belong to this farm");
  }

  const storageLocationId = optionalString(formData, "storageLocationId");
  if (storageLocationId) {
    const location = await prisma.feedStorageLocation.findFirst({
      where: { id: storageLocationId, farmId },
      select: { id: true },
    });
    if (!location) throw new Error("That storage location does not belong to this farm");
  }

  // Integer arithmetic on minor units — `quantityKg` is a float, so this is
  // rounded once, here, rather than accumulating drift downstream.
  const amountCents = Math.round(quantityKg * costPerKgCents);

  const batchId = await prisma.$transaction(async (tx) => {
    const batch = await tx.feedBatch.create({
      data: {
        feedTypeId: feedType.id,
        batchCode,
        supplierLotNumber: optionalString(formData, "supplierLotNumber"),
        supplierId,
        receivedDate,
        expirationDate,
        quantityKg,
        // A new delivery is untouched stock by definition.
        remainingKg: quantityKg,
        costPerKgCents,
        storageLocationId,
        nutritionalAnalysis: optionalString(formData, "nutritionalAnalysis"),
        qualityNotes: optionalString(formData, "qualityNotes"),
        receivedByProfileId: user.id,
      },
      select: { id: true },
    });

    await tx.financialTransaction.create({
      data: {
        farmId,
        occurredAt: receivedDate,
        direction: "EXPENSE",
        category: "FEED",
        amountCents,
        description: `Feed delivery — ${feedType.name}, batch ${batchCode} (${quantityKg.toFixed(1)} kg)`,
        feedBatchId: batch.id,
        createdByProfileId: user.id,
      },
    });

    return batch.id;
  });

  revalidatePath("/feed");
  revalidatePath("/feed/batches");
  revalidatePath("/feed/deliveries");
  revalidatePath("/feed/storage");
  revalidatePath("/finance");
  redirect(`/feed/batches/${batchId}`);
}
