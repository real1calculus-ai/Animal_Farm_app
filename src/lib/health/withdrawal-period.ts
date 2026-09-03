/**
 * Medication withdrawal periods — the date arithmetic, with no database access.
 *
 * A withdrawal period is the interval that must elapse between the last dose of
 * a veterinary medicine and the point at which the animal's meat is fit for
 * human consumption. Selling or slaughtering inside that window puts drug
 * residue into the food chain, so §8.3 states it as a hard rule rather than a
 * hint.
 *
 * This half is split out from `withdrawal.ts` for one reason: that module is
 * `server-only`, and importing it from a plain test process throws before a
 * single assertion runs. The arithmetic here is where an off-by-one would
 * quietly permit an early sale, so it is the part that most needs pinning by
 * tests — see `tests/withdrawal.test.ts`. `withdrawal.ts` re-exports all of it,
 * so callers can keep importing from either.
 */

import { addDays, daysBetween } from "@/lib/format";

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

/** Days until clearance, for sorting a "clearing soon" list. */
export function daysUntilClearance(status: WithdrawalStatus, asOf: Date = new Date()): number {
  if (!status.clearanceDate) return 0;
  return daysBetween(asOf, status.clearanceDate);
}
