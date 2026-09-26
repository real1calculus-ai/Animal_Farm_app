import { prisma } from "@/lib/prisma";
import { ageInDays } from "@/lib/format";
import {
  ancestryDiversity,
  classifyRelationship,
  loadPedigreeIndex,
  siblingKind,
  type PedigreeIndex,
} from "@/lib/breeding/pedigree";
import {
  createInbreedingCalculator,
  inbreedingBand,
  pedigreeCompleteness,
  type InbreedingBand,
} from "@/lib/breeding/inbreeding";
import type { FarmSettings } from "@prisma/client";
import { LIVESTOCK_ONLY } from "@/lib/species-catalogue";

/**
 * Breeding match finder (§4.2): given a dam, rank every eligible boar.
 *
 * Hard constraints exclude a boar outright and are never merely deducted from
 * his score — a full-sib or parent-offspring pairing must not be reachable by
 * scoring well on everything else. Soft constraints attach a warning and let
 * the user decide, because on a real farm "the only unrelated boar is 400 km
 * away" is a legitimate reason to accept a half-sib mating knowingly.
 *
 * Weights are the spec's: genetic distance 40%, diversity 30%, phenotype 20%,
 * health 10%. The sire-workload penalty is applied *after* that weighted sum
 * rather than folded into it, so the four published components still add to
 * 100 and the number on screen can be explained line by line.
 */

const WEIGHT_GENETIC = 0.4;
const WEIGHT_DIVERSITY = 0.3;
const WEIGHT_PHENOTYPE = 0.2;
const WEIGHT_HEALTH = 0.1;

/** Most a heavily-used boar can lose from his final score. */
const MAX_LOAD_PENALTY = 15;

const DAYS_PER_YEAR = 365;
const IDEAL_BODY_CONDITION_SCORE = 3;

export type MatchComponents = {
  geneticDistance: number;
  diversity: number;
  phenotype: number;
  health: number;
  loadPenalty: number;
};

export type SireMatch = {
  sireId: string;
  tagNumber: string;
  name: string | null;
  breed: string;
  ageDays: number;
  currentWeightKg: number | null;
  /** 0–100, after the workload penalty. Null when the boar is excluded. */
  score: number | null;
  eligible: boolean;
  inbreedingCoefficient: number;
  band: InbreedingBand;
  pedigreeCompleteness: number;
  relationshipLabel: string;
  breedingsLastYear: number;
  conceptionRate: number | null;
  components: MatchComponents;
  /** Reasons the pairing is refused. Non-empty means `eligible` is false. */
  blockers: string[];
  warnings: string[];
  /** One-line rationale, in the shape of the spec's worked example. */
  explanation: string;
};

export type MatchFinderResult = {
  dam: {
    id: string;
    tagNumber: string;
    name: string | null;
    breed: string;
    ageDays: number;
    inbreedingCoefficient: number;
    pedigreeCompleteness: number;
  };
  /** Eligible boars, best first. */
  matches: SireMatch[];
  /** Excluded boars, kept so the user can see *why* a boar is missing. */
  excluded: SireMatch[];
  damWarnings: string[];
};

type CandidateRow = {
  id: string;
  tagNumber: string;
  name: string | null;
  breed: string;
  dateOfBirth: Date;
  currentWeightKg: number | null;
  bodyConditionScore: number | null;
  congenitalDefects: string | null;
};

export async function findMatchesForDam(
  farmId: string,
  damId: string,
  settings: FarmSettings
): Promise<MatchFinderResult> {
  const dam = await prisma.animal.findFirst({
    where: { id: damId, farmId },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      breed: true,
      sex: true,
      status: true,
      dateOfBirth: true,
      currentWeightKg: true,
      bodyConditionScore: true,
      congenitalDefects: true,
      speciesId: true,
      species: { select: { name: true } },
    },
  });

  if (!dam) throw new Error("Dam not found");
  if (dam.sex !== "FEMALE") throw new Error("Breeding matches are found for a female animal");

  const now = new Date();
  const yearAgo = new Date(now.getTime() - DAYS_PER_YEAR * 86_400_000);

  const [index, candidates, breedingLoad, healthByAnimal, conceptionBySire] = await Promise.all([
    loadPedigreeIndex(farmId),
    prisma.animal.findMany({
      // Same species as the dam. Without this the finder cheerfully offers a
      // buck rabbit for a sow — it scored them highly, too, since no shared
      // ancestry reads as maximum genetic diversity. A working animal is
      // likewise never a breeding candidate for farmed stock.
      where: {
        farmId,
        speciesId: dam.speciesId,
        sex: "MALE",
        status: "ACTIVE",
        ...LIVESTOCK_ONLY,
      },
      select: {
        id: true,
        tagNumber: true,
        name: true,
        breed: true,
        dateOfBirth: true,
        currentWeightKg: true,
        bodyConditionScore: true,
        congenitalDefects: true,
      },
      orderBy: { tagNumber: "asc" },
    }),
    prisma.breedingRecord.groupBy({
      by: ["sireId"],
      where: { farmId, breedingDate: { gte: yearAgo } },
      _count: { _all: true },
    }),
    loadHealthScores(farmId, yearAgo),
    loadConceptionRates(farmId),
  ]);

  const calculator = createInbreedingCalculator(index);
  const loadBySire = new Map(breedingLoad.map((row) => [row.sireId, row._count._all]));

  const damAgeDays = ageInDays(dam.dateOfBirth, now);
  const damWarnings: string[] = [];

  if (damAgeDays < settings.minBreedingAgeDaysFemale) {
    damWarnings.push(
      `This gilt is ${damAgeDays} days old — below the farm's minimum breeding age of ${settings.minBreedingAgeDaysFemale} days.`
    );
  }
  if (dam.currentWeightKg !== null && dam.currentWeightKg < settings.minBreedingWeightKg) {
    damWarnings.push(
      `Recorded weight ${dam.currentWeightKg} kg is below the farm's minimum breeding weight of ${settings.minBreedingWeightKg} kg.`
    );
  }
  if (dam.status !== "ACTIVE") {
    damWarnings.push(`This animal's status is ${dam.status} — she should not be bred.`);
  }

  const matches: SireMatch[] = [];
  const excluded: SireMatch[] = [];

  for (const sire of candidates) {
    const match = scoreSire({
      index,
      calculator,
      dam,
      sire,
      settings,
      now,
      breedingsLastYear: loadBySire.get(sire.id) ?? 0,
      healthScore: healthByAnimal.get(sire.id) ?? 1,
      conceptionRate: conceptionBySire.get(sire.id) ?? null,
    });

    if (match.eligible) matches.push(match);
    else excluded.push(match);
  }

  matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  // Show the near-misses first among the excluded — a boar rejected on a
  // borderline F is more interesting than a full sibling.
  excluded.sort((a, b) => a.inbreedingCoefficient - b.inbreedingCoefficient);

  return {
    dam: {
      id: dam.id,
      tagNumber: dam.tagNumber,
      name: dam.name,
      breed: dam.breed,
      ageDays: damAgeDays,
      inbreedingCoefficient: calculator.inbreedingOf(dam.id),
      pedigreeCompleteness: pedigreeCompleteness(index, dam.id),
    },
    matches,
    excluded,
    damWarnings,
  };
}

function scoreSire({
  index,
  calculator,
  dam,
  sire,
  settings,
  now,
  breedingsLastYear,
  healthScore,
  conceptionRate,
}: {
  index: PedigreeIndex;
  calculator: ReturnType<typeof createInbreedingCalculator>;
  dam: CandidateRow;
  sire: CandidateRow;
  settings: FarmSettings;
  now: Date;
  breedingsLastYear: number;
  healthScore: number;
  conceptionRate: number | null;
}): SireMatch {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const f = calculator.offspringInbreeding(sire.id, dam.id);
  const band = inbreedingBand(f, settings.warnInbreedingCoefficient, settings.maxInbreedingCoefficient);
  const relationship = classifyRelationship(index, sire.id, dam.id);
  const sibling = siblingKind(index, sire.id, dam.id);
  const ageDays = ageInDays(sire.dateOfBirth, now);

  // --- Hard constraints (§4.3) ----------------------------------------
  if (relationship.kind === "SELF") blockers.push("Same animal");
  if (relationship.kind === "PARENT_OFFSPRING") blockers.push("Parent–offspring pairing");
  if (relationship.kind === "ANCESTOR_DESCENDANT") {
    blockers.push(`Direct line relative — ${relationship.label.toLowerCase()}`);
  }
  if (sibling === "FULL") blockers.push("Full siblings");
  if (f > settings.maxInbreedingCoefficient) {
    blockers.push(
      `Inbreeding coefficient ${(f * 100).toFixed(1)}% exceeds the farm limit of ${(settings.maxInbreedingCoefficient * 100).toFixed(1)}%`
    );
  }
  if (sibling !== "NONE" && sibling !== "FULL" && settings.halfSibPolicy === "BLOCK") {
    blockers.push("Half siblings — blocked by this farm's breeding policy");
  }
  if (ageDays < settings.minBreedingAgeDaysMale) {
    blockers.push(
      `Too young to breed: ${ageDays} days old, minimum is ${settings.minBreedingAgeDaysMale}`
    );
  }

  // --- Soft constraints -------------------------------------------------
  if (sibling !== "NONE" && sibling !== "FULL" && settings.halfSibPolicy === "WARN") {
    warnings.push(`${relationship.label} — acceptable only if genetic diversity is critically short`);
  }
  if (band === "MODERATE") {
    warnings.push(`Moderate inbreeding risk (F = ${(f * 100).toFixed(1)}%)`);
  }
  if (breedingsLastYear >= settings.maxSireUsesPerYear) {
    warnings.push(
      `Already used ${breedingsLastYear} times in the last year (farm limit ${settings.maxSireUsesPerYear}) — risks a genetic bottleneck`
    );
  }
  if (sire.congenitalDefects) {
    warnings.push(`Recorded congenital issue: ${sire.congenitalDefects}`);
  }
  if (conceptionRate !== null && conceptionRate < 0.6) {
    warnings.push(`Low historical conception rate (${(conceptionRate * 100).toFixed(0)}%)`);
  }
  const completeness = pedigreeCompleteness(index, sire.id);
  if (completeness < 0.5) {
    warnings.push(
      `Pedigree only ${(completeness * 100).toFixed(0)}% recorded — the inbreeding figure may understate the true relatedness`
    );
  }

  // --- Soft scores ------------------------------------------------------
  const geneticDistance = (1 - f) * 100;
  const diversity = ancestryDiversity(index, sire.id, dam.id) * 100;
  const phenotype = phenotypeScore(dam, sire) * 100;
  const health = Math.max(0, Math.min(1, healthScore)) * 100;

  const weighted =
    geneticDistance * WEIGHT_GENETIC +
    diversity * WEIGHT_DIVERSITY +
    phenotype * WEIGHT_PHENOTYPE +
    health * WEIGHT_HEALTH;

  const loadPenalty =
    settings.maxSireUsesPerYear > 0
      ? Math.min(1, breedingsLastYear / settings.maxSireUsesPerYear) * MAX_LOAD_PENALTY
      : 0;

  const score = Math.max(0, Math.round((weighted - loadPenalty) * 10) / 10);

  return {
    sireId: sire.id,
    tagNumber: sire.tagNumber,
    name: sire.name,
    breed: sire.breed,
    ageDays,
    currentWeightKg: sire.currentWeightKg,
    score: blockers.length > 0 ? null : score,
    eligible: blockers.length === 0,
    inbreedingCoefficient: f,
    band,
    pedigreeCompleteness: completeness,
    relationshipLabel: relationship.label,
    breedingsLastYear,
    conceptionRate,
    components: {
      geneticDistance: Math.round(geneticDistance * 10) / 10,
      diversity: Math.round(diversity * 10) / 10,
      phenotype: Math.round(phenotype * 10) / 10,
      health: Math.round(health * 10) / 10,
      loadPenalty: Math.round(loadPenalty * 10) / 10,
    },
    blockers,
    warnings,
    explanation: explain({ f, diversity, breedingsLastYear, sameBreed: sire.breed === dam.breed, blockers, warnings }),
  };
}

/**
 * Phenotype complementarity (§4.2). Deliberately conservative: without
 * genomic data the honest signals are breed consistency, body condition,
 * and recorded defects, so the score stays near the middle rather than
 * inventing confidence the data cannot support.
 */
function phenotypeScore(dam: CandidateRow, sire: CandidateRow): number {
  const parts: number[] = [];

  // Breed consistency matters for a purebred programme; a cross is a valid
  // choice rather than a fault, so it scores mid rather than low.
  parts.push(sire.breed === dam.breed ? 1 : 0.6);

  // Body condition: closeness to the ideal 3 on the standard 1–5 scale.
  if (sire.bodyConditionScore !== null) {
    parts.push(Math.max(0, 1 - Math.abs(sire.bodyConditionScore - IDEAL_BODY_CONDITION_SCORE) / 2));
  } else {
    parts.push(0.6);
  }

  // Complementarity: a boar in good condition partly offsets a dam that is
  // under- or over-conditioned, which is the sense in which the spec asks for
  // traits to "complement".
  if (dam.bodyConditionScore !== null && sire.bodyConditionScore !== null) {
    const damGap = Math.abs(dam.bodyConditionScore - IDEAL_BODY_CONDITION_SCORE);
    const sireGap = Math.abs(sire.bodyConditionScore - IDEAL_BODY_CONDITION_SCORE);
    parts.push(damGap > 0 && sireGap === 0 ? 1 : 0.75);
  }

  parts.push(sire.congenitalDefects ? 0.2 : 1);

  return parts.reduce((sum, value) => sum + value, 0) / parts.length;
}

function explain({
  f,
  diversity,
  breedingsLastYear,
  sameBreed,
  blockers,
  warnings,
}: {
  f: number;
  diversity: number;
  breedingsLastYear: number;
  sameBreed: boolean;
  blockers: string[];
  warnings: string[];
}): string {
  if (blockers.length > 0) return blockers[0];

  const bits: string[] = [];
  bits.push(
    f <= 0.0001
      ? "No shared ancestry on record"
      : `Inbreeding coefficient ${(f * 100).toFixed(1)}%`
  );
  if (diversity >= 90) bits.push("distinct bloodlines");
  else if (diversity >= 60) bits.push("largely distinct bloodlines");
  if (breedingsLastYear === 0) bits.push("not used this year");
  else bits.push(`used ${breedingsLastYear}× this year`);
  if (sameBreed) bits.push("same breed");
  if (warnings.length > 0) bits.push(warnings[0].toLowerCase());

  return bits.join(", ");
}

/**
 * Per-animal health score in 0–1, from the last year of health records.
 * Severity-weighted, with reproductive problems weighing heaviest — a boar
 * with a fertility history is the one case where the health component should
 * dominate a breeding decision.
 */
async function loadHealthScores(farmId: string, since: Date): Promise<Map<string, number>> {
  const records = await prisma.healthRecord.groupBy({
    by: ["animalId", "severity", "category"],
    where: { farmId, recordedAt: { gte: since }, recordType: { in: ["ILLNESS", "INJURY"] } },
    _count: { _all: true },
  });

  const scores = new Map<string, number>();

  for (const row of records) {
    // Batch-level treatments carry no individual animal to score.
    if (!row.animalId) continue;
    const penaltyPerCase =
      row.severity === "SEVERE" ? 0.2 : row.severity === "MODERATE" ? 0.1 : 0.05;
    const categoryMultiplier = row.category === "REPRODUCTIVE" ? 2 : 1;
    const current = scores.get(row.animalId) ?? 1;
    scores.set(
      row.animalId,
      current - penaltyPerCase * categoryMultiplier * row._count._all
    );
  }

  for (const [animalId, score] of scores) {
    scores.set(animalId, Math.max(0, score));
  }

  return scores;
}

/**
 * Conception rate per sire over all breedings that have reached an outcome.
 * Pending breedings are excluded rather than counted as failures — a mating
 * from last week is not evidence of infertility.
 */
async function loadConceptionRates(farmId: string): Promise<Map<string, number | null>> {
  const rows = await prisma.breedingRecord.groupBy({
    by: ["sireId", "pregnancyStatus"],
    where: { farmId, pregnancyStatus: { not: "PENDING" } },
    _count: { _all: true },
  });

  const totals = new Map<string, { conceived: number; total: number }>();

  for (const row of rows) {
    const entry = totals.get(row.sireId) ?? { conceived: 0, total: 0 };
    entry.total += row._count._all;
    if (row.pregnancyStatus === "CONFIRMED" || row.pregnancyStatus === "FARROWED") {
      entry.conceived += row._count._all;
    }
    totals.set(row.sireId, entry);
  }

  const rates = new Map<string, number | null>();
  for (const [sireId, entry] of totals) {
    // Under three outcomes the rate is noise, not a signal.
    rates.set(sireId, entry.total >= 3 ? entry.conceived / entry.total : null);
  }

  return rates;
}
