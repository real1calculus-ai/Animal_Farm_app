"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LifeStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import {
  optionalFloat,
  optionalInt,
  optionalString,
  requireBoolean,
  requireEnum,
  requireFloat,
  requireString,
} from "@/lib/validation";

const STAGES = Object.keys(LIFE_STAGE_LABELS) as LifeStage[];

async function readForm(formData: FormData, farmId: string) {
  const feedTypeId = requireString(formData, "feedTypeId");
  const feedType = await prisma.feedType.findFirst({
    where: { id: feedTypeId, farmId },
    select: { id: true },
  });
  if (!feedType) throw new Error("That feed type does not belong to this farm");

  const dailyKgPerAnimal = requireFloat(formData, "dailyKgPerAnimal");
  if (dailyKgPerAnimal <= 0) throw new Error("Daily ration must be greater than zero");

  const ageDaysMin = optionalInt(formData, "ageDaysMin");
  const ageDaysMax = optionalInt(formData, "ageDaysMax");
  if (ageDaysMin !== null && ageDaysMin < 0) throw new Error("Age from cannot be negative");
  if (ageDaysMax !== null && ageDaysMax < 0) throw new Error("Age to cannot be negative");
  if (ageDaysMin !== null && ageDaysMax !== null && ageDaysMax < ageDaysMin) {
    throw new Error("Age window ends before it starts");
  }

  // Typed as a percentage, stored as a fraction — the schema comment on
  // `pctOfBodyweight` documents 0.04 for 4%, and nobody types "0.04".
  const pctTyped = optionalFloat(formData, "pctOfBodyweight");
  if (pctTyped !== null && (pctTyped <= 0 || pctTyped > 100)) {
    throw new Error("Percentage of bodyweight must be between 0 and 100");
  }

  return {
    name: requireString(formData, "name"),
    stage: requireEnum(formData, "stage", STAGES),
    feedTypeId,
    dailyKgPerAnimal,
    ageDaysMin,
    ageDaysMax,
    pctOfBodyweight: pctTyped === null ? null : pctTyped / 100,
    notes: optionalString(formData, "notes"),
    isActive: requireBoolean(formData, "isActive"),
  };
}

function revalidatePrograms(id?: string) {
  revalidatePath("/feed/programs");
  revalidatePath("/feed/records");
  if (id) revalidatePath(`/feed/programs/${id}`);
}

export async function createFeedingProgram(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const data = await readForm(formData, farmId);

  const existing = await prisma.feedingProgram.findFirst({
    where: { farmId, name: data.name },
    select: { id: true },
  });
  if (existing) throw new Error(`A programme called "${data.name}" already exists`);

  await prisma.feedingProgram.create({ data: { ...data, farmId } });
  revalidatePrograms();
  redirect("/feed/programs");
}

export async function updateFeedingProgram(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.feedingProgram.findFirst({
    where: { id, farmId },
    select: { id: true },
  });
  if (!existing) throw new Error("Programme not found");

  const data = await readForm(formData, farmId);
  const clash = await prisma.feedingProgram.findFirst({
    where: { farmId, name: data.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new Error(`A programme called "${data.name}" already exists`);

  await prisma.feedingProgram.update({ where: { id }, data });
  revalidatePrograms(id);
  redirect("/feed/programs");
}

export async function setFeedingProgramActive(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");
  const isActive = requireBoolean(formData, "isActive");

  const existing = await prisma.feedingProgram.findFirst({
    where: { id, farmId },
    select: { id: true },
  });
  if (!existing) throw new Error("Programme not found");

  await prisma.feedingProgram.update({ where: { id }, data: { isActive } });
  revalidatePrograms(id);
}

/**
 * A programme is a standing instruction, not history — nothing references it
 * once it is gone, so deleting is safe here in a way it is not for feed types.
 */
export async function deleteFeedingProgram(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.feedingProgram.findFirst({
    where: { id, farmId },
    select: { id: true },
  });
  if (!existing) throw new Error("Programme not found");

  await prisma.feedingProgram.delete({ where: { id } });
  revalidatePrograms();
  redirect("/feed/programs");
}
