import test from "node:test";
import assert from "node:assert/strict";

import {
  batchFcr,
  countFromEvents,
  layPercentage,
  mortalityStats,
  reconcile,
  type CountingEvent,
} from "@/lib/batch-metrics";

/**
 * A batch's headcount is the only number on the farm nobody observes — nobody
 * counts 500 birds each morning. It is derived from the event log, which makes
 * the arithmetic here load-bearing: get it wrong and the farm is looking at a
 * flock size that does not exist, with no way to notice.
 */

const START = new Date("2026-09-01T00:00:00.000Z");
const day = (n: number) => new Date(START.getTime() + n * 86_400_000);

function ev(eventType: CountingEvent["eventType"], quantity: number, dayOffset: number): CountingEvent {
  return { eventType, quantity, occurredAt: day(dayOffset) };
}

test("an untouched batch still holds what was stocked", () => {
  assert.equal(countFromEvents(500, []), 500);
});

test("losses and additions both move the count", () => {
  const events = [ev("MORTALITY", 12, 1), ev("CULL", 3, 4), ev("TRANSFER_IN", 20, 5), ev("SALE", 100, 40)];
  assert.equal(countFromEvents(500, events), 500 - 12 - 3 + 20 - 100);
});

test("a weight sample does not change the headcount", () => {
  assert.equal(countFromEvents(500, [ev("WEIGHT_SAMPLE", 0, 3)]), 500);
});

test("a log that removes more than exists floors at zero", () => {
  // Bad data should not produce "-40 birds", which helps nobody. The
  // discrepancy is meant to surface through reconcile instead.
  assert.equal(countFromEvents(30, [ev("MORTALITY", 70, 1)]), 0);
});

test("reconcile reports drift between the cache and the log", () => {
  const events = [ev("MORTALITY", 10, 1)];
  const agreeing = reconcile(490, 500, events);
  assert.equal(agreeing.agrees, true);
  assert.equal(agreeing.drift, 0);

  // A write that landed half-applied: the event saved, the cached count did not.
  const drifting = reconcile(500, 500, events);
  assert.equal(drifting.agrees, false);
  assert.equal(drifting.drift, 10);
  assert.equal(drifting.derived, 490);
});

test("mortality is measured against everything ever stocked, not survivors", () => {
  // Dividing by what is left would make the rate fall as more animals die —
  // the metric would improve exactly as the situation got worse.
  const events = [ev("MORTALITY", 50, 2), ev("MORTALITY", 50, 10)];
  const stats = mortalityStats(START, 500, events);
  assert.equal(stats.died, 100);
  assert.equal(stats.mortalityRate, 100 / 500);
});

test("transferred-in stock counts toward the mortality denominator", () => {
  const events = [ev("TRANSFER_IN", 100, 1), ev("MORTALITY", 60, 5)];
  const stats = mortalityStats(START, 500, events);
  assert.equal(stats.mortalityRate, 60 / 600);
});

test("first-week deaths are separated from later ones", () => {
  // Early mortality points at the stock or the brooding; later mortality
  // points at management. Collapsing them hides which problem you have.
  const events = [ev("MORTALITY", 40, 3), ev("MORTALITY", 5, 30)];
  const stats = mortalityStats(START, 500, events);
  assert.equal(stats.died, 45);
  assert.equal(stats.firstWeekDeaths, 40);
});

test("culls are counted apart from deaths", () => {
  const stats = mortalityStats(START, 100, [ev("CULL", 7, 2)]);
  assert.equal(stats.culled, 7);
  assert.equal(stats.died, 0);
  assert.equal(stats.mortalityRate, 0);
});

test("feed conversion charges feed to the survivors' gain", () => {
  // 400 birds at 2 kg, stocked at 0.04 kg: 800 kg standing against 20 kg in.
  const { gainKg, fcr } = batchFcr({
    feedKg: 1_560,
    currentCount: 400,
    avgWeightKg: 2,
    initialCount: 500,
    startWeightKg: 0.04,
  });
  assert.equal(gainKg, 800 - 20);
  assert.equal(fcr, 1_560 / 780);
});

test("feed conversion is unavailable until a weight is sampled", () => {
  const { fcr } = batchFcr({
    feedKg: 900,
    currentCount: 400,
    avgWeightKg: null,
    initialCount: 500,
    startWeightKg: null,
  });
  assert.equal(fcr, null);
});

test("lay rate is eggs per bird per day and cannot exceed 100%", () => {
  assert.equal(layPercentage(80, 100, 1), 0.8);
  assert.equal(layPercentage(560, 100, 7), 0.8);
  // More eggs than birds×days means the count or the flock size is wrong;
  // showing 140% would read as a bumper week rather than a data error.
  assert.equal(layPercentage(140, 100, 1), 1);
  assert.equal(layPercentage(80, 0, 1), null);
});
