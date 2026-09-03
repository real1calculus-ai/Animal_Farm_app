/**
 * Turning feeding programmes into "how much feed does this herd need today" —
 * pure functions, no database access.
 *
 * Two screens need exactly this calculation and must not disagree: the
 * programmes screen projects daily requirement for purchasing, and the bulk
 * feeding form pre-fills each pen's ration from it. Working it out twice is
 * how the figure a manager buys against stops matching the figure a worker
 * actually puts in the trough.
 */

import type { LifeStage } from "@prisma/client";
import { roundKg } from "@/lib/feed/allocation";

export type RationProgram = {
  id: string;
  name: string;
  stage: LifeStage;
  feedTypeId: string;
  feedTypeName: string;
  dailyKgPerAnimal: number;
  ageDaysMin: number | null;
  ageDaysMax: number | null;
  /** Stored as a fraction — 0.04 means 4% of bodyweight per day. */
  pctOfBodyweight: number | null;
  costPerKgCents: number | null;
};

export type RationAnimal = {
  id: string;
  stage: LifeStage;
  ageDays: number;
  currentWeightKg: number | null;
};

/** How specific a programme's age window is — narrower wins a tie. */
function specificity(program: RationProgram): number {
  return (program.ageDaysMin !== null ? 1 : 0) + (program.ageDaysMax !== null ? 1 : 0);
}

/**
 * The programme that applies to one animal, or null if none does.
 *
 * Stage must match; an age window, where one is set, must contain the animal.
 * When several programmes match, the one with the tightest age window wins —
 * a farm that has written both "Weaner 4-10 wk" and a general weaner ration
 * means the specific one.
 */
export function programFor(
  programs: readonly RationProgram[],
  animal: RationAnimal
): RationProgram | null {
  const matches = programs.filter((program) => {
    if (program.stage !== animal.stage) return false;
    if (program.ageDaysMin !== null && animal.ageDays < program.ageDaysMin) return false;
    if (program.ageDaysMax !== null && animal.ageDays > program.ageDaysMax) return false;
    return true;
  });

  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => specificity(b) - specificity(a))[0];
}

/**
 * The animal's ration for one day.
 *
 * The percentage-of-bodyweight rule wins where it is set and a weight is
 * known — that is how sows and finishers are actually fed. With no recorded
 * weight it falls back to the flat figure rather than to zero: a missing
 * weigh-in must not silently mean "feed nothing".
 */
export function dailyKgFor(program: RationProgram, animal: RationAnimal): number {
  if (program.pctOfBodyweight !== null && animal.currentWeightKg !== null) {
    return roundKg(animal.currentWeightKg * program.pctOfBodyweight);
  }
  return program.dailyKgPerAnimal;
}

export type StageRequirement = {
  stage: LifeStage;
  animalCount: number;
  dailyKg: number;
  dailyCostCents: number;
  /** Animals at this stage with no programme covering them. */
  uncoveredCount: number;
};

export type FeedTypeRequirement = {
  feedTypeId: string;
  feedTypeName: string;
  dailyKg: number;
  dailyCostCents: number;
  animalCount: number;
};

export type HerdRequirement = {
  byStage: StageRequirement[];
  byFeedType: FeedTypeRequirement[];
  totalDailyKg: number;
  totalDailyCostCents: number;
  /** Animals no active programme covers — the gap worth fixing. */
  uncovered: RationAnimal[];
};

export function summariseRequirement(
  programs: readonly RationProgram[],
  animals: readonly RationAnimal[]
): HerdRequirement {
  const byStage = new Map<LifeStage, StageRequirement>();
  const byFeedType = new Map<string, FeedTypeRequirement>();
  const uncovered: RationAnimal[] = [];

  for (const animal of animals) {
    const stageRow = byStage.get(animal.stage) ?? {
      stage: animal.stage,
      animalCount: 0,
      dailyKg: 0,
      dailyCostCents: 0,
      uncoveredCount: 0,
    };
    stageRow.animalCount += 1;

    const program = programFor(programs, animal);
    if (!program) {
      stageRow.uncoveredCount += 1;
      uncovered.push(animal);
      byStage.set(animal.stage, stageRow);
      continue;
    }

    const kg = dailyKgFor(program, animal);
    const costCents = Math.round(kg * (program.costPerKgCents ?? 0));

    stageRow.dailyKg += kg;
    stageRow.dailyCostCents += costCents;
    byStage.set(animal.stage, stageRow);

    const feedRow = byFeedType.get(program.feedTypeId) ?? {
      feedTypeId: program.feedTypeId,
      feedTypeName: program.feedTypeName,
      dailyKg: 0,
      dailyCostCents: 0,
      animalCount: 0,
    };
    feedRow.dailyKg += kg;
    feedRow.dailyCostCents += costCents;
    feedRow.animalCount += 1;
    byFeedType.set(program.feedTypeId, feedRow);
  }

  const stages = [...byStage.values()].map((row) => ({
    ...row,
    dailyKg: roundKg(row.dailyKg),
  }));
  const feeds = [...byFeedType.values()]
    .map((row) => ({ ...row, dailyKg: roundKg(row.dailyKg) }))
    .sort((a, b) => b.dailyKg - a.dailyKg);

  return {
    byStage: stages,
    byFeedType: feeds,
    totalDailyKg: roundKg(stages.reduce((sum, row) => sum + row.dailyKg, 0)),
    totalDailyCostCents: stages.reduce((sum, row) => sum + row.dailyCostCents, 0),
    uncovered,
  };
}

/**
 * Days of cover: how long current usable stock lasts at today's burn rate.
 * Null when nothing is being fed from it — dividing by zero would read as
 * "infinite cover", which is exactly the wrong thing to show.
 */
export function daysOfCover(usableKg: number, dailyKg: number): number | null {
  if (dailyKg <= 0) return null;
  return usableKg / dailyKg;
}
