"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  optionalFloat,
  optionalString,
  requireBoolean,
  requireString,
} from "@/lib/validation";

function readForm(formData: FormData) {
  const capacityKg = optionalFloat(formData, "capacityKg");
  if (capacityKg !== null && capacityKg <= 0) {
    throw new Error("Capacity must be greater than zero, or blank");
  }

  return {
    name: requireString(formData, "name"),
    capacityKg,
    notes: optionalString(formData, "notes"),
    isActive: requireBoolean(formData, "isActive"),
  };
}

export async function createStorageLocation(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const data = readForm(formData);

  const existing = await prisma.feedStorageLocation.findFirst({
    where: { farmId, name: data.name },
    select: { id: true },
  });
  if (existing) throw new Error(`A location called "${data.name}" already exists`);

  await prisma.feedStorageLocation.create({ data: { ...data, farmId } });
  revalidatePath("/feed/storage");
}

export async function updateStorageLocation(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.feedStorageLocation.findFirst({
    where: { id, farmId },
    select: { id: true },
  });
  if (!existing) throw new Error("Storage location not found");

  const data = readForm(formData);
  const clash = await prisma.feedStorageLocation.findFirst({
    where: { farmId, name: data.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new Error(`A location called "${data.name}" already exists`);

  await prisma.feedStorageLocation.update({ where: { id }, data });
  revalidatePath("/feed/storage");
}

/** Refused while feed is still stored there — the fill level would vanish. */
export async function deleteStorageLocation(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.feedStorageLocation.findFirst({
    where: { id, farmId },
    select: { id: true, name: true, _count: { select: { batches: true } } },
  });
  if (!existing) throw new Error("Storage location not found");
  if (existing._count.batches > 0) {
    throw new Error(
      `"${existing.name}" still holds ${existing._count.batches} batch(es). Mark it out of use instead.`
    );
  }

  await prisma.feedStorageLocation.delete({ where: { id } });
  revalidatePath("/feed/storage");
}
