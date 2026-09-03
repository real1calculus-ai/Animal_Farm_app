"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import type { AcquisitionType, ExitReason, PigStatus, Sex } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  ACQUISITION_TYPE_LABELS,
  EXIT_REASON_LABELS,
  PIG_STATUS_LABELS,
  SEX_LABELS,
} from "@/lib/labels";
import {
  assertNotFuture,
  optionalCents,
  optionalDate,
  optionalEnum,
  optionalFloat,
  optionalInt,
  optionalString,
  requireDate,
  requireEnum,
  requireFloat,
  requireString,
} from "@/lib/validation";
import { loadPedigreeIndex } from "@/lib/breeding/pedigree";
import { recomputePedigreeMetrics, validateParentage } from "@/lib/db/animals";
import type { AnimalActionState } from "@/components/animals/form-state";

/**
 * Every action here starts with `requireRole(WRITE_ROLES)` — ADMIN, MANAGER
 * and WORKER. A VETERINARIAN reads the herd but does not edit it, and since a
 * Server Action is reachable by direct POST, hiding the button in the UI is
 * not the check that enforces that.
 */

const SEXES = Object.keys(SEX_LABELS) as Sex[];
const STATUSES = Object.keys(PIG_STATUS_LABELS) as PigStatus[];
const ACQUISITION_TYPES = Object.keys(ACQUISITION_TYPE_LABELS) as AcquisitionType[];
const EXIT_REASONS = Object.keys(EXIT_REASON_LABELS) as ExitReason[];

const MIN_BODY_CONDITION_SCORE = 1;
const MAX_BODY_CONDITION_SCORE = 5;

/** Turns a thrown validation error into the message the form will display. */
function messageFrom(error: unknown): string {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("tagNumber")
  ) {
    // The `@@unique([farmId, tagNumber])` collision. Left as a raw Prisma
    // error this reads as "Unique constraint failed on the fields:
    // (`farmId`,`tagNumber`)", which tells the person in the barn nothing.
    return "That tag number is already used by another animal on this farm. Tag numbers must be unique.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong saving this animal.";
}

type AnimalFields = ReturnType<typeof readAnimalFields>;

function readAnimalFields(formData: FormData) {
  const dateOfBirth = requireDate(formData, "dateOfBirth");
  const dateAcquired = requireDate(formData, "dateAcquired");
  const dateExit = optionalDate(formData, "dateExit");

  // §8.1 / §8.3: no date on an animal record may be in the future.
  assertNotFuture(dateOfBirth, "Date of birth");
  assertNotFuture(dateAcquired, "Date acquired");
  if (dateExit) assertNotFuture(dateExit, "Exit date");

  if (dateAcquired.getTime() < dateOfBirth.getTime()) {
    throw new Error("Date acquired cannot be before the animal was born.");
  }
  if (dateExit && dateExit.getTime() < dateOfBirth.getTime()) {
    throw new Error("Exit date cannot be before the animal was born.");
  }

  const bodyConditionScore = optionalInt(formData, "bodyConditionScore");
  if (
    bodyConditionScore !== null &&
    (bodyConditionScore < MIN_BODY_CONDITION_SCORE ||
      bodyConditionScore > MAX_BODY_CONDITION_SCORE)
  ) {
    throw new Error(
      `Body condition score must be between ${MIN_BODY_CONDITION_SCORE} and ${MAX_BODY_CONDITION_SCORE}.`
    );
  }

  const currentWeightKg = optionalFloat(formData, "currentWeightKg");
  if (currentWeightKg !== null && currentWeightKg <= 0) {
    throw new Error("Weight must be greater than zero.");
  }

  const birthWeightKg = optionalFloat(formData, "birthWeightKg");
  if (birthWeightKg !== null && birthWeightKg <= 0) {
    throw new Error("Birth weight must be greater than zero.");
  }

  return {
    tagNumber: requireString(formData, "tagNumber"),
    name: optionalString(formData, "name"),
    breed: requireString(formData, "breed"),
    dateOfBirth,
    sex: requireEnum(formData, "sex", SEXES),
    status: requireEnum(formData, "status", STATUSES),
    motherId: optionalString(formData, "motherId"),
    fatherId: optionalString(formData, "fatherId"),
    penId: optionalString(formData, "penId"),
    birthWeightKg,
    markings: optionalString(formData, "markings"),
    currentWeightKg,
    bodyConditionScore,
    congenitalDefects: optionalString(formData, "congenitalDefects"),
    phenotypeNotes: optionalString(formData, "phenotypeNotes"),
    acquisitionType: requireEnum(formData, "acquisitionType", ACQUISITION_TYPES),
    dateAcquired,
    acquisitionCostCents: optionalCents(formData, "acquisitionCost"),
    dateExit,
    exitReason: optionalEnum(formData, "exitReason", EXIT_REASONS),
    exitNotes: optionalString(formData, "exitNotes"),
  };
}

/** Confirms a referenced pen/parent really belongs to this farm before it is written. */
async function assertPenBelongsToFarm(farmId: string, penId: string | null): Promise<void> {
  if (!penId) return;
  const pen = await prisma.pen.findFirst({ where: { id: penId, farmId }, select: { id: true } });
  if (!pen) throw new Error("The selected pen does not belong to this farm.");
}

function toPigData(fields: AnimalFields) {
  return {
    tagNumber: fields.tagNumber,
    name: fields.name,
    breed: fields.breed,
    dateOfBirth: fields.dateOfBirth,
    sex: fields.sex,
    status: fields.status,
    motherId: fields.motherId,
    fatherId: fields.fatherId,
    penId: fields.penId,
    birthWeightKg: fields.birthWeightKg,
    markings: fields.markings,
    currentWeightKg: fields.currentWeightKg,
    bodyConditionScore: fields.bodyConditionScore,
    congenitalDefects: fields.congenitalDefects,
    phenotypeNotes: fields.phenotypeNotes,
    acquisitionType: fields.acquisitionType,
    dateAcquired: fields.dateAcquired,
    acquisitionCostCents: fields.acquisitionCostCents,
    dateExit: fields.dateExit,
    exitReason: fields.exitReason,
    exitNotes: fields.exitNotes,
  };
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export async function createAnimal(
  _prevState: AnimalActionState,
  formData: FormData
): Promise<AnimalActionState> {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  let createdId: string;

  try {
    const fields = readAnimalFields(formData);
    await assertPenBelongsToFarm(farmId, fields.penId);

    const index = await loadPedigreeIndex(farmId);
    const parentageError = validateParentage({
      index,
      childId: null,
      dateOfBirth: fields.dateOfBirth,
      motherId: fields.motherId,
      fatherId: fields.fatherId,
    });
    if (parentageError) return { error: parentageError };

    createdId = await prisma.$transaction(async (tx) => {
      const pig = await tx.pig.create({
        data: {
          farmId,
          ...toPigData(fields),
          // An animal entered straight into a pen has occupied it since it
          // arrived; there is no PenMovement for that because no move happened.
          dateMovedIn: fields.penId ? fields.dateAcquired : null,
        },
        select: { id: true },
      });

      await recomputePedigreeMetrics(farmId, [pig.id], tx);
      return pig.id;
    });
  } catch (error) {
    return { error: messageFrom(error) };
  }

  revalidatePath("/animals");
  redirect(`/animals/${createdId}`);
}

export async function updateAnimal(
  _prevState: AnimalActionState,
  formData: FormData
): Promise<AnimalActionState> {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");

  try {
    const existing = await prisma.pig.findFirst({
      where: { id, farmId },
      select: { id: true, motherId: true, fatherId: true, dateOfBirth: true, penId: true },
    });
    if (!existing) return { error: "That animal is not on this farm." };

    const fields = readAnimalFields(formData);
    await assertPenBelongsToFarm(farmId, fields.penId);

    const index = await loadPedigreeIndex(farmId);
    const parentageError = validateParentage({
      index,
      childId: id,
      dateOfBirth: fields.dateOfBirth,
      motherId: fields.motherId,
      fatherId: fields.fatherId,
    });
    if (parentageError) return { error: parentageError };

    // A changed birth date matters as much as a changed parent: the kinship
    // recursion expands the younger of two animals, so moving a date moves the
    // whole calculation.
    const ancestryChanged =
      existing.motherId !== fields.motherId ||
      existing.fatherId !== fields.fatherId ||
      existing.dateOfBirth.getTime() !== fields.dateOfBirth.getTime();

    await prisma.$transaction(async (tx) => {
      await tx.pig.update({
        where: { id },
        data: {
          ...toPigData(fields),
          // Re-assigning a pen from the edit form is a correction, not a move,
          // so it does not write a PenMovement — /animals/[id] has the move
          // form for that, and inventing history here would corrupt the
          // occupancy trail biosecurity tracing depends on.
          dateMovedIn: fields.penId && fields.penId !== existing.penId ? new Date() : undefined,
        },
      });

      if (ancestryChanged) {
        await recomputePedigreeMetrics(farmId, [id], tx);
      }
    });
  } catch (error) {
    return { error: messageFrom(error) };
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${id}`);
  redirect(`/animals/${id}`);
}

// ---------------------------------------------------------------------------
// Weight logging
// ---------------------------------------------------------------------------

export async function logWeight(
  _prevState: AnimalActionState,
  formData: FormData
): Promise<AnimalActionState> {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const pigId = requireString(formData, "pigId");

  try {
    const pig = await prisma.pig.findFirst({
      where: { id: pigId, farmId },
      select: { id: true, dateOfBirth: true },
    });
    if (!pig) return { error: "That animal is not on this farm." };

    const recordedAt = requireDate(formData, "recordedAt");
    assertNotFuture(recordedAt, "Weigh-in date");
    if (recordedAt.getTime() < pig.dateOfBirth.getTime()) {
      return { error: "A weigh-in cannot be dated before the animal was born." };
    }

    const weightKg = requireFloat(formData, "weightKg");
    if (weightKg <= 0) return { error: "Weight must be greater than zero." };

    const bodyConditionScore = optionalInt(formData, "bodyConditionScore");
    if (
      bodyConditionScore !== null &&
      (bodyConditionScore < MIN_BODY_CONDITION_SCORE ||
        bodyConditionScore > MAX_BODY_CONDITION_SCORE)
    ) {
      return {
        error: `Body condition score must be between ${MIN_BODY_CONDITION_SCORE} and ${MAX_BODY_CONDITION_SCORE}.`,
      };
    }

    const notes = optionalString(formData, "notes");

    // One transaction: the WeightRecord row and the denormalised
    // `Pig.currentWeightKg` are the same fact stored twice, and a partial
    // write would leave the herd list quoting a weight that no weigh-in
    // supports.
    await prisma.$transaction(async (tx) => {
      await tx.weightRecord.create({
        data: {
          pigId,
          recordedAt,
          weightKg,
          bodyConditionScore,
          notes,
          recordedByProfileId: user.id,
        },
      });

      // `currentWeightKg` means "the most recent weigh-in", so a back-dated
      // correction is stored but does not overwrite a newer reading.
      const latest = await tx.weightRecord.findFirst({
        where: { pigId },
        orderBy: { recordedAt: "desc" },
        select: { recordedAt: true, weightKg: true, bodyConditionScore: true },
      });

      if (latest) {
        await tx.pig.update({
          where: { id: pigId },
          data: {
            currentWeightKg: latest.weightKg,
            ...(latest.bodyConditionScore !== null
              ? { bodyConditionScore: latest.bodyConditionScore }
              : {}),
          },
        });
      }
    });
  } catch (error) {
    return { error: messageFrom(error) };
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${pigId}`);
  return { error: null, success: "Weight recorded." };
}

// ---------------------------------------------------------------------------
// Pen moves
// ---------------------------------------------------------------------------

export async function movePen(
  _prevState: AnimalActionState,
  formData: FormData
): Promise<AnimalActionState> {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const pigId = requireString(formData, "pigId");

  try {
    const pig = await prisma.pig.findFirst({
      where: { id: pigId, farmId },
      select: {
        id: true,
        status: true,
        dateOfBirth: true,
        penId: true,
        pen: { select: { name: true } },
      },
    });
    if (!pig) return { error: "That animal is not on this farm." };

    // §8.1: deceased animals cannot be moved between pens.
    if (pig.status === "DECEASED") {
      return { error: "This animal is recorded as deceased and cannot be moved to a pen." };
    }
    if (pig.status === "SOLD" || pig.status === "CULLED") {
      return {
        error: `This animal has left the herd (${pig.status === "SOLD" ? "sold" : "culled"}) and cannot be moved. Change its status first if that was recorded in error.`,
      };
    }

    const movedAt = requireDate(formData, "movedAt");
    assertNotFuture(movedAt, "Move date");
    if (movedAt.getTime() < pig.dateOfBirth.getTime()) {
      return { error: "A pen move cannot be dated before the animal was born." };
    }

    const toPenId = optionalString(formData, "toPenId");
    const reason = optionalString(formData, "reason");

    if (toPenId === pig.penId) {
      return { error: "That is the pen this animal is already in." };
    }

    await prisma.$transaction(async (tx) => {
      let toPenName: string | null = null;

      if (toPenId) {
        const pen = await tx.pen.findFirst({
          where: { id: toPenId, farmId },
          select: {
            name: true,
            capacity: true,
            _count: { select: { pigs: { where: { status: "ACTIVE" } } } },
          },
        });
        if (!pen) throw new Error("The selected pen does not belong to this farm.");

        // Counted inside the transaction so two people moving animals at once
        // cannot both read "one space left" and both take it.
        if (pen._count.pigs >= pen.capacity) {
          throw new Error(
            `${pen.name} is at capacity (${pen._count.pigs} of ${pen.capacity}). Move an animal out first, or raise the pen's capacity in Pens.`
          );
        }

        toPenName = pen.name;
      }

      await tx.penMovement.create({
        data: {
          pigId,
          penId: toPenId,
          // Denormalised names, so the movement history still reads correctly
          // after a pen is renamed or removed.
          fromPenName: pig.pen?.name ?? null,
          toPenName,
          movedAt,
          reason,
          movedByProfileId: user.id,
        },
      });

      await tx.pig.update({
        where: { id: pigId },
        data: { penId: toPenId, dateMovedIn: toPenId ? movedAt : null },
      });
    });
  } catch (error) {
    return { error: messageFrom(error) };
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${pigId}`);
  revalidatePath("/pens");
  return { error: null, success: "Pen move recorded." };
}
