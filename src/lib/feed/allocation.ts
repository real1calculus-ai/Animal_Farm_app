/**
 * FIFO feed allocation — pure functions, no database access.
 *
 * Feed is consumed oldest-delivery-first. That is not a stylistic choice: feed
 * spoils, and drawing the newest bag first quietly ages the rest of the store
 * until it expires in place. Doing the arithmetic here rather than inline in a
 * Server Action means the rules that actually matter — never allocate expired
 * feed (§8.4), never draw a batch below zero — are testable without a
 * database, and the caller's only job is to persist the draws this returns.
 *
 * Everything is kilograms as Floats, rounded to grams at the boundaries so a
 * chain of subtractions can't leave a batch holding 0.0000000001 kg forever.
 */

/** The shape this module needs from a `FeedBatch` row. Nothing more. */
export type AllocatableBatch = {
  id: string;
  batchCode: string;
  receivedDate: Date;
  expirationDate: Date | null;
  remainingKg: number;
  costPerKgCents: number;
};

/** One draw against one batch. */
export type BatchDraw = {
  batchId: string;
  batchCode: string;
  kg: number;
  costPerKgCents: number;
  /** What the batch is left holding after this draw. */
  remainingAfterKg: number;
};

export type AllocationResult = {
  draws: BatchDraw[];
  totalKg: number;
  totalCostCents: number;
  /**
   * Cost per kg across the whole allocation, weighted by how much came from
   * each batch. This is what gets snapshotted onto a FeedingRecord — an
   * allocation spanning a cheap old batch and an expensive new one has no
   * single "the" price.
   */
  weightedCostPerKgCents: number;
  /** Kg that could not be satisfied. Always 0 unless `allowPartial`. */
  shortfallKg: number;
};

export type AllocationErrorCode =
  | "INVALID_QUANTITY"
  | "INSUFFICIENT_STOCK"
  | "EXPIRED_BATCH"
  | "OVERDRAW"
  | "UNKNOWN_BATCH";

export class FeedAllocationError extends Error {
  readonly code: AllocationErrorCode;

  constructor(code: AllocationErrorCode, message: string) {
    super(message);
    this.name = "FeedAllocationError";
    this.code = code;
  }
}

/** Kilograms below this are treated as zero — float noise, not stock. */
export const KG_EPSILON = 1e-6;

/** Rounds to grams. Feed is weighed to the kilo at best; grams is generous. */
export function roundKg(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

export function isExpired(
  batch: Pick<AllocatableBatch, "expirationDate">,
  asOf: Date = new Date()
): boolean {
  if (!batch.expirationDate) return false;
  return batch.expirationDate.getTime() < asOf.getTime();
}

/** Expiring inside `days` and not already expired. */
export function expiresWithin(
  batch: Pick<AllocatableBatch, "expirationDate">,
  days: number,
  asOf: Date = new Date()
): boolean {
  if (!batch.expirationDate) return false;
  if (isExpired(batch, asOf)) return false;
  const horizon = asOf.getTime() + days * 86_400_000;
  return batch.expirationDate.getTime() <= horizon;
}

export function hasStock(batch: Pick<AllocatableBatch, "remainingKg">): boolean {
  return batch.remainingKg > KG_EPSILON;
}

/**
 * Oldest first by received date, then by expiry, then by id.
 *
 * The expiry tiebreak matters more than it looks: two deliveries landing the
 * same day with different shelf lives should burn the short-dated one first,
 * and without a deterministic third key the order would depend on whatever
 * the database happened to return.
 */
export function sortFifo<T extends AllocatableBatch>(batches: readonly T[]): T[] {
  return [...batches].sort((a, b) => {
    const byReceived = a.receivedDate.getTime() - b.receivedDate.getTime();
    if (byReceived !== 0) return byReceived;

    const aExp = a.expirationDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bExp = b.expirationDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aExp !== bExp) return aExp - bExp;

    return a.id.localeCompare(b.id);
  });
}

/** Batches that may legally be fed: in date, and holding something. */
export function allocatableBatches<T extends AllocatableBatch>(
  batches: readonly T[],
  asOf: Date = new Date()
): T[] {
  return sortFifo(batches.filter((b) => hasStock(b) && !isExpired(b, asOf)));
}

export function totalAvailableKg(
  batches: readonly AllocatableBatch[],
  asOf: Date = new Date()
): number {
  return roundKg(
    allocatableBatches(batches, asOf).reduce((sum, b) => sum + b.remainingKg, 0)
  );
}

/** Stock that is on the shelf but unusable — the write-off candidates. */
export function expiredStockKg(
  batches: readonly AllocatableBatch[],
  asOf: Date = new Date()
): number {
  return roundKg(
    batches
      .filter((b) => hasStock(b) && isExpired(b, asOf))
      .reduce((sum, b) => sum + b.remainingKg, 0)
  );
}

export type AllocateOptions = {
  asOf?: Date;
  /**
   * Draw this batch first, then fall back to FIFO for whatever is left. Set
   * when a worker records feeding from a specific, named bag. The batch still
   * has to pass the expiry and over-draw checks like any other.
   */
  preferredBatchId?: string | null;
  /**
   * Return what stock allows instead of throwing when there isn't enough.
   * Used by the bulk-feeding preview, which needs to show a shortfall rather
   * than fail the whole screen.
   */
  allowPartial?: boolean;
};

/**
 * Draws `requestedKg` from `batches`, oldest batch first, spanning as many
 * batches as it takes.
 *
 * Throws rather than silently short-filling: a feeding record for less than
 * was actually fed is worse than no record, because every FCR downstream then
 * reads as better than reality.
 */
export function allocateFifo(
  batches: readonly AllocatableBatch[],
  requestedKg: number,
  options: AllocateOptions = {}
): AllocationResult {
  const { asOf = new Date(), preferredBatchId = null, allowPartial = false } = options;

  if (!Number.isFinite(requestedKg) || requestedKg <= 0) {
    throw new FeedAllocationError(
      "INVALID_QUANTITY",
      "Quantity to allocate must be greater than zero"
    );
  }

  let queue = allocatableBatches(batches, asOf);

  if (preferredBatchId) {
    const known = batches.find((b) => b.id === preferredBatchId);
    if (!known) {
      throw new FeedAllocationError(
        "UNKNOWN_BATCH",
        "The selected batch does not belong to this feed type"
      );
    }
    if (isExpired(known, asOf)) {
      throw new FeedAllocationError(
        "EXPIRED_BATCH",
        `Batch ${known.batchCode} expired on ${known.expirationDate?.toDateString()} and cannot be fed to animals`
      );
    }
    if (!hasStock(known)) {
      throw new FeedAllocationError(
        "INSUFFICIENT_STOCK",
        `Batch ${known.batchCode} is empty`
      );
    }
    queue = [known, ...queue.filter((b) => b.id !== preferredBatchId)];
  }

  const draws: BatchDraw[] = [];
  let outstanding = requestedKg;

  for (const batch of queue) {
    if (outstanding <= KG_EPSILON) break;

    const take = roundKg(Math.min(batch.remainingKg, outstanding));
    if (take <= KG_EPSILON) continue;

    const remainingAfterKg = roundKg(batch.remainingKg - take);
    if (remainingAfterKg < -KG_EPSILON) {
      // Unreachable via Math.min above; kept as the invariant this function
      // promises its callers, so a future edit can't quietly break it.
      throw new FeedAllocationError(
        "OVERDRAW",
        `Cannot draw ${take} kg from batch ${batch.batchCode}, which holds ${batch.remainingKg} kg`
      );
    }

    draws.push({
      batchId: batch.id,
      batchCode: batch.batchCode,
      kg: take,
      costPerKgCents: batch.costPerKgCents,
      remainingAfterKg: Math.max(0, remainingAfterKg),
    });

    outstanding = roundKg(outstanding - take);
  }

  const shortfallKg = Math.max(0, roundKg(outstanding));

  if (shortfallKg > KG_EPSILON && !allowPartial) {
    const available = totalAvailableKg(batches, asOf);
    const expired = expiredStockKg(batches, asOf);
    const expiredNote =
      expired > KG_EPSILON
        ? ` (${expired.toFixed(1)} kg is in stock but expired and cannot be fed)`
        : "";
    throw new FeedAllocationError(
      "INSUFFICIENT_STOCK",
      `Only ${available.toFixed(1)} kg of usable stock is available, ${requestedKg.toFixed(1)} kg was requested${expiredNote}`
    );
  }

  const totalKg = roundKg(draws.reduce((sum, d) => sum + d.kg, 0));
  const totalCostCents = draws.reduce(
    (sum, d) => sum + Math.round(d.kg * d.costPerKgCents),
    0
  );

  return {
    draws,
    totalKg,
    totalCostCents,
    weightedCostPerKgCents: totalKg > KG_EPSILON ? Math.round(totalCostCents / totalKg) : 0,
    shortfallKg,
  };
}

/**
 * Applies draws to a set of batch rows and returns the new remaining
 * quantities. The caller persists these; this function exists so the
 * "never below zero" guarantee is enforced in one place and can be asserted
 * in a test without a database.
 */
export function applyDraws<T extends AllocatableBatch>(
  batches: readonly T[],
  draws: readonly BatchDraw[]
): { id: string; remainingKg: number }[] {
  const byId = new Map(batches.map((b) => [b.id, b]));

  return draws.map((draw) => {
    const batch = byId.get(draw.batchId);
    if (!batch) {
      throw new FeedAllocationError("UNKNOWN_BATCH", `Unknown batch ${draw.batchId}`);
    }
    const remainingKg = roundKg(batch.remainingKg - draw.kg);
    if (remainingKg < -KG_EPSILON) {
      throw new FeedAllocationError(
        "OVERDRAW",
        `Cannot draw ${draw.kg} kg from batch ${batch.batchCode}, which holds ${batch.remainingKg} kg`
      );
    }
    return { id: batch.id, remainingKg: Math.max(0, remainingKg) };
  });
}

/**
 * §8.4: consumption may exceed the allocation by at most 10%. Anything past
 * that is a mistyped figure, not a hungry pen — an animal cannot eat feed that
 * was never put in front of it.
 */
export const CONSUMPTION_TOLERANCE = 0.1;

export function consumptionExceedsTolerance(
  allocatedKg: number,
  consumedKg: number,
  tolerance: number = CONSUMPTION_TOLERANCE
): boolean {
  if (!Number.isFinite(consumedKg)) return false;
  return consumedKg > allocatedKg * (1 + tolerance) + KG_EPSILON;
}

export function assertConsumptionWithinTolerance(
  allocatedKg: number,
  consumedKg: number | null,
  tolerance: number = CONSUMPTION_TOLERANCE
): void {
  if (consumedKg === null) return;
  if (consumedKg < 0) throw new Error("Consumed quantity cannot be negative");
  if (consumptionExceedsTolerance(allocatedKg, consumedKg, tolerance)) {
    const cap = allocatedKg * (1 + tolerance);
    throw new Error(
      `Consumption (${consumedKg.toFixed(1)} kg) cannot exceed the allocated ${allocatedKg.toFixed(1)} kg by more than ${Math.round(tolerance * 100)}% (max ${cap.toFixed(1)} kg). Check the figure before saving.`
    );
  }
}

/** Feed left over: allocated but not eaten. Negative values clamp to zero. */
export function wastageKg(allocatedKg: number, consumedKg: number | null): number | null {
  if (consumedKg === null) return null;
  return Math.max(0, roundKg(allocatedKg - consumedKg));
}
