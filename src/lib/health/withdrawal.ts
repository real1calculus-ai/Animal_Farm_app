import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, daysBetween } from "@/lib/format";

/**
 * Medication withdrawal periods — the food-safety boundary of the system.
 *
 * A withdrawal period is the interval that must elapse between the last dose
 * of a veterinary medicine and the point at which the animal's meat is legally
 * fit for human consumption. Selling or slaughtering inside that window puts
 * drug residue into the food chain, so §8.3 states this as a hard rule, not a
 * hint: "Cannot sell/slaughter animals within withdrawal period".
 *
 * The API is deliberately split into a pure layer (exported so it can be unit
 * tested and reused over already-loaded rows) and a database layer whose
 * guard function throws. The finance / sales module MUST call
 * `assertPigsMayBeSold()` inside the same transaction that records a sale or
 * slaughter — see the note on that function. A boolean that a caller can
 * forget to read is exactly the misuse this shape is trying to prevent.
 */

/** The medication fields this module needs. Any wider row satisfies it. */
export type WithdrawalMedication = {
  drugName: string;
  startDate: Date;
  durationDays: number | null;
  completedDate: Date | null;
  withdrawalDays: number;
};

/** `select` clause producing exactly `WithdrawalMedication`. */
export const WITHDRAWAL_MEDICATION_SELECT = {
  drugName: true,
  startDate: true,
  durationDays: true,
  completedDate: true,
  withdrawalDays: true,
} as const;

export type BlockingMedication = {
  drugName: string;
  /** Date the course of treatment ended (actual, or projected from duration). */
  courseEndDate: Date;
  /** First date the animal is clear of this drug. */
  clearanceDate: Date;
  withdrawalDays: number;
};

export type WithdrawalStatus = {
  /** True when the animal may NOT be sold or slaughtered as of `asOf`. */
  inWithdrawal: boolean;
  /**
   * First date on which every recorded medication has cleared. Null when the
   * animal has no medication carrying a withdrawal period at all.
   */
  clearanceDate: Date | null;
  /** Whole days from `asOf` until `clearanceDate`. 0 when already clear. */
  daysRemaining: number;
  /** Every medication still inside its withdrawal window, latest last. */
  blockingMedications: BlockingMedication[];
};

/**
 * The day the course of treatment finished.
 *
 * `completedDate` is authoritative when the person who administered the drug
 * recorded it. Otherwise the course is projected from `durationDays` — a
 * 5-day course starting on the 1st ends on the 5th, so the offset is
 * `durationDays - 1`. With neither, the record describes a single dose and the
 * start date is also the end date. Erring towards a *later* end date is the
 * safe direction: it can only delay a sale, never permit an unsafe one.
 */
export function medicationCourseEndDate(medication: WithdrawalMedication): Date {
  if (medication.completedDate) return medication.completedDate;
  if (medication.durationDays && medication.durationDays > 1) {
    return addDays(medication.startDate, medication.durationDays - 1);
  }
  return medication.startDate;
}

/** First date the animal is clear of this one medication. */
export function medicationClearanceDate(medication: WithdrawalMedication): Date {
  return addDays(medicationCourseEndDate(medication), Math.max(0, medication.withdrawalDays));
}

/**
 * Folds a set of medications into a single answer. Pure — give it the rows
 * you already have rather than re-querying.
 */
export function computeWithdrawalStatus(
  medications: readonly WithdrawalMedication[],
  asOf: Date = new Date()
): WithdrawalStatus {
  const relevant = medications.filter((m) => m.withdrawalDays > 0);

  if (relevant.length === 0) {
    return { inWithdrawal: false, clearanceDate: null, daysRemaining: 0, blockingMedications: [] };
  }

  const blocking: BlockingMedication[] = [];
  let latest: Date | null = null;

  for (const medication of relevant) {
    const courseEndDate = medicationCourseEndDate(medication);
    const clearanceDate = medicationClearanceDate(medication);

    if (latest === null || clearanceDate.getTime() > latest.getTime()) latest = clearanceDate;

    if (clearanceDate.getTime() > asOf.getTime()) {
      blocking.push({
        drugName: medication.drugName,
        courseEndDate,
        clearanceDate,
        withdrawalDays: medication.withdrawalDays,
      });
    }
  }

  blocking.sort((a, b) => a.clearanceDate.getTime() - b.clearanceDate.getTime());

  const inWithdrawal = blocking.length > 0;
  const effectiveClearance = inWithdrawal
    ? blocking[blocking.length - 1].clearanceDate
    : latest;

  return {
    inWithdrawal,
    clearanceDate: effectiveClearance,
    daysRemaining: inWithdrawal
      ? Math.max(0, Math.ceil((effectiveClearance!.getTime() - asOf.getTime()) / 86_400_000))
      : 0,
    blockingMedications: blocking,
  };
}

/** Latest clearance date across a set of medications, or null if none apply. */
export function latestClearanceDate(medications: readonly WithdrawalMedication[]): Date | null {
  const relevant = medications.filter((m) => m.withdrawalDays > 0);
  if (relevant.length === 0) return null;
  return relevant
    .map(medicationClearanceDate)
    .reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
}

// ---------------------------------------------------------------------------
// Database-backed API
// ---------------------------------------------------------------------------

/**
 * Medications reach this module through their HealthRecord, which is what
 * carries `farmId` — Medication itself has no tenant column, so every query
 * here scopes through the parent record.
 */
async function loadMedications(
  pigIds: string[],
  farmId: string
): Promise<Map<string, WithdrawalMedication[]>> {
  const byPig = new Map<string, WithdrawalMedication[]>();
  for (const id of pigIds) byPig.set(id, []);
  if (pigIds.length === 0) return byPig;

  const rows = await prisma.medication.findMany({
    where: {
      withdrawalDays: { gt: 0 },
      healthRecord: { farmId, pigId: { in: pigIds } },
    },
    select: { ...WITHDRAWAL_MEDICATION_SELECT, healthRecord: { select: { pigId: true } } },
  });

  for (const row of rows) {
    const list = byPig.get(row.healthRecord.pigId);
    if (list) list.push(row);
  }
  return byPig;
}

/** Withdrawal status for one animal. */
export async function getWithdrawalStatus(
  pigId: string,
  farmId: string,
  asOf: Date = new Date()
): Promise<WithdrawalStatus> {
  const byPig = await loadMedications([pigId], farmId);
  return computeWithdrawalStatus(byPig.get(pigId) ?? [], asOf);
}

/** Withdrawal status for many animals in one round trip. */
export async function getWithdrawalStatuses(
  pigIds: string[],
  farmId: string,
  asOf: Date = new Date()
): Promise<Map<string, WithdrawalStatus>> {
  const byPig = await loadMedications(pigIds, farmId);
  const result = new Map<string, WithdrawalStatus>();
  for (const [pigId, medications] of byPig) {
    result.set(pigId, computeWithdrawalStatus(medications, asOf));
  }
  return result;
}

export type SaleEligibility = {
  pigId: string;
  tagNumber: string;
  allowed: boolean;
  /** Operator-facing explanation. Null when the animal is clear. */
  reason: string | null;
  status: WithdrawalStatus;
};

/**
 * Non-throwing form: use it to render a warning, disable a checkbox, or grey
 * an animal out of a sale picker. It is NOT the enforcement point — the
 * enforcement point is `assertPigsMayBeSold`, because a check whose result a
 * caller can ignore is not a control.
 *
 * `saleDate` defaults to now; pass the intended date when pre-booking a sale
 * so a future-dated sale is judged against the date it will actually happen.
 */
export async function checkPigsSaleEligibility(
  pigIds: string[],
  farmId: string,
  options: { saleDate?: Date } = {}
): Promise<SaleEligibility[]> {
  const saleDate = options.saleDate ?? new Date();
  const unique = [...new Set(pigIds)];

  const pigs = await prisma.pig.findMany({
    where: { id: { in: unique }, farmId },
    select: { id: true, tagNumber: true },
  });
  const statuses = await getWithdrawalStatuses(
    pigs.map((p) => p.id),
    farmId,
    saleDate
  );

  return pigs.map((pig) => {
    const status = statuses.get(pig.id) ?? {
      inWithdrawal: false,
      clearanceDate: null,
      daysRemaining: 0,
      blockingMedications: [],
    };
    return {
      pigId: pig.id,
      tagNumber: pig.tagNumber,
      allowed: !status.inWithdrawal,
      reason: status.inWithdrawal ? describeBlock(pig.tagNumber, status) : null,
      status,
    };
  });
}

/**
 * THE GUARD. The finance / sales module must call this before writing an
 * `AnimalSale` (or any slaughter/exit record) and must do so inside the same
 * `prisma.$transaction` as the write, so the check cannot be separated from
 * the action it protects:
 *
 * ```ts
 * await prisma.$transaction(async () => {
 *   await assertPigsMayBeSold(pigIds, farmId, { saleDate });
 *   await prisma.animalSale.create({ ... });
 * });
 * ```
 *
 * Throws on the first animal still inside a withdrawal window; the message
 * names the animal, the drug and the clearance date, and is safe to show to
 * the user (Server Actions in this app surface thrown errors through the
 * route's error boundary). Returns void on success — there is deliberately no
 * boolean to accidentally drop.
 *
 * Only sale, slaughter and cull-for-meat exits are gated. Recording a death,
 * or retiring a breeding animal, is not a food-chain event and does not go
 * through here.
 */
export async function assertPigsMayBeSold(
  pigIds: string[],
  farmId: string,
  options: { saleDate?: Date } = {}
): Promise<void> {
  if (pigIds.length === 0) return;

  const results = await checkPigsSaleEligibility(pigIds, farmId, options);
  const blocked = results.filter((r) => !r.allowed);
  if (blocked.length === 0) return;

  throw new Error(
    blocked.length === 1
      ? blocked[0].reason!
      : `${blocked.length} animals are still within a medication withdrawal period and cannot be sold or slaughtered: ${blocked
          .map((b) => b.reason)
          .join(" ")}`
  );
}

/** Single-animal convenience wrapper around {@link assertPigsMayBeSold}. */
export async function assertPigMayBeSold(
  pigId: string,
  farmId: string,
  options: { saleDate?: Date } = {}
): Promise<void> {
  return assertPigsMayBeSold([pigId], farmId, options);
}

function describeBlock(tagNumber: string, status: WithdrawalStatus): string {
  const drugs = [...new Set(status.blockingMedications.map((m) => m.drugName))].join(", ");
  const clearance = status.clearanceDate;
  const when = clearance
    ? clearance.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "an unknown date";
  return `Pig ${tagNumber} is within a medication withdrawal period (${drugs}) and cannot be sold or slaughtered until ${when} (${status.daysRemaining} day${
    status.daysRemaining === 1 ? "" : "s"
  } remaining).`;
}

/** Days until clearance, for sorting a "clearing soon" list. */
export function daysUntilClearance(status: WithdrawalStatus, asOf: Date = new Date()): number {
  if (!status.clearanceDate) return 0;
  return daysBetween(asOf, status.clearanceDate);
}
