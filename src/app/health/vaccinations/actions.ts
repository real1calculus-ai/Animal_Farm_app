"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { HEALTH_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  assertNotFuture,
  optionalCents,
  optionalDate,
  optionalString,
  requireDate,
  requireString,
} from "@/lib/validation";

/**
 * Vaccination recording.
 *
 * Administering a veterinary medicine and recording its lot number is a
 * clinical act with a recall trail attached, so it stays with the roles that
 * own health data. A WORKER records observations on /health/new; they do not
 * write vaccination records.
 */

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

type VaccinationFields = {
  vaccineName: string;
  administeredAt: Date;
  lotNumber: string | null;
  veterinarian: string | null;
  nextDueDate: Date | null;
  costCents: number;
  notes: string | null;
  protocolItemId: string | null;
};

async function readFields(formData: FormData, farmId: string): Promise<VaccinationFields> {
  const administeredAt = requireDate(formData, "administeredAt");
  // §8.3: vaccination dates cannot be in the future.
  assertNotFuture(administeredAt, "Vaccination date");

  const nextDueDate = optionalDate(formData, "nextDueDate");
  if (nextDueDate && nextDueDate < administeredAt) {
    throw new Error("The next dose cannot be due before this one was given");
  }

  const protocolItemId = optionalString(formData, "protocolItemId");
  if (protocolItemId) {
    const item = await prisma.vaccinationProtocolItem.findFirst({
      where: { id: protocolItemId, farmId },
      select: { id: true },
    });
    if (!item) throw new Error("Protocol item not found on this farm");
  }

  return {
    vaccineName: requireString(formData, "vaccineName"),
    administeredAt,
    lotNumber: optionalString(formData, "lotNumber"),
    veterinarian: optionalString(formData, "veterinarian"),
    nextDueDate,
    costCents: optionalCents(formData, "costCents") ?? 0,
    notes: optionalString(formData, "notes"),
    protocolItemId,
  };
}

/**
 * Records a vaccination for one animal, or for every active animal in a pen.
 *
 * Batch-by-pen is not a convenience: vaccinating is done pen by pen with one
 * bottle and one lot number, and forcing 40 individual entries is how a farm
 * ends up recording none of them. The whole batch is written in a single
 * transaction so a pen is never half-recorded.
 */
export async function recordVaccination(formData: FormData): Promise<void> {
  const user = await requireRole(HEALTH_ROLES);
  const farmId = await getActiveFarmId(user);

  const scope = formData.get("scope") === "PEN" ? "PEN" : "ANIMAL";
  const fields = await readFields(formData, farmId);

  const animals =
    scope === "PEN"
      ? await prisma.animal.findMany({
          where: { farmId, status: "ACTIVE", penId: requireString(formData, "penId") },
          select: { id: true, dateOfBirth: true, tagNumber: true },
        })
      : await prisma.animal.findMany({
          where: { farmId, id: requireString(formData, "animalId") },
          select: { id: true, dateOfBirth: true, tagNumber: true },
        });

  if (animals.length === 0) {
    throw new Error(
      scope === "PEN"
        ? "That pen has no active animals to vaccinate"
        : "Animal not found on this farm"
    );
  }

  for (const animal of animals) {
    if (fields.administeredAt < startOfDay(animal.dateOfBirth)) {
      throw new Error(`Animal ${animal.tagNumber} was not born until after this vaccination date`);
    }
  }

  await prisma.$transaction(
    animals.map((animal) =>
      prisma.vaccinationRecord.create({
        data: {
          animalId: animal.id,
          protocolItemId: fields.protocolItemId,
          vaccineName: fields.vaccineName,
          administeredAt: fields.administeredAt,
          lotNumber: fields.lotNumber,
          veterinarian: fields.veterinarian,
          nextDueDate: fields.nextDueDate,
          costCents: fields.costCents,
          notes: fields.notes,
          createdByProfileId: user.id,
        },
      })
    )
  );

  revalidatePath("/health/vaccinations");
  revalidatePath("/health");
  for (const animal of animals) revalidatePath(`/animals/${animal.id}`);
}

export async function updateVaccination(formData: FormData): Promise<void> {
  const user = await requireRole(HEALTH_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.vaccinationRecord.findFirst({
    where: { id, animal: { farmId } },
    select: { id: true, animalId: true, animal: { select: { dateOfBirth: true } } },
  });
  if (!existing) throw new Error("Vaccination record not found on this farm");

  const fields = await readFields(formData, farmId);
  if (fields.administeredAt < startOfDay(existing.animal.dateOfBirth)) {
    throw new Error("Vaccination date cannot be before the animal was born");
  }

  await prisma.vaccinationRecord.update({
    where: { id: existing.id },
    data: {
      vaccineName: fields.vaccineName,
      administeredAt: fields.administeredAt,
      lotNumber: fields.lotNumber,
      veterinarian: fields.veterinarian,
      nextDueDate: fields.nextDueDate,
      costCents: fields.costCents,
      notes: fields.notes,
      protocolItemId: fields.protocolItemId,
    },
  });

  revalidatePath("/health/vaccinations");
  revalidatePath(`/animals/${existing.animalId}`);
}

export async function deleteVaccination(formData: FormData): Promise<void> {
  const user = await requireRole(HEALTH_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.vaccinationRecord.findFirst({
    where: { id, animal: { farmId } },
    select: { id: true, animalId: true },
  });
  if (!existing) throw new Error("Vaccination record not found on this farm");

  await prisma.vaccinationRecord.delete({ where: { id: existing.id } });

  revalidatePath("/health/vaccinations");
  revalidatePath(`/animals/${existing.animalId}`);
}
