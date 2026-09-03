"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FeedClassification } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { FEED_CLASSIFICATION_LABELS } from "@/lib/labels";
import {
  optionalCents,
  optionalFloat,
  optionalString,
  requireBoolean,
  requireEnum,
  requireString,
} from "@/lib/validation";

/**
 * Feed product CRUD. Management-only: a feed type carries a price and a
 * reorder level, and both feed straight into purchasing decisions and the
 * ledger, so a data-entry worker changing them would silently move money.
 */

const CLASSIFICATIONS = Object.keys(FEED_CLASSIFICATION_LABELS) as FeedClassification[];

/** Percentages are stored as-typed (0-100), matching the schema's `*Pct` fields. */
function percentField(formData: FormData, key: string): number | null {
  const value = optionalFloat(formData, key);
  if (value === null) return null;
  if (value < 0 || value > 100) throw new Error(`${key} must be between 0 and 100`);
  return value;
}

async function readForm(formData: FormData, farmId: string) {
  const supplierId = optionalString(formData, "supplierId");
  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, farmId },
      select: { id: true },
    });
    if (!supplier) throw new Error("That supplier does not belong to this farm");
  }

  const reorderLevelKg = optionalFloat(formData, "reorderLevelKg") ?? 0;
  if (reorderLevelKg < 0) throw new Error("Reorder level cannot be negative");

  const meKcalPerKg = optionalFloat(formData, "meKcalPerKg");
  if (meKcalPerKg !== null && meKcalPerKg < 0) {
    throw new Error("Metabolisable energy cannot be negative");
  }

  return {
    name: requireString(formData, "name"),
    classification: requireEnum(formData, "classification", CLASSIFICATIONS),
    description: optionalString(formData, "description"),
    proteinPct: percentField(formData, "proteinPct"),
    fatPct: percentField(formData, "fatPct"),
    fiberPct: percentField(formData, "fiberPct"),
    calciumPct: percentField(formData, "calciumPct"),
    phosphorusPct: percentField(formData, "phosphorusPct"),
    vitamins: optionalString(formData, "vitamins"),
    meKcalPerKg,
    costPerKgCents: optionalCents(formData, "costPerKg"),
    supplierId,
    storageRequirements: optionalString(formData, "storageRequirements"),
    reorderLevelKg,
    isActive: requireBoolean(formData, "isActive"),
  };
}

function revalidateFeedType(id?: string) {
  revalidatePath("/feed");
  revalidatePath("/feed/types");
  revalidatePath("/feed/programs");
  revalidatePath("/feed/deliveries");
  if (id) revalidatePath(`/feed/types/${id}`);
}

export async function createFeedType(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const data = await readForm(formData, farmId);

  const existing = await prisma.feedType.findFirst({
    where: { farmId, name: data.name },
    select: { id: true },
  });
  if (existing) throw new Error(`A feed type called "${data.name}" already exists`);

  await prisma.feedType.create({ data: { ...data, farmId } });

  revalidateFeedType();
  redirect("/feed/types");
}

export async function updateFeedType(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.feedType.findFirst({ where: { id, farmId }, select: { id: true } });
  if (!existing) throw new Error("Feed type not found");

  const data = await readForm(formData, farmId);

  const clash = await prisma.feedType.findFirst({
    where: { farmId, name: data.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new Error(`A feed type called "${data.name}" already exists`);

  await prisma.feedType.update({ where: { id }, data });

  revalidateFeedType(id);
  redirect("/feed/types");
}

/**
 * Archiving, not deleting, is the normal way a feed goes out of use — the
 * batches and feeding records that reference it are the traceability history,
 * and losing them to a cascade would take the recall trail with them.
 */
export async function setFeedTypeActive(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");
  const isActive = requireBoolean(formData, "isActive");

  const existing = await prisma.feedType.findFirst({ where: { id, farmId }, select: { id: true } });
  if (!existing) throw new Error("Feed type not found");

  await prisma.feedType.update({ where: { id }, data: { isActive } });
  revalidateFeedType(id);
}

/** Only allowed while nothing references it — otherwise archive instead. */
export async function deleteFeedType(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.feedType.findFirst({
    where: { id, farmId },
    select: {
      id: true,
      name: true,
      _count: { select: { batches: true, feedingRecords: true, feedingPrograms: true } },
    },
  });
  if (!existing) throw new Error("Feed type not found");

  const { batches, feedingRecords, feedingPrograms } = existing._count;
  if (batches > 0 || feedingRecords > 0 || feedingPrograms > 0) {
    throw new Error(
      `"${existing.name}" is used by ${batches} batch(es), ${feedingRecords} feeding record(s) and ${feedingPrograms} programme(s). Archive it instead so the history survives.`
    );
  }

  await prisma.feedType.delete({ where: { id } });
  revalidateFeedType();
  redirect("/feed/types");
}
