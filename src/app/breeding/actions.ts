"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES, HEALTH_ROLES, type Role } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { addDays, daysBetween } from "@/lib/format";
import {
  optionalDate,
  optionalEnum,
  optionalInt,
  optionalString,
  requireBoolean,
  requireDate,
  requireEnum,
  requireInt,
  requireString,
  assertNotFuture,
} from "@/lib/validation";
import {
  BREEDING_METHOD_LABELS,
  CONFIRMATION_METHOD_LABELS,
  PREGNANCY_STATUS_LABELS,
  SEX_LABELS,
} from "@/lib/labels";
import {
  checkMating,
  findTagCollisions,
  pigletPedigreeFacts,
} from "@/lib/db/breeding";

/**
 * Breeding Server Actions.
 *
 * Every one of these begins with `requireRole`: they are reachable by direct
 * POST, so the nav hiding a button — or the match finder refusing to offer a
 * full sibling — is not a permission or a safety check. The constraint engine
 * runs again inside `createBreedingRecord` for exactly that reason.
 */

/** Recording matings, farrowings and weanings is data entry. */
const BREEDING_WRITE_ROLES = WRITE_ROLES;
/** Pregnancy status and its confirmation are clinical: the vet owns them too. */
const PREGNANCY_ROLES = HEALTH_ROLES;
/** Heat observation is done by whoever is in the shed, vet included. */
const ESTRUS_ROLES: Role[] = ["ADMIN", "MANAGER", "WORKER", "VETERINARIAN"];

const BREEDING_METHODS = Object.keys(BREEDING_METHOD_LABELS) as (keyof typeof BREEDING_METHOD_LABELS)[];
const CONFIRMATION_METHODS = Object.keys(
  CONFIRMATION_METHOD_LABELS
) as (keyof typeof CONFIRMATION_METHOD_LABELS)[];
const SEXES = Object.keys(SEX_LABELS) as (keyof typeof SEX_LABELS)[];
/** FARROWED is reached by recording a farrowing, never by picking it in a list. */
const SETTABLE_PREGNANCY_STATUSES = (
  Object.keys(PREGNANCY_STATUS_LABELS) as (keyof typeof PREGNANCY_STATUS_LABELS)[]
).filter((status) => status !== "FARROWED");

function revalidateBreeding(id?: string): void {
  revalidatePath("/breeding");
  revalidatePath("/breeding/calendar");
  revalidatePath("/breeding/estrus");
  if (id) revalidatePath(`/breeding/${id}`);
}

// ---------------------------------------------------------------------------
// Record a mating
// ---------------------------------------------------------------------------

export async function createBreedingRecord(formData: FormData): Promise<void> {
  const user = await requireRole(BREEDING_WRITE_ROLES);
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const damId = requireString(formData, "damId");
  const sireId = requireString(formData, "sireId");
  const breedingDate = requireDate(formData, "breedingDate");
  const method = requireEnum(formData, "method", BREEDING_METHODS);
  const notes = optionalString(formData, "notes");
  const overrideReason = optionalString(formData, "overrideReason");

  assertNotFuture(breedingDate, "Breeding date");

  const check = await checkMating({ farmId, damId, sireId, breedingDate, settings });

  if (check.blockers.length > 0) {
    throw new Error(
      `This mating cannot be recorded:\n• ${check.blockers.join("\n• ")}`
    );
  }

  // Soft constraints are the farm's decision to make, but the reason it made
  // them is part of the record — a half-sib mating accepted in a pinch has to
  // be explicable a year later, when the litter's F is being questioned.
  if (check.warnings.length > 0 && !overrideReason) {
    throw new Error(
      `This pairing carries warnings, so a reason for proceeding is required:\n• ${check.warnings.join("\n• ")}`
    );
  }

  const record = await prisma.breedingRecord.create({
    data: {
      farmId,
      damId,
      sireId,
      breedingDate,
      method,
      // Stored, not derived: the calendar should keep showing the date that was
      // projected at mating time even if the farm later edits gestationDays.
      expectedFarrowingDate: addDays(breedingDate, settings.gestationDays),
      offspringInbreedingCoefficient: check.offspringInbreedingCoefficient,
      overrideReason: check.warnings.length > 0 ? overrideReason : null,
      notes,
      createdByProfileId: user.id,
    },
    select: { id: true },
  });

  revalidateBreeding(record.id);
  redirect(`/breeding/${record.id}`);
}

// ---------------------------------------------------------------------------
// Pregnancy status
// ---------------------------------------------------------------------------

export async function updatePregnancyStatus(formData: FormData): Promise<void> {
  const user = await requireRole(PREGNANCY_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "breedingRecordId");
  const pregnancyStatus = requireEnum(formData, "pregnancyStatus", SETTABLE_PREGNANCY_STATUSES);
  const confirmationMethod = optionalEnum(formData, "confirmationMethod", CONFIRMATION_METHODS);
  const confirmationDate = optionalDate(formData, "confirmationDate");
  const expectedPigletCount = optionalInt(formData, "expectedPigletCount");
  const abnormalitiesNoted = optionalString(formData, "abnormalitiesNoted");

  const record = await prisma.breedingRecord.findFirst({
    where: { id, farmId },
    select: { id: true, breedingDate: true, pregnancyStatus: true, litter: { select: { id: true } } },
  });

  if (!record) throw new Error("Breeding record not found");
  if (record.litter) {
    throw new Error(
      "This sow has already farrowed — the outcome is recorded on her litter and cannot be reopened here."
    );
  }

  if (confirmationDate) {
    assertNotFuture(confirmationDate, "Confirmation date");
    if (confirmationDate < record.breedingDate) {
      throw new Error("Confirmation date cannot be before the breeding date");
    }
  }
  if (pregnancyStatus === "CONFIRMED" && !confirmationMethod) {
    throw new Error("A confirmed pregnancy needs the method it was confirmed by");
  }
  if (expectedPigletCount !== null && (expectedPigletCount < 0 || expectedPigletCount > 40)) {
    throw new Error("Expected piglet count must be between 0 and 40");
  }

  await prisma.breedingRecord.update({
    where: { id: record.id },
    data: {
      pregnancyStatus,
      confirmationMethod,
      confirmationDate,
      expectedPigletCount,
      abnormalitiesNoted,
    },
  });

  revalidateBreeding(record.id);
}

// ---------------------------------------------------------------------------
// Farrowing → litter registration
// ---------------------------------------------------------------------------

/**
 * The most important write in the app: one transaction that turns a pregnancy
 * into a litter *and* into individual animals.
 *
 * Piglets are `Pig` rows from birth rather than a count that is "promoted"
 * later, because the pedigree has to be continuous — a piglet with no row is a
 * gap in every inbreeding calculation the farm will ever run afterwards. Litter,
 * status change and piglet rows therefore commit together or not at all: a
 * half-written farrowing would leave the herd count wrong in a way nobody would
 * notice until the next stock take.
 */
export async function recordFarrowing(formData: FormData): Promise<void> {
  const user = await requireRole(BREEDING_WRITE_ROLES);
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const breedingRecordId = requireString(formData, "breedingRecordId");
  const farrowingDate = requireDate(formData, "farrowingDate");
  const farrowingDurationMinutes = optionalInt(formData, "farrowingDurationMinutes");
  const bornAlive = requireInt(formData, "bornAlive");
  const stillborn = optionalInt(formData, "stillborn") ?? 0;
  const mummified = optionalInt(formData, "mummified") ?? 0;
  const complications = optionalString(formData, "complications");
  const vetInterventionRequired = requireBoolean(formData, "vetInterventionRequired");
  const colostrumIntakeObserved = requireBoolean(formData, "colostrumIntakeObserved");
  const postFarrowingCheckNotes = optionalString(formData, "postFarrowingCheckNotes");
  const notes = optionalString(formData, "notes");

  assertNotFuture(farrowingDate, "Farrowing date");

  if (bornAlive < 0 || stillborn < 0 || mummified < 0) {
    throw new Error("Piglet counts cannot be negative");
  }
  if (bornAlive + stillborn + mummified > 40) {
    throw new Error("That is more piglets than a sow can farrow — check the counts");
  }

  const record = await prisma.breedingRecord.findFirst({
    where: { id: breedingRecordId, farmId },
    select: {
      id: true,
      breedingDate: true,
      pregnancyStatus: true,
      damId: true,
      sireId: true,
      dam: { select: { tagNumber: true, breed: true, penId: true } },
      sire: { select: { breed: true } },
      litter: { select: { id: true } },
    },
  });

  if (!record) throw new Error("Breeding record not found");
  if (record.litter) throw new Error("A farrowing has already been recorded for this mating");
  if (["NOT_PREGNANT", "FAILED", "ABORTED"].includes(record.pregnancyStatus)) {
    throw new Error(
      `This mating is recorded as ${PREGNANCY_STATUS_LABELS[record.pregnancyStatus].toLowerCase()} — reopen it before recording a farrowing.`
    );
  }
  if (farrowingDate < record.breedingDate) {
    throw new Error("Farrowing date cannot be before the breeding date");
  }

  // §8.2 "cannot record a litter if the farrowing date has not been reached",
  // read against the real 114-day gestation rather than the spec's 21 days.
  const gestationLength = daysBetween(record.breedingDate, farrowingDate);
  if (gestationLength < settings.gestationDays / 2) {
    throw new Error(
      `Only ${gestationLength} days after mating — too early to be a farrowing (gestation is ${settings.gestationDays} days). Record an abortion instead.`
    );
  }

  // --- Piglets ---------------------------------------------------------
  const tagNumbers = formData.getAll("pigletTag").map((value) => String(value).trim());
  const sexes = formData.getAll("pigletSex").map((value) => String(value));
  const weights = formData.getAll("pigletWeight").map((value) => String(value).trim());
  const markings = formData.getAll("pigletMarkings").map((value) => String(value).trim());

  if (tagNumbers.length !== bornAlive) {
    throw new Error(
      `${bornAlive} piglets born alive, but ${tagNumbers.length} piglet rows were submitted. Each live piglet is registered as an animal.`
    );
  }

  const blankTag = tagNumbers.findIndex((tag) => tag.length === 0);
  if (blankTag >= 0) throw new Error(`Piglet ${blankTag + 1} needs a tag number`);

  const duplicatesInForm = tagNumbers.filter((tag, i) => tagNumbers.indexOf(tag) !== i);
  if (duplicatesInForm.length > 0) {
    throw new Error(`Duplicate tag numbers in this litter: ${[...new Set(duplicatesInForm)].join(", ")}`);
  }

  const collisions = await findTagCollisions(farmId, tagNumbers);
  if (collisions.length > 0) {
    throw new Error(
      `These tag numbers are already used on this farm: ${collisions.join(", ")}. Change them and submit again.`
    );
  }

  const pedigree = await pigletPedigreeFacts(
    farmId,
    record.damId,
    record.sireId,
    record.dam.breed,
    record.sire.breed
  );

  const piglets = tagNumbers.map((tagNumber, i) => {
    // Matched against the enum list rather than compared inline. Narrowing a
    // plain `string` with `!==` against literals leaves it a `string`, so the
    // value would reach Prisma untyped and the piglet rows would not compile
    // against `Sex` — `find` yields the literal union instead.
    const sex = SEXES.find((value) => value === sexes[i]);
    if (!sex) {
      throw new Error(`Piglet ${tagNumber} needs a sex of ${SEXES.join(" or ")}`);
    }
    const weight = weights[i] ? Number.parseFloat(weights[i]) : null;
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 5)) {
      throw new Error(`Birth weight for piglet ${tagNumber} must be between 0 and 5 kg`);
    }

    return {
      farmId,
      tagNumber,
      breed: pedigree.breed,
      dateOfBirth: farrowingDate,
      sex,
      motherId: record.damId,
      fatherId: record.sireId,
      generation: pedigree.generation,
      inbreedingCoefficient: pedigree.inbreedingCoefficient,
      birthWeightKg: weight,
      currentWeightKg: weight,
      markings: markings[i] ? markings[i] : null,
      acquisitionType: "BORN_ON_FARM" as const,
      dateAcquired: farrowingDate,
      // Piglets stay with the sow in the farrowing pen; recording that at birth
      // keeps pen occupancy right without a second trip through the pen screen.
      penId: record.dam.penId,
      dateMovedIn: record.dam.penId ? farrowingDate : null,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.litter.create({
      data: {
        breedingRecordId: record.id,
        farrowingDate,
        farrowingDurationMinutes,
        bornAlive,
        stillborn,
        mummified,
        complications,
        vetInterventionRequired,
        colostrumIntakeObserved,
        postFarrowingCheckNotes,
        notes,
        createdByProfileId: user.id,
        piglets: { create: piglets },
      },
      select: { id: true },
    });

    await tx.breedingRecord.update({
      where: { id: record.id },
      data: { pregnancyStatus: "FARROWED" },
    });
  });

  revalidateBreeding(record.id);
  revalidatePath("/animals");
}

// ---------------------------------------------------------------------------
// Weaning
// ---------------------------------------------------------------------------

export async function recordWeaning(formData: FormData): Promise<void> {
  const user = await requireRole(BREEDING_WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const litterId = requireString(formData, "litterId");
  const weaningDate = requireDate(formData, "weaningDate");
  const weanedCount = requireInt(formData, "weanedCount");

  assertNotFuture(weaningDate, "Weaning date");

  const litter = await prisma.litter.findFirst({
    where: { id: litterId, breedingRecord: { farmId } },
    select: {
      id: true,
      farrowingDate: true,
      bornAlive: true,
      breedingRecord: { select: { id: true } },
    },
  });

  if (!litter) throw new Error("Litter not found");
  if (weaningDate < litter.farrowingDate) {
    throw new Error("Weaning date cannot be before the farrowing date");
  }
  if (weanedCount < 0 || weanedCount > litter.bornAlive) {
    throw new Error(
      `Weaned count must be between 0 and the ${litter.bornAlive} piglets born alive`
    );
  }

  await prisma.litter.update({
    where: { id: litter.id },
    data: { weaningDate, weanedCount },
  });

  revalidateBreeding(litter.breedingRecord.id);
}

// ---------------------------------------------------------------------------
// Estrus observation
// ---------------------------------------------------------------------------

export async function recordEstrusObservation(formData: FormData): Promise<void> {
  const user = await requireRole(ESTRUS_ROLES);
  const farmId = await getActiveFarmId(user);

  const sowId = requireString(formData, "sowId");
  const observedAt = requireDate(formData, "observedAt");
  const durationHours = optionalInt(formData, "durationHours");
  const notes = optionalString(formData, "notes");

  assertNotFuture(observedAt, "Observation date");

  const sow = await prisma.pig.findFirst({
    where: { id: sowId, farmId },
    select: { id: true, sex: true, status: true, dateOfBirth: true },
  });

  if (!sow) throw new Error("Animal not found on this farm");
  if (sow.sex !== "FEMALE") throw new Error("Heat is observed in females only");
  if (sow.status !== "ACTIVE") throw new Error("That animal is no longer active on the farm");
  if (observedAt < sow.dateOfBirth) {
    throw new Error("Observation date cannot be before the animal was born");
  }
  if (durationHours !== null && (durationHours < 0 || durationHours > 120)) {
    throw new Error("Estrus duration must be between 0 and 120 hours");
  }

  await prisma.estrusRecord.create({
    data: {
      sowId,
      observedAt,
      signRestlessness: requireBoolean(formData, "signRestlessness"),
      signSwollenVulva: requireBoolean(formData, "signSwollenVulva"),
      signDischarge: requireBoolean(formData, "signDischarge"),
      signReceptive: requireBoolean(formData, "signReceptive"),
      durationHours,
      wasBred: requireBoolean(formData, "wasBred"),
      notes,
      createdByProfileId: user.id,
    },
  });

  revalidatePath("/breeding/estrus");
  revalidatePath("/breeding/calendar");
}

// ---------------------------------------------------------------------------
// Notes on an existing record
// ---------------------------------------------------------------------------

export async function updateBreedingNotes(formData: FormData): Promise<void> {
  const user = await requireRole(BREEDING_WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "breedingRecordId");
  const notes = optionalString(formData, "notes");

  const record = await prisma.breedingRecord.findFirst({
    where: { id, farmId },
    select: { id: true },
  });
  if (!record) throw new Error("Breeding record not found");

  await prisma.breedingRecord.update({ where: { id: record.id }, data: { notes } });
  revalidateBreeding(record.id);
}
