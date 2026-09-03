"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ExitReason,
  HealthCategory,
  HealthOutcome,
  HealthRecordType,
  MedicationRoute,
  Prisma,
  Severity,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HEALTH_ROLES, requireRole, type Role } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  HEALTH_CATEGORY_LABELS,
  HEALTH_OUTCOME_LABELS,
  HEALTH_RECORD_TYPE_LABELS,
  MEDICATION_ROUTE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/labels";
import {
  assertNotFuture,
  optionalCents,
  optionalDate,
  optionalInt,
  optionalString,
  requireCents,
  requireDate,
  requireEnum,
  requireString,
} from "@/lib/validation";
import { normaliseDiagnosis } from "@/lib/health/conditions";

/**
 * Server Actions for health records.
 *
 * A WORKER may record what they saw — that is the whole point of putting the
 * app on a phone in the barn — but may not go back and rewrite or delete a
 * clinical record afterwards. Correcting or deleting one is a vet/management
 * action, so the two role sets differ.
 */
const OBSERVE_ROLES: Role[] = ["ADMIN", "MANAGER", "VETERINARIAN", "WORKER"];

const RECORD_TYPES = Object.keys(HEALTH_RECORD_TYPE_LABELS) as HealthRecordType[];
const CATEGORIES = Object.keys(HEALTH_CATEGORY_LABELS) as HealthCategory[];
const SEVERITIES = Object.keys(SEVERITY_LABELS) as Severity[];
const OUTCOMES = Object.keys(HEALTH_OUTCOME_LABELS) as HealthOutcome[];
const ROUTES = Object.keys(MEDICATION_ROUTE_LABELS) as MedicationRoute[];
/** A death recorded here is either a death or a welfare cull — not a sale. */
const DEATH_EXIT_REASONS: ExitReason[] = ["DIED", "CULLED"];

type MedicationInput = {
  drugName: string;
  dosage: string | null;
  route: MedicationRoute;
  startDate: Date;
  durationDays: number | null;
  completedDate: Date | null;
  withdrawalDays: number;
  isAntibiotic: boolean;
  costCents: number;
  notes: string | null;
};

/**
 * The medications sub-form posts parallel arrays — `med-drugName` repeated
 * once per row — which is what a plain HTML form with repeated names produces.
 * Rows whose drug name is blank are dropped, so an empty template row left on
 * screen does not write a nameless medication.
 */
function parseMedications(formData: FormData): MedicationInput[] {
  const drugNames = formData.getAll("med-drugName");
  const dosages = formData.getAll("med-dosage");
  const routes = formData.getAll("med-route");
  const startDates = formData.getAll("med-startDate");
  const durations = formData.getAll("med-durationDays");
  const completed = formData.getAll("med-completedDate");
  const withdrawals = formData.getAll("med-withdrawalDays");
  const antibiotics = formData.getAll("med-isAntibiotic");
  const costs = formData.getAll("med-costCents");
  const notes = formData.getAll("med-notes");

  const medications: MedicationInput[] = [];

  for (let index = 0; index < drugNames.length; index += 1) {
    const drugName = text(drugNames[index]);
    if (!drugName) continue;

    const startRaw = text(startDates[index]);
    if (!startRaw) throw new Error(`Medication "${drugName}" needs a start date`);
    const startDate = new Date(startRaw);
    if (Number.isNaN(startDate.getTime())) {
      throw new Error(`Medication "${drugName}" has an invalid start date`);
    }

    const completedRaw = text(completed[index]);
    const completedDate = completedRaw ? new Date(completedRaw) : null;
    if (completedDate && Number.isNaN(completedDate.getTime())) {
      throw new Error(`Medication "${drugName}" has an invalid completion date`);
    }
    if (completedDate && completedDate < startDate) {
      throw new Error(`Medication "${drugName}" cannot complete before it started`);
    }

    const routeValue = text(routes[index]) || "ORAL";
    if (!ROUTES.includes(routeValue as MedicationRoute)) {
      throw new Error(`Medication "${drugName}" has an unknown route`);
    }

    const withdrawalDays = numberOr(withdrawals[index], 0);
    if (withdrawalDays < 0) {
      throw new Error(`Medication "${drugName}" cannot have a negative withdrawal period`);
    }

    const durationDays = text(durations[index]) ? numberOr(durations[index], 0) : null;
    if (durationDays !== null && durationDays < 1) {
      throw new Error(`Medication "${drugName}" must last at least one day`);
    }

    medications.push({
      drugName,
      dosage: text(dosages[index]) || null,
      route: routeValue as MedicationRoute,
      startDate,
      durationDays,
      completedDate,
      withdrawalDays,
      // Unchecked checkboxes post nothing, so a positional array would drift.
      // The form posts an explicit "true"/"false" hidden value per row.
      isAntibiotic: text(antibiotics[index]) === "true",
      costCents: centsOr(costs[index]),
      notes: text(notes[index]) || null,
    });
  }

  return medications;
}

function text(value: FormDataEntryValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOr(value: FormDataEntryValue | undefined, fallback: number): number {
  const raw = text(value);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`"${raw}" is not a whole number`);
  return parsed;
}

function centsOr(value: FormDataEntryValue | undefined): number {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Math.round(Number.parseFloat(raw.replace(/[^0-9.-]/g, "")) * 100);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`"${raw}" is not a valid amount`);
  }
  return parsed;
}

/**
 * §8.3: a health record cannot pre-date the animal's birth, and cannot be in
 * the future. Both are cheap to check and both are the kind of typo (a
 * mis-keyed year) that quietly corrupts every age-based report downstream.
 */
function assertRecordDate(recordedAt: Date, dateOfBirth: Date): void {
  assertNotFuture(recordedAt, "Record date");
  if (recordedAt < startOfDay(dateOfBirth)) {
    throw new Error("Record date cannot be before the animal's date of birth");
  }
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export async function createHealthRecord(formData: FormData): Promise<void> {
  const user = await requireRole(OBSERVE_ROLES);
  const farmId = await getActiveFarmId(user);

  const pigId = requireString(formData, "pigId");
  const recordedAt = requireDate(formData, "recordedAt");
  const outcome = requireEnum(formData, "outcome", OUTCOMES);

  const pig = await prisma.pig.findFirst({
    where: { id: pigId, farmId },
    select: { id: true, dateOfBirth: true, status: true, tagNumber: true },
  });
  if (!pig) throw new Error("Animal not found on this farm");

  assertRecordDate(recordedAt, pig.dateOfBirth);

  const medications = parseMedications(formData);
  for (const medication of medications) {
    if (medication.startDate < startOfDay(pig.dateOfBirth)) {
      throw new Error(`Medication "${medication.drugName}" starts before the animal was born`);
    }
  }

  const data: Prisma.HealthRecordUncheckedCreateInput = {
    farmId,
    pigId: pig.id,
    recordedAt,
    recordType: requireEnum(formData, "recordType", RECORD_TYPES),
    category: requireEnum(formData, "category", CATEGORIES),
    severity: requireEnum(formData, "severity", SEVERITIES),
    // Normalised so the outbreak detector clusters spellings together.
    diagnosis: normaliseDiagnosis(requireString(formData, "diagnosis")),
    treatment: optionalString(formData, "treatment"),
    vetNotes: optionalString(formData, "vetNotes"),
    costCents: optionalCents(formData, "costCents") ?? 0,
    outcome,
    resolvedAt: outcome === "ONGOING" ? null : (optionalDate(formData, "resolvedAt") ?? recordedAt),
    createdByProfileId: user.id,
  };

  const markDeceased = outcome === "DEATH" && formData.get("markDeceased") === "on";
  const exitReason = markDeceased
    ? (requireEnum(formData, "exitReason", DEATH_EXIT_REASONS) as ExitReason)
    : null;

  const recordId = await prisma.$transaction(async (tx) => {
    const record = await tx.healthRecord.create({
      data: {
        ...data,
        medications: medications.length > 0 ? { create: medications } : undefined,
      },
      select: { id: true },
    });

    // An animal left ACTIVE after it has died corrupts every headcount, every
    // morbidity denominator and every breeding list, so the status change goes
    // in the same transaction as the record that reports the death — never as
    // a second write that can fail on its own.
    if (markDeceased && exitReason) {
      await tx.pig.update({
        where: { id: pig.id },
        data: {
          status: "DECEASED",
          dateExit: recordedAt,
          exitReason,
          exitNotes: optionalString(formData, "exitNotes") ?? data.diagnosis,
          penId: null,
        },
      });
    }

    return record.id;
  });

  revalidatePath("/health");
  revalidatePath("/health/monitoring");
  revalidatePath(`/animals/${pig.id}`);
  if (markDeceased) revalidatePath("/animals");

  redirect(`/health/${recordId}`);
}

export async function updateHealthRecord(formData: FormData): Promise<void> {
  const user = await requireRole(HEALTH_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.healthRecord.findFirst({
    where: { id, farmId },
    select: { id: true, pigId: true, pig: { select: { dateOfBirth: true } } },
  });
  if (!existing) throw new Error("Health record not found on this farm");

  const recordedAt = requireDate(formData, "recordedAt");
  assertRecordDate(recordedAt, existing.pig.dateOfBirth);

  const outcome = requireEnum(formData, "outcome", OUTCOMES);
  const resolvedAt = optionalDate(formData, "resolvedAt");

  await prisma.healthRecord.update({
    where: { id: existing.id },
    data: {
      recordedAt,
      recordType: requireEnum(formData, "recordType", RECORD_TYPES),
      category: requireEnum(formData, "category", CATEGORIES),
      severity: requireEnum(formData, "severity", SEVERITIES),
      diagnosis: normaliseDiagnosis(requireString(formData, "diagnosis")),
      treatment: optionalString(formData, "treatment"),
      vetNotes: optionalString(formData, "vetNotes"),
      costCents: optionalCents(formData, "costCents") ?? 0,
      outcome,
      resolvedAt: outcome === "ONGOING" ? null : (resolvedAt ?? new Date()),
    },
  });

  revalidatePath("/health");
  revalidatePath(`/health/${existing.id}`);
  revalidatePath("/health/monitoring");
  revalidatePath(`/animals/${existing.pigId}`);
}

export async function deleteHealthRecord(formData: FormData): Promise<void> {
  const user = await requireRole(HEALTH_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.healthRecord.findFirst({
    where: { id, farmId },
    select: { id: true, pigId: true },
  });
  if (!existing) throw new Error("Health record not found on this farm");

  // Medications cascade with the record.
  await prisma.healthRecord.delete({ where: { id: existing.id } });

  revalidatePath("/health");
  revalidatePath("/health/monitoring");
  revalidatePath(`/animals/${existing.pigId}`);
  redirect("/health");
}

/** One-tap "this animal has recovered" from the list screen. */
export async function resolveHealthRecord(formData: FormData): Promise<void> {
  const user = await requireRole(OBSERVE_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const existing = await prisma.healthRecord.findFirst({
    where: { id, farmId },
    select: { id: true, pigId: true },
  });
  if (!existing) throw new Error("Health record not found on this farm");

  await prisma.healthRecord.update({
    where: { id: existing.id },
    data: { outcome: "RECOVERED", resolvedAt: new Date() },
  });

  revalidatePath("/health");
  revalidatePath(`/health/${existing.id}`);
  revalidatePath("/health/monitoring");
}

// ---------------------------------------------------------------------------
// Medications on an existing record
// ---------------------------------------------------------------------------

async function requireRecordOnFarm(id: string, farmId: string) {
  const record = await prisma.healthRecord.findFirst({
    where: { id, farmId },
    select: { id: true, pigId: true, pig: { select: { dateOfBirth: true } } },
  });
  if (!record) throw new Error("Health record not found on this farm");
  return record;
}

export async function addMedication(formData: FormData): Promise<void> {
  const user = await requireRole(OBSERVE_ROLES);
  const farmId = await getActiveFarmId(user);

  const healthRecordId = requireString(formData, "healthRecordId");
  const record = await requireRecordOnFarm(healthRecordId, farmId);

  const startDate = requireDate(formData, "startDate");
  if (startDate < startOfDay(record.pig.dateOfBirth)) {
    throw new Error("Medication cannot start before the animal was born");
  }
  const completedDate = optionalDate(formData, "completedDate");
  if (completedDate && completedDate < startDate) {
    throw new Error("Medication cannot complete before it started");
  }

  const withdrawalDays = optionalInt(formData, "withdrawalDays") ?? 0;
  if (withdrawalDays < 0) throw new Error("Withdrawal period cannot be negative");

  await prisma.medication.create({
    data: {
      healthRecordId: record.id,
      drugName: requireString(formData, "drugName"),
      dosage: optionalString(formData, "dosage"),
      route: requireEnum(formData, "route", ROUTES),
      startDate,
      durationDays: optionalInt(formData, "durationDays"),
      completedDate,
      withdrawalDays,
      isAntibiotic: formData.get("isAntibiotic") === "on",
      costCents: optionalCents(formData, "costCents") ?? 0,
      notes: optionalString(formData, "notes"),
    },
  });

  revalidatePath("/health");
  revalidatePath(`/health/${record.id}`);
  revalidatePath(`/animals/${record.pigId}`);
}

export async function updateMedication(formData: FormData): Promise<void> {
  const user = await requireRole(HEALTH_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const medication = await prisma.medication.findFirst({
    where: { id, healthRecord: { farmId } },
    select: { id: true, healthRecordId: true, healthRecord: { select: { pigId: true } } },
  });
  if (!medication) throw new Error("Medication not found on this farm");

  const startDate = requireDate(formData, "startDate");
  const completedDate = optionalDate(formData, "completedDate");
  if (completedDate && completedDate < startDate) {
    throw new Error("Medication cannot complete before it started");
  }

  const withdrawalDays = optionalInt(formData, "withdrawalDays") ?? 0;
  if (withdrawalDays < 0) throw new Error("Withdrawal period cannot be negative");

  await prisma.medication.update({
    where: { id: medication.id },
    data: {
      drugName: requireString(formData, "drugName"),
      dosage: optionalString(formData, "dosage"),
      route: requireEnum(formData, "route", ROUTES),
      startDate,
      durationDays: optionalInt(formData, "durationDays"),
      completedDate,
      withdrawalDays,
      isAntibiotic: formData.get("isAntibiotic") === "on",
      costCents: optionalCents(formData, "costCents") ?? 0,
      notes: optionalString(formData, "notes"),
    },
  });

  revalidatePath("/health");
  revalidatePath(`/health/${medication.healthRecordId}`);
  revalidatePath(`/animals/${medication.healthRecord.pigId}`);
}

/**
 * Marks the course finished today. The withdrawal clock runs from the last
 * dose, so recording completion is what makes the clearance date real rather
 * than projected from the planned duration.
 */
export async function completeMedication(formData: FormData): Promise<void> {
  const user = await requireRole(OBSERVE_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const medication = await prisma.medication.findFirst({
    where: { id, healthRecord: { farmId } },
    select: { id: true, healthRecordId: true },
  });
  if (!medication) throw new Error("Medication not found on this farm");

  await prisma.medication.update({
    where: { id: medication.id },
    data: { completedDate: new Date() },
  });

  revalidatePath("/health");
  revalidatePath(`/health/${medication.healthRecordId}`);
}

export async function deleteMedication(formData: FormData): Promise<void> {
  const user = await requireRole(HEALTH_ROLES);
  const farmId = await getActiveFarmId(user);

  const id = requireString(formData, "id");
  const medication = await prisma.medication.findFirst({
    where: { id, healthRecord: { farmId } },
    select: { id: true, healthRecordId: true },
  });
  if (!medication) throw new Error("Medication not found on this farm");

  await prisma.medication.delete({ where: { id: medication.id } });

  revalidatePath("/health");
  revalidatePath(`/health/${medication.healthRecordId}`);
}

/** Kept for the cost field on the create form, which uses `requireCents`. */
export const __cents = requireCents;
