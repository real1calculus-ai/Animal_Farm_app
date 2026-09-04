"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { addDays } from "@/lib/format";
import { optionalInt, requireString } from "@/lib/validation";

/**
 * Dismisses a computed alert.
 *
 * The alert itself is never stored — only this record that someone chose to
 * silence it, keyed by the alert's stable key. Without a snooze the dismissal
 * is permanent; with one, the alert returns when the snooze lapses, which is
 * the honest behaviour for something like "feed expiring soon" that will still
 * be true next week.
 */
export async function dismissAlert(formData: FormData): Promise<void> {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);

  const alertKey = requireString(formData, "alertKey");
  const snoozeDays = optionalInt(formData, "snoozeDays");
  const snoozedUntil = snoozeDays && snoozeDays > 0 ? addDays(new Date(), snoozeDays) : null;

  await prisma.alertAcknowledgement.upsert({
    where: { farmId_alertKey: { farmId, alertKey } },
    update: { snoozedUntil, acknowledgedByProfileId: user.id },
    create: { farmId, alertKey, snoozedUntil, acknowledgedByProfileId: user.id },
  });

  revalidatePath("/");
}
