import test from "node:test";
import assert from "node:assert/strict";

import {
  allocateFifo,
  applyDraws,
  assertConsumptionWithinTolerance,
  consumptionExceedsTolerance,
  FeedAllocationError,
  totalAvailableKg,
  wastageKg,
  type AllocatableBatch,
} from "@/lib/feed/allocation";

/**
 * The allocator decides which delivery an animal actually ate, so it is what
 * makes a feed recall answerable at all. Two behaviours matter more than the
 * arithmetic: it must never hand back less than was asked for without saying
 * so (a short record flatters every feed-conversion figure downstream), and it
 * must never let expired stock reach an animal.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = d("2026-06-01");

function batch(overrides: Partial<AllocatableBatch> & { id: string }): AllocatableBatch {
  return {
    batchCode: `B-${overrides.id}`,
    receivedDate: d("2026-01-01"),
    expirationDate: null,
    remainingKg: 100,
    costPerKgCents: 50_000,
    ...overrides,
  };
}

test("draws from the oldest delivery first", () => {
  const result = allocateFifo(
    [
      batch({ id: "new", receivedDate: d("2026-05-01") }),
      batch({ id: "old", receivedDate: d("2026-02-01") }),
    ],
    40,
    { asOf: NOW }
  );

  assert.equal(result.draws.length, 1);
  assert.equal(result.draws[0].batchId, "old");
  assert.equal(result.totalKg, 40);
  assert.equal(result.shortfallKg, 0);
});

test("spans as many batches as the request needs", () => {
  const result = allocateFifo(
    [
      batch({ id: "old", receivedDate: d("2026-02-01"), remainingKg: 30 }),
      batch({ id: "mid", receivedDate: d("2026-03-01"), remainingKg: 30 }),
      batch({ id: "new", receivedDate: d("2026-04-01"), remainingKg: 30 }),
    ],
    70,
    { asOf: NOW }
  );

  assert.deepEqual(
    result.draws.map((draw) => [draw.batchId, draw.kg]),
    [
      ["old", 30],
      ["mid", 30],
      ["new", 10],
    ]
  );
  assert.equal(result.totalKg, 70);
  assert.equal(result.draws[2].remainingAfterKg, 20);
});

test("expired stock is skipped even though it is the oldest", () => {
  const result = allocateFifo(
    [
      batch({ id: "expired", receivedDate: d("2026-01-01"), expirationDate: d("2026-05-01") }),
      batch({ id: "good", receivedDate: d("2026-04-01") }),
    ],
    50,
    { asOf: NOW }
  );

  assert.equal(result.draws.length, 1);
  assert.equal(result.draws[0].batchId, "good");
});

test("a shortfall throws rather than quietly under-filling", () => {
  // A record for less than was actually fed makes every downstream feed
  // conversion ratio read better than reality, so this must never be silent.
  assert.throws(
    () => allocateFifo([batch({ id: "only", remainingKg: 20 })], 50, { asOf: NOW }),
    (error: unknown) => {
      assert.ok(error instanceof FeedAllocationError);
      assert.equal(error.code, "INSUFFICIENT_STOCK");
      return true;
    }
  );
});

test("the shortfall message says when the missing stock is merely expired", () => {
  // Otherwise "only 0 kg available" is baffling to someone looking at a full store.
  assert.throws(
    () =>
      allocateFifo(
        [batch({ id: "expired", expirationDate: d("2026-05-01"), remainingKg: 500 })],
        50,
        { asOf: NOW }
      ),
    /expired and cannot be fed/
  );
});

test("allowPartial reports the shortfall instead of throwing", () => {
  const result = allocateFifo([batch({ id: "only", remainingKg: 20 })], 50, {
    asOf: NOW,
    allowPartial: true,
  });

  assert.equal(result.totalKg, 20);
  assert.equal(result.shortfallKg, 30);
});

test("a named batch jumps the queue but still cannot be expired", () => {
  const batches = [
    batch({ id: "old", receivedDate: d("2026-02-01") }),
    batch({ id: "named", receivedDate: d("2026-05-01") }),
  ];

  const result = allocateFifo(batches, 40, { asOf: NOW, preferredBatchId: "named" });
  assert.equal(result.draws[0].batchId, "named");

  assert.throws(
    () =>
      allocateFifo(
        [batch({ id: "named", expirationDate: d("2026-05-01") }), batch({ id: "old" })],
        40,
        { asOf: NOW, preferredBatchId: "named" }
      ),
    /expired/
  );
});

test("a zero or negative request is rejected", () => {
  for (const quantity of [0, -5, Number.NaN]) {
    assert.throws(
      () => allocateFifo([batch({ id: "a" })], quantity, { asOf: NOW }),
      (error: unknown) => (error as FeedAllocationError).code === "INVALID_QUANTITY"
    );
  }
});

test("cost is weighted across batches bought at different prices", () => {
  const result = allocateFifo(
    [
      batch({ id: "cheap", receivedDate: d("2026-02-01"), remainingKg: 50, costPerKgCents: 40_000 }),
      batch({ id: "dear", receivedDate: d("2026-03-01"), remainingKg: 50, costPerKgCents: 60_000 }),
    ],
    100,
    { asOf: NOW }
  );

  // 50 kg at ₦400 + 50 kg at ₦600 = ₦50,000 over 100 kg = ₦500/kg.
  assert.equal(result.totalCostCents, 50 * 40_000 + 50 * 60_000);
  assert.equal(result.weightedCostPerKgCents, 50_000);
});

test("applying draws never leaves a batch holding a negative quantity", () => {
  const batches = [batch({ id: "a", remainingKg: 30 }), batch({ id: "b", remainingKg: 30 })];
  const result = allocateFifo(batches, 45, { asOf: NOW });

  assert.deepEqual(applyDraws(batches, result.draws), [
    { id: "a", remainingKg: 0 },
    { id: "b", remainingKg: 15 },
  ]);
});

test("repeated subtraction does not leave float dust in a batch", () => {
  // Drawing 0.1 kg thirty times off a 3 kg batch should empty it exactly, not
  // strand 2.7755575615628914e-16 kg that no screen can ever clear.
  let remaining = 3;
  for (let i = 0; i < 30; i++) {
    const result = allocateFifo([batch({ id: "a", remainingKg: remaining })], 0.1, { asOf: NOW });
    remaining = result.draws[0].remainingAfterKg;
  }
  assert.equal(remaining, 0);
  assert.equal(totalAvailableKg([batch({ id: "a", remainingKg: remaining })], NOW), 0);
});

test("consumption may exceed the allocation by up to 10%, but no further", () => {
  assert.equal(consumptionExceedsTolerance(100, 110), false);
  assert.equal(consumptionExceedsTolerance(100, 110.5), true);
  assert.doesNotThrow(() => assertConsumptionWithinTolerance(100, 110));
  assert.throws(() => assertConsumptionWithinTolerance(100, 150), /cannot exceed/);
  assert.throws(() => assertConsumptionWithinTolerance(100, -1), /cannot be negative/);
  // Not recording consumption at all is normal and must stay allowed.
  assert.doesNotThrow(() => assertConsumptionWithinTolerance(100, null));
});

test("wastage is what was put out and not eaten, never negative", () => {
  assert.equal(wastageKg(100, 90), 10);
  assert.equal(wastageKg(100, 105), 0);
  assert.equal(wastageKg(100, null), null);
});
