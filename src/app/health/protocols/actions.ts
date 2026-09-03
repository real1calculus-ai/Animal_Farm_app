"use server";

import { revalidatePath } from "next/cache";
import type { LifeStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import {
  optionalInt,
  optionalString,
  requireEnum,
  requireString,
} from "@/lib/validation";

/**
 * The farm's standing vaccination schedule.
 *
 * ADMIN and MANAGER only: this is not a record of what happened, it is the
 * rule that decides what the whole herd is *owed*, so a bad edit here silently
 * changes every due date and every compliance figure on the vaccination
 * screen. Veterinarians and workers record doses; they do not rewrite the
 * programme.
 */
const LIFE_STAGES = Object.keys(LIFE_STAGE_LABELS) as LifeStage[];

type ProtocolFields = {
  name: string;
  vaccineName: string;
  targetStage: LifeStage;
  ageDaysMin: number | null;
  ageDaysMax: number | null;
  boosterIntervalDays: number | null;
  notes: string | null;
  isActive: boolean;
};

function readFields(formData: FormData): ProtocolFields {
  const ageDaysMin = optionalInt(formData, "ageDaysMin");
  const ageDaysMax = optionalInt(formData, "ageDaysMax");
  const boosterIntervalDays = optionalInt(formData, "boosterIntervalDays");

  if (ageDaysMin === null && boosterIntervalDays === null) {
    throw new Error(
      "A protocol item needs either an age window (for a primary dose) or a booster interval (for a repeating dose)"
    );
  }
  if (ageDaysMin !== null && ageDaysMin < 0) {
    throw new Error("The earliest age cannot be negative");
  }
  if (ageDaysMax !== null && ageDaysMin !== null && ageDaysMax < ageDaysMin) {
    throw new Error("The latest age cannot be before the earliest age");
  }
  if (ageDaysMax !== null && ageDaysMin === null) {
    throw new Error("Set an earliest age as well as a latest age");
  }
  if (boosterIntervalDays !== null && boosterIntervalDays < 1) {
    throw new Error("A booster interval must be at least one day");
  }

  return {
    name: requireString(formData, "name"),
    vaccineName: requireString(formData, "vaccineName"),
    targetStage: requireEnum(formData, "targetStage", LIFE_STAGES),
    ageDaysMin,
    ageDaysMax,
    boosterIntervalDays,
    notes: optionalString(formData, "notes"),
    isActive: formData.get("isActive") !== "off",
  };
}

export async function createProtocolItem(formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  await prisma.vaccinationProtocolItem.create({
    data: { farmId, ...readFields(formData) },
  });

  revalidatePath("/health/protocols");
  revalidatePath("/health/vaccinations");
}

export async function updateProtocolItem(formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.vaccinationProtocolItem.findFirst({
    where: { id, farmId },
    select: { id: true },
  });
  if (!existing) throw new Error("Protocol item not found on this farm");

  await prisma.vaccinationProtocolItem.update({
    where: { id: existing.id },
    data: readFields(formData),
  });

  revalidatePath("/health/protocols");
  revalidatePath("/health/vaccinations");
}

/**
 * Retiring an item is preferred to deleting it: an inactive item stops
 * generating due dates but keeps the doses already recorded against it
 * attached to a named protocol.
 */
export async function toggleProtocolItem(formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.vaccinationProtocolItem.findFirst({
    where: { id, farmId },
    select: { id: true, isActive: true },
  });
  if (!existing) throw new Error("Protocol item not found on this farm");

  await prisma.vaccinationProtocolItem.update({
    where: { id: existing.id },
    data: { isActive: !existing.isActive },
  });

  revalidatePath("/health/protocols");
  revalidatePath("/health/vaccinations");
}

export async function deleteProtocolItem(formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.vaccinationProtocolItem.findFirst({
    where: { id, farmId },
    select: { id: true, _count: { select: { records: true } } },
  });
  if (!existing) throw new Error("Protocol item not found on this farm");

  // Doses already given survive (the FK is SetNull) but lose the name of the
  // programme they belonged to, which is history the farm cannot get back.
  if (existing._count.records > 0) {
    throw new Error(
      `${existing._count.records} recorded doses reference this protocol item. Retire it instead of deleting it, so those records keep their programme name.`
    );
  }

  await prisma.vaccinationProtocolItem.delete({ where: { id: existing.id } });

  revalidatePath("/health/protocols");
  revalidatePath("/health/vaccinations");
}
