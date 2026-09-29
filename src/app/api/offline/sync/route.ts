import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, OBSERVE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { normaliseDiagnosis } from "@/lib/health/conditions";
import {
  HEALTH_CATEGORY_LABELS,
  HEALTH_OUTCOME_LABELS,
  HEALTH_RECORD_TYPE_LABELS,
  MEDICATION_ROUTE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/labels";
import type {
  HealthCategory,
  HealthOutcome,
  HealthRecordType,
  MedicationRoute,
  Severity,
} from "@prisma/client";

/**
 * Drains the local PowerSync CRUD queue (src/lib/offline/connector.ts calls
 * this from `uploadData`). Deliberately not a Server Action: the connector
 * posts a JSON batch of arbitrary local writes, not a single form.
 *
 * Every write here goes through the SAME checks as the online path in
 * src/app/health/actions.ts — requireRole, the farm-scoped animal lookup,
 * diagnosis normalisation — rather than trusting whatever the offline
 * client queued. The client is untrusted input exactly like a form
 * submission is; being "already validated" on-device by a form that ran
 * hours ago with no connection proves nothing about what actually reaches
 * the server.
 *
 * IDs are client-generated (the offline form assigns each new row's id
 * before writing it to the local SQLite table — see
 * src/app/health/offline/health-record-form-offline.tsx) and stay the same
 * on the server: PowerSync's local row and the server's row are the SAME
 * row identified by the SAME id, not two rows reconciled after the fact.
 * That's also why a medications entry's `health_record_id` already points
 * at a real, permanent id even when both rows synced in the same batch —
 * no local-to-server id remapping step exists here or anywhere else.
 *
 * First pass, deliberately narrow: only inserting new rows is supported.
 * Editing or deleting an existing record offline, and the "mark deceased"
 * side effect the online form has, are both out of scope for now — see
 * docs/offline-first.md.
 */

const RECORD_TYPES = Object.keys(HEALTH_RECORD_TYPE_LABELS) as HealthRecordType[];
const CATEGORIES = Object.keys(HEALTH_CATEGORY_LABELS) as HealthCategory[];
const SEVERITIES = Object.keys(SEVERITY_LABELS) as Severity[];
const OUTCOMES = Object.keys(HEALTH_OUTCOME_LABELS) as HealthOutcome[];
const ROUTES = Object.keys(MEDICATION_ROUTE_LABELS) as MedicationRoute[];

type CrudEntryPayload = {
  id: string;
  table: string;
  op: "PUT" | "PATCH" | "DELETE";
  opData: Record<string, unknown> | null;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireEnumValue<T extends string>(value: unknown, allowed: T[], field: string): T {
  const v = str(value);
  if (!allowed.includes(v as T)) throw new Error(`Invalid ${field}: "${v}"`);
  return v as T;
}

class SyncRejection extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function applyHealthRecord(entry: CrudEntryPayload, farmId: string, profileId: string) {
  if (entry.op !== "PUT") {
    throw new SyncRejection(`Offline ${entry.op} on health_records is not supported yet.`, 400);
  }
  const data = entry.opData;
  if (!data) return;

  // Already applied by an earlier attempt at this same batch (the client
  // retries the whole queue on any failure, not just the entry that
  // failed) — creating it again would violate the id primary key, so this
  // is success, not an error.
  const existing = await prisma.healthRecord.findUnique({ where: { id: entry.id } });
  if (existing) return;

  const animalId = str(data.animal_id);
  const animal = await prisma.animal.findFirst({
    where: { id: animalId, farmId },
    select: { id: true, dateOfBirth: true },
  });
  if (!animal) {
    throw new SyncRejection(
      `Animal ${animalId} not found on this farm — was it deleted since this device last synced?`,
      409
    );
  }

  const recordedAt = new Date(str(data.recorded_at));
  if (Number.isNaN(recordedAt.getTime())) throw new SyncRejection("Invalid recorded_at", 400);
  if (recordedAt.getTime() > Date.now()) {
    throw new SyncRejection("Record date cannot be in the future", 400);
  }
  const startOfBirthDay = new Date(animal.dateOfBirth);
  startOfBirthDay.setHours(0, 0, 0, 0);
  if (recordedAt < startOfBirthDay) {
    throw new SyncRejection("Record date cannot be before the animal's date of birth", 400);
  }

  const outcome = requireEnumValue(data.outcome || "ONGOING", OUTCOMES, "outcome");

  await prisma.healthRecord.create({
    data: {
      id: entry.id,
      farmId,
      animalId: animal.id,
      recordedAt,
      recordType: requireEnumValue(data.record_type, RECORD_TYPES, "record type"),
      category: requireEnumValue(data.category, CATEGORIES, "category"),
      severity: requireEnumValue(data.severity, SEVERITIES, "severity"),
      diagnosis: normaliseDiagnosis(str(data.diagnosis)),
      treatment: str(data.treatment) || null,
      vetNotes: str(data.vet_notes) || null,
      outcome,
      resolvedAt: outcome === "ONGOING" ? null : recordedAt,
      createdByProfileId: profileId,
    },
  });
}

async function applyMedication(entry: CrudEntryPayload, farmId: string) {
  if (entry.op !== "PUT") {
    throw new SyncRejection(`Offline ${entry.op} on medications is not supported yet.`, 400);
  }
  const data = entry.opData;
  if (!data) return;

  const existing = await prisma.medication.findUnique({ where: { id: entry.id } });
  if (existing) return;

  const healthRecordId = str(data.health_record_id);
  // Scoped to this farm — a medication can only attach to a health record
  // this device is actually allowed to see, never an id guessed or reused
  // from another tenant.
  const healthRecord = await prisma.healthRecord.findFirst({
    where: { id: healthRecordId, farmId },
    select: { id: true },
  });
  if (!healthRecord) {
    throw new SyncRejection(
      `Health record ${healthRecordId} not found on this farm for this medication.`,
      409
    );
  }

  await prisma.medication.create({
    data: {
      id: entry.id,
      healthRecordId: healthRecord.id,
      drugName: str(data.drug_name),
      dosage: str(data.dosage) || null,
      route: requireEnumValue(data.route || "ORAL", ROUTES, "medication route"),
      startDate: data.start_date ? new Date(str(data.start_date)) : new Date(),
      withdrawalDays: Number.isFinite(Number(data.withdrawal_days)) ? Number(data.withdrawal_days) : 0,
      isAntibiotic: Boolean(data.is_antibiotic),
      notes: str(data.notes) || null,
    },
  });
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole(OBSERVE_ROLES);
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const farmId = await getActiveFarmId(user);

  const body = (await request.json()) as { entries: CrudEntryPayload[] };
  const entries = Array.isArray(body?.entries) ? body.entries : [];

  try {
    // Parents before children: a medication's health_record_id must exist
    // by the time it's applied, whether that parent came from an earlier
    // batch or this same one.
    for (const entry of entries.filter((e) => e.table === "health_records")) {
      await applyHealthRecord(entry, farmId, user.id);
    }
    for (const entry of entries.filter((e) => e.table === "medications")) {
      await applyMedication(entry, farmId);
    }
  } catch (error) {
    if (error instanceof SyncRejection) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
