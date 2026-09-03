import test from "node:test";
import assert from "node:assert/strict";

import {
  computeWithdrawalStatus,
  medicationClearanceDate,
  medicationCourseEndDate,
  type WithdrawalMedication,
} from "@/lib/health/withdrawal-period";

/**
 * Medication withdrawal is the one calculation in this system whose failure
 * mode is residue reaching the food chain, so the boundaries are pinned here
 * rather than left to the UI. The cases that matter are the ones where an
 * off-by-one goes the *permissive* way: the last blocked day, a course whose
 * end is projected from its duration, and several drugs where only the latest
 * clearance governs.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function med(overrides: Partial<WithdrawalMedication> = {}): WithdrawalMedication {
  return {
    drugName: "Oxytetracycline",
    startDate: d("2026-01-01"),
    durationDays: null,
    completedDate: null,
    withdrawalDays: 28,
    ...overrides,
  };
}

test("an animal with no medications is clear", () => {
  const status = computeWithdrawalStatus([], d("2026-01-15"));
  assert.equal(status.inWithdrawal, false);
  assert.equal(status.clearanceDate, null);
  assert.equal(status.daysRemaining, 0);
});

test("a medication with no withdrawal period never blocks a sale", () => {
  const status = computeWithdrawalStatus([med({ withdrawalDays: 0 })], d("2026-01-01"));
  assert.equal(status.inWithdrawal, false);
  assert.equal(status.blockingMedications.length, 0);
});

test("a single dose clears exactly withdrawalDays after the dose", () => {
  // Dosed 1 Jan with a 28-day withdrawal: clear on 29 Jan.
  assert.deepEqual(medicationCourseEndDate(med()), d("2026-01-01"));
  assert.deepEqual(medicationClearanceDate(med()), d("2026-01-29"));
});

test("the day before clearance is still blocked", () => {
  const status = computeWithdrawalStatus([med()], d("2026-01-28"));
  assert.equal(status.inWithdrawal, true);
  assert.equal(status.daysRemaining, 1);
  assert.equal(status.blockingMedications[0].drugName, "Oxytetracycline");
});

test("the clearance day itself is clear", () => {
  // The boundary that matters: an off-by-one here would permit a sale a full
  // day early, which is the direction that puts residue into the food chain.
  const status = computeWithdrawalStatus([med()], d("2026-01-29"));
  assert.equal(status.inWithdrawal, false);
  assert.equal(status.daysRemaining, 0);
});

test("a multi-day course is measured from its last day, not its first", () => {
  // A 5-day course starting 1 Jan ends on the 5th — not the 6th.
  const course = med({ durationDays: 5 });
  assert.deepEqual(medicationCourseEndDate(course), d("2026-01-05"));
  assert.deepEqual(medicationClearanceDate(course), d("2026-02-02"));
});

test("a recorded completion date overrides the projected duration", () => {
  // The course ran long: duration says it ended on the 5th, the person who
  // administered it recorded the 9th. The recorded date wins.
  const course = med({ durationDays: 5, completedDate: d("2026-01-09") });
  assert.deepEqual(medicationCourseEndDate(course), d("2026-01-09"));
  assert.deepEqual(medicationClearanceDate(course), d("2026-02-06"));
});

test("the latest clearance across several drugs governs the animal", () => {
  const status = computeWithdrawalStatus(
    [
      med({ drugName: "Short-acting", withdrawalDays: 5 }),
      med({ drugName: "Long-acting", withdrawalDays: 40 }),
    ],
    d("2026-01-10")
  );
  assert.equal(status.inWithdrawal, true);
  assert.deepEqual(status.clearanceDate, d("2026-02-10"));
  // Only the long-acting drug is still blocking on 10 Jan; the 5-day one
  // cleared on the 6th.
  assert.equal(status.blockingMedications.length, 1);
  assert.equal(status.blockingMedications[0].drugName, "Long-acting");
});

test("blocking medications are ordered so the last one is the true release date", () => {
  const status = computeWithdrawalStatus(
    [
      med({ drugName: "Long-acting", withdrawalDays: 40 }),
      med({ drugName: "Medium", withdrawalDays: 20 }),
    ],
    d("2026-01-05")
  );
  assert.deepEqual(
    status.blockingMedications.map((m) => m.drugName),
    ["Medium", "Long-acting"]
  );
  assert.deepEqual(status.clearanceDate, d("2026-02-10"));
});

test("a negative withdrawal period cannot pull the clearance date backwards", () => {
  // Bad data should never make an animal *more* saleable than its dose date.
  assert.deepEqual(medicationClearanceDate(med({ withdrawalDays: -10 })), d("2026-01-01"));
});
