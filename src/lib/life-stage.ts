import { ageInDays } from "@/lib/format";
import type { LifeStage, Sex } from "@prisma/client";

/**
 * Derives an animal's production stage from age, sex and parity.
 *
 * Stage is computed rather than stored because it is a pure function of facts
 * already recorded, and a stored copy would go stale the day nobody remembers
 * to move a gilt to "sow" after her first litter — which is precisely when the
 * feed ration and vaccination schedule need to change.
 */

export const WEANER_UNTIL_DAYS = 70;
export const GROWER_UNTIL_DAYS = 140;

export function deriveLifeStage({
  dateOfBirth,
  sex,
  parity,
  weaningAgeDays,
  minBreedingAgeDays,
  asOf = new Date(),
}: {
  dateOfBirth: Date;
  sex: Sex;
  /** Litters farrowed, for females. Zero for males and for gilts. */
  parity: number;
  weaningAgeDays: number;
  minBreedingAgeDays: number;
  asOf?: Date;
}): LifeStage {
  const days = ageInDays(dateOfBirth, asOf);

  if (days < weaningAgeDays) return "YOUNG";
  if (days < WEANER_UNTIL_DAYS) return "WEANER";
  if (days < GROWER_UNTIL_DAYS) return "GROWER";

  if (sex === "FEMALE") {
    if (parity > 0) return "BREEDING_FEMALE";
    if (days >= minBreedingAgeDays) return "MAIDEN_FEMALE";
    return "FINISHER";
  }

  // A male at breeding age is only a boar if the farm is actually keeping him
  // for breeding; the caller decides that by whether he has breeding records.
  return days >= minBreedingAgeDays ? "BREEDING_MALE" : "FINISHER";
}

/** Average daily gain in kg/day between two weigh-ins. */
export function averageDailyGain(
  earlier: { recordedAt: Date; weightKg: number },
  later: { recordedAt: Date; weightKg: number }
): number | null {
  const days = (later.recordedAt.getTime() - earlier.recordedAt.getTime()) / 86_400_000;
  if (days <= 0) return null;
  return (later.weightKg - earlier.weightKg) / days;
}

/**
 * Feed conversion ratio: kg of feed per kg of liveweight gain. Lower is
 * better. Returns null on zero or negative gain rather than Infinity, so
 * report tables don't have to special-case it downstream.
 */
export function feedConversionRatio(feedKg: number, gainKg: number): number | null {
  if (gainKg <= 0) return null;
  return feedKg / gainKg;
}
