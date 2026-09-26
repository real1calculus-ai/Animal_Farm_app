import type { BatchEventType } from "@prisma/client";

/**
 * Batch arithmetic — pure, no database.
 *
 * A batch is the only thing on the farm whose headcount is a *derived* number
 * rather than an observed one: nobody counts 500 birds each morning. It is
 * the opening count minus everything that has left, which makes the event log
 * the authority and the stored `currentCount` a cache of it. These functions
 * are what the two are reconciled against.
 */

export type CountingEvent = {
  eventType: BatchEventType;
  quantity: number;
  occurredAt: Date;
};

/** How each event moves the headcount. Weight samples move nothing. */
const DELTA: Record<BatchEventType, number> = {
  STOCKED: 1,
  TRANSFER_IN: 1,
  MORTALITY: -1,
  CULL: -1,
  TRANSFER_OUT: -1,
  SALE: -1,
  WEIGHT_SAMPLE: 0,
};

export function eventDelta(event: CountingEvent): number {
  return DELTA[event.eventType] * event.quantity;
}

/**
 * Headcount implied by the log. Never returns a negative: a log that removes
 * more animals than were ever stocked is bad data, and reporting "-12 birds"
 * helps nobody — the discrepancy surfaces through `reconcile` instead.
 */
export function countFromEvents(initialCount: number, events: CountingEvent[]): number {
  const net = events.reduce((sum, event) => sum + eventDelta(event), 0);
  return Math.max(0, initialCount + net);
}

export type Reconciliation = {
  stored: number;
  derived: number;
  /** Non-zero means the cached count and the log disagree. */
  drift: number;
  agrees: boolean;
};

/**
 * Compares the cached count against the log.
 *
 * Worth surfacing rather than silently trusting either: the cache is what
 * every list screen reads, and if a write once failed halfway the two diverge
 * permanently with nothing to announce it.
 */
export function reconcile(stored: number, initialCount: number, events: CountingEvent[]): Reconciliation {
  const derived = countFromEvents(initialCount, events);
  return { stored, derived, drift: stored - derived, agrees: stored === derived };
}

export type MortalityStats = {
  died: number;
  culled: number;
  /** Deaths as a fraction of everything ever stocked into the batch. */
  mortalityRate: number | null;
  /** Deaths in the first week, where most of a flock's losses actually fall. */
  firstWeekDeaths: number;
};

export function mortalityStats(
  startDate: Date,
  initialCount: number,
  events: CountingEvent[]
): MortalityStats {
  const stockedIn = events
    .filter((e) => e.eventType === "STOCKED" || e.eventType === "TRANSFER_IN")
    .reduce((sum, e) => sum + e.quantity, 0);

  // Denominator is everything that ever entered, not what is left. Dividing by
  // survivors would report a rate that falls as more animals die.
  const everStocked = initialCount + stockedIn;

  const deaths = events.filter((e) => e.eventType === "MORTALITY");
  const died = deaths.reduce((sum, e) => sum + e.quantity, 0);
  const culled = events
    .filter((e) => e.eventType === "CULL")
    .reduce((sum, e) => sum + e.quantity, 0);

  const weekOne = new Date(startDate.getTime() + 7 * 86_400_000);
  const firstWeekDeaths = deaths
    .filter((e) => e.occurredAt.getTime() <= weekOne.getTime())
    .reduce((sum, e) => sum + e.quantity, 0);

  return {
    died,
    culled,
    mortalityRate: everStocked > 0 ? died / everStocked : null,
    firstWeekDeaths,
  };
}

/**
 * Feed conversion for a batch: kg of feed per kg of liveweight produced.
 *
 * Liveweight is current average weight times survivors, less what was stocked
 * in. Deliberately ignores weight that died — the feed those animals ate is
 * still counted, which is correct and is exactly why a batch with heavy
 * mortality shows a worse FCR than its survivors alone would suggest.
 */
export function batchFcr({
  feedKg,
  currentCount,
  avgWeightKg,
  initialCount,
  startWeightKg,
}: {
  feedKg: number;
  currentCount: number;
  avgWeightKg: number | null;
  initialCount: number;
  startWeightKg: number | null;
}): { gainKg: number; fcr: number | null } {
  if (avgWeightKg === null || avgWeightKg <= 0) return { gainKg: 0, fcr: null };

  // No feed recorded is unknown, not perfect. Returning 0 here would print an
  // FCR of 0.00, which reads as the best conversion ever achieved rather than
  // as the absence of data it actually is.
  if (feedKg <= 0) {
    const startingBiomass = (startWeightKg ?? 0) * initialCount;
    return { gainKg: Math.max(0, avgWeightKg * currentCount - startingBiomass), fcr: null };
  }

  const startingBiomass = (startWeightKg ?? 0) * initialCount;
  const gainKg = Math.max(0, avgWeightKg * currentCount - startingBiomass);

  return { gainKg, fcr: gainKg > 0 ? feedKg / gainKg : null };
}

/**
 * Lay percentage: eggs collected per bird per day, as a percentage.
 *
 * The figure a layer flock is actually judged on. Anything over 100% means the
 * count or the bird number is wrong, so it is capped rather than displayed —
 * a 140% lay rate reads as a system error, which it is.
 */
export function layPercentage(eggs: number, birds: number, days: number): number | null {
  if (birds <= 0 || days <= 0) return null;
  return Math.min(1, eggs / (birds * days));
}

/** Days the batch has been on the farm, plus the stock's age including its age on arrival. */
export function batchAges(startDate: Date, startAgeDays: number, asOf: Date = new Date()) {
  const daysOnFarm = Math.max(0, Math.floor((asOf.getTime() - startDate.getTime()) / 86_400_000));
  return { daysOnFarm, ageDays: startAgeDays + daysOnFarm };
}
