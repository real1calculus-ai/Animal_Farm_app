"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { optionalString, requireString } from "@/lib/validation";
import { isExpired } from "@/lib/feed/allocation";

/**
 * Writing off spoiled or expired stock from the inventory screen.
 *
 * No ledger row is written. The feed was already expensed in full when it was
 * delivered (see `/feed/deliveries/actions.ts`), so posting a second EXPENSE
 * here would count the same money twice — a write-off is a stock correction,
 * not a new cost. The batch's quality notes carry the reason so the loss is
 * still traceable to a supplier and a lot.
 */
export async function writeOffBatch(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");
  const reason = optionalString(formData, "reason");

  const batch = await prisma.feedBatch.findFirst({
    where: { id, feedType: { farmId } },
    select: {
      id: true,
      batchCode: true,
      remainingKg: true,
      expirationDate: true,
      qualityNotes: true,
    },
  });
  if (!batch) throw new Error("Batch not found");
  if (batch.remainingKg <= 0) throw new Error("That batch is already empty");

  const note = `Written off ${batch.remainingKg.toFixed(1)} kg on ${new Date().toISOString().slice(0, 10)}${
    reason ? ` — ${reason}` : isExpired(batch) ? " — expired" : ""
  }`;

  await prisma.feedBatch.update({
    where: { id: batch.id },
    data: {
      remainingKg: 0,
      qualityNotes: batch.qualityNotes ? `${batch.qualityNotes}\n${note}` : note,
    },
  });

  revalidatePath("/feed");
  revalidatePath("/feed/batches");
  revalidatePath(`/feed/batches/${batch.id}`);
  revalidatePath("/feed/storage");
}
