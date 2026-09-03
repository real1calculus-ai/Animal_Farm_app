"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { HOUSING_TYPE_LABELS, PEN_TASK_TYPE_LABELS } from "@/lib/labels";
import {
  assertNotFuture,
  optionalCents,
  optionalDate,
  optionalString,
  requireDate,
  requireEnum,
  requireInt,
  requireString,
} from "@/lib/validation";

const HOUSING_TYPES = Object.keys(HOUSING_TYPE_LABELS) as (keyof typeof HOUSING_TYPE_LABELS)[];
const TASK_TYPES = Object.keys(PEN_TASK_TYPE_LABELS) as (keyof typeof PEN_TASK_TYPE_LABELS)[];

function readPenFields(formData: FormData) {
  const capacity = requireInt(formData, "capacity");
  if (capacity < 0) throw new Error("Capacity cannot be negative");

  return {
    name: requireString(formData, "name"),
    housingType: requireEnum(formData, "housingType", HOUSING_TYPES),
    capacity,
    location: optionalString(formData, "location"),
    notes: optionalString(formData, "notes"),
  };
}

/**
 * Pen names are unique per farm, and the collision surfaces as a Prisma P2002
 * rather than anything a person would recognise. Two pens both called
 * "Farrowing 2" is a genuine operational hazard — animals get moved to the
 * wrong one — so the constraint is worth keeping and worth explaining.
 */
function rethrowDuplicateName(error: unknown, name: string): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw new Error(`A pen called "${name}" already exists on this farm`);
  }
  throw error;
}

export async function createPen(formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const fields = readPenFields(formData);

  try {
    await prisma.pen.create({ data: { ...fields, farmId } });
  } catch (error) {
    rethrowDuplicateName(error, fields.name);
  }

  revalidatePath("/pens");
  redirect("/pens");
}

export async function updatePen(id: string, formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const fields = readPenFields(formData);

  // Scoped by farmId, not just id: this action is reachable by direct POST, so
  // the id alone must never be enough to reach another farm's pen.
  const pen = await prisma.pen.findFirst({ where: { id, farmId }, select: { id: true } });
  if (!pen) throw new Error("Pen not found");

  try {
    await prisma.pen.update({ where: { id }, data: fields });
  } catch (error) {
    rethrowDuplicateName(error, fields.name);
  }

  revalidatePath("/pens");
  revalidatePath(`/pens/${id}`);
  redirect(`/pens/${id}`);
}

/**
 * Retires a pen rather than deleting it. Occupancy history and cleaning
 * records point at this row, and a farm that deletes a pen loses the
 * biosecurity trail for every animal that ever lived in it — which is the one
 * record you actually need after a disease event.
 */
export async function setPenActive(id: string, isActive: boolean): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const pen = await prisma.pen.findFirst({
    where: { id, farmId },
    select: { id: true, _count: { select: { pigs: true } } },
  });
  if (!pen) throw new Error("Pen not found");

  if (!isActive) {
    const occupants = await prisma.pig.count({ where: { penId: id, status: "ACTIVE" } });
    if (occupants > 0) {
      throw new Error(
        `This pen still holds ${occupants} animal${occupants === 1 ? "" : "s"}. Move them out before retiring it.`
      );
    }
  }

  await prisma.pen.update({ where: { id }, data: { isActive } });

  revalidatePath("/pens");
  revalidatePath(`/pens/${id}`);
}

/**
 * Records a cleaning, disinfection or repair. A task with a cost posts a
 * matching housing expense in the same transaction — the finance module reads
 * the ledger and must never have to re-derive spend by walking pen tasks.
 */
export async function recordPenTask(penId: string, formData: FormData): Promise<void> {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const pen = await prisma.pen.findFirst({
    where: { id: penId, farmId },
    select: { id: true, name: true },
  });
  if (!pen) throw new Error("Pen not found");

  const taskType = requireEnum(formData, "taskType", TASK_TYPES);
  const performedAt = requireDate(formData, "performedAt");
  assertNotFuture(performedAt, "Task date");

  const nextDueAt = optionalDate(formData, "nextDueAt");
  const costCents = optionalCents(formData, "costCents");
  const notes = optionalString(formData, "notes");

  await prisma.$transaction(async (tx) => {
    await tx.penTask.create({
      data: {
        penId,
        taskType,
        performedAt,
        nextDueAt,
        costCents,
        notes,
        performedByProfileId: user.id,
      },
    });

    if (costCents && costCents > 0) {
      await tx.financialTransaction.create({
        data: {
          farmId,
          occurredAt: performedAt,
          direction: "EXPENSE",
          category: "HOUSING",
          amountCents: costCents,
          description: `${PEN_TASK_TYPE_LABELS[taskType]} — ${pen.name}`,
          createdByProfileId: user.id,
        },
      });
    }
  });

  revalidatePath("/pens");
  revalidatePath(`/pens/${penId}`);
  revalidatePath("/finance");
}
