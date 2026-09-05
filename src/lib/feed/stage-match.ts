/**
 * §8.4: "Feed stage must match animal's age/weight."
 *
 * Deliberately a warning rather than a hard block. Feeding a grower ration to
 * a pen of finishers is a mistake worth flagging, but there are real reasons
 * to do it — running out of the right feed on a Sunday, tapering a diet
 * change over a week, a mixed-age pen after weaning. Refusing the record
 * outright just means the feeding goes unlogged, which costs more than the
 * mismatch does.
 */

import type { FeedClassification, LifeStage } from "@prisma/client";
import { FEED_CLASSIFICATION_LABELS, LIFE_STAGE_LABELS } from "@/lib/labels";

/** Classifications that suit each production stage. */
const STAGE_FEEDS: Record<LifeStage, FeedClassification[]> = {
  YOUNG: ["STARTER"],
  WEANER: ["WEANER", "STARTER"],
  GROWER: ["GROWER"],
  FINISHER: ["FINISHER", "GROWER"],
  MAIDEN_FEMALE: ["GESTATION", "GROWER", "FINISHER"],
  BREEDING_FEMALE: ["GESTATION", "LACTATION"],
  BREEDING_MALE: ["BREEDING_MALE", "GESTATION"],
};

/** The classification a stage should normally be on. */
export function preferredClassification(stage: LifeStage): FeedClassification {
  return STAGE_FEEDS[stage][0];
}

export function classificationSuitsStage(
  classification: FeedClassification,
  stage: LifeStage
): boolean {
  // A supplement rides alongside any ration; it is never the mismatch.
  if (classification === "SUPPLEMENT") return true;
  return STAGE_FEEDS[stage].includes(classification);
}

/**
 * Returns a human-readable warning when the feed does not suit the animals it
 * is going to, or null when it does. Takes a stage tally so a mixed pen
 * produces one message rather than one per animal.
 */
export function stageMismatchWarning(
  classification: FeedClassification,
  stageCounts: ReadonlyMap<LifeStage, number> | Record<string, number>
): string | null {
  const entries: [LifeStage, number][] =
    stageCounts instanceof Map
      ? [...stageCounts.entries()]
      : (Object.entries(stageCounts) as [LifeStage, number][]);

  const mismatched = entries.filter(
    ([stage, count]) => count > 0 && !classificationSuitsStage(classification, stage)
  );
  if (mismatched.length === 0) return null;

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const affected = mismatched.reduce((sum, [, count]) => sum + count, 0);
  const stageList = mismatched
    .map(([stage, count]) => `${count} ${LIFE_STAGE_LABELS[stage].toLowerCase()}`)
    .join(", ");

  const suggestion = mismatched
    .map(([stage]) => FEED_CLASSIFICATION_LABELS[preferredClassification(stage)])
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" / ");

  return `${FEED_CLASSIFICATION_LABELS[classification]} feed does not match ${affected} of ${total} animals (${stageList}). Consider ${suggestion} feed instead.`;
}
