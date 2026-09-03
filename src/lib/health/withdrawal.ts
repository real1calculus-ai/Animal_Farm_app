import "server-only";

import { prisma } from "@/lib/prisma";

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

// The pure date arithmetic lives in `./withdrawal-period` so it can be unit
// tested without this module's `server-only` guard aborting the test process.
// Re-exported here so every existing import path keeps working.
export {
  medicationCourseEndDate,
  medicationClearanceDate,
  computeWithdrawalStatus,
  latestClearanceDate,
  daysUntilClearance,
  WITHDRAWAL_MEDICATION_SELECT,
  type WithdrawalMedication,
  type BlockingMedication,
  type WithdrawalStatus,
} from "./withdrawal-period";

import {
  computeWithdrawalStatus,
  WITHDRAWAL_MEDICATION_SELECT,
  type WithdrawalMedication,
  type WithdrawalStatus,
} from "./withdrawal-period";

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
