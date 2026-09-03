import type { HealthCategory } from "@prisma/client";
import { addDays } from "@/lib/format";
import { REPRODUCTIVE_FAILURE_DIAGNOSES, findCondition } from "@/lib/health/conditions";

/**
 * Disease-cluster detection (§3.2: "Disease outbreaks (if 3+ animals with same
 * condition in 7 days)").
 *
 * Everything here is pure: it takes rows already loaded by
 * `src/lib/db/health.ts` and returns findings. That keeps the thresholds
 * testable without a database, and keeps the one place that knows how to
 * query health records in the db layer where the project conventions put it.
 *
 * The unit of counting is the ANIMAL, not the record. Three follow-up visits
 * to one coughing pig is one sick pig, not an outbreak; the whole point of the
 * alert is that a condition has jumped between animals.
 */

export type OutbreakCase = {
  pigId: string;
  tagNumber: string;
  diagnosis: string;
  category: HealthCategory;
  recordedAt: Date;
  penId: string | null;
  penName: string | null;
};

export type OutbreakThresholds = {
  /** `FarmSettings.outbreakCaseThreshold` — default 3. */
  caseThreshold: number;
  /** `FarmSettings.outbreakWindowDays` — default 7. */
  windowDays: number;
};

export type AffectedPen = {
  penId: string | null;
  penName: string;
  animalCount: number;
};

export type OutbreakAlert = {
  /** Stable key for React lists and alert acknowledgement. */
  id: string;
  kind: "DIAGNOSIS_CLUSTER" | "REPRODUCTIVE_FAILURE";
  diagnosis: string;
  category: HealthCategory;
  /** Distinct animals affected inside the window. */
  animalCount: number;
  recordCount: number;
  firstSeen: Date;
  lastSeen: Date;
  windowDays: number;
  threshold: number;
  affectedPens: AffectedPen[];
  /** True when the pens involved suggest it is travelling by housing. */
  spreadingAcrossPens: boolean;
  contagious: boolean;
  severity: "WATCH" | "ALERT";
  /** Operator-facing next step. */
  recommendation: string;
  affectedAnimals: { pigId: string; tagNumber: string }[];
};

const UNASSIGNED_PEN = "Unassigned";

/**
 * Groups cases by diagnosis and reports every diagnosis reaching the farm's
 * threshold inside the window.
 *
 * `cases` should already be limited to the window by the caller's query; the
 * window is re-applied here anyway so the function is correct on any input.
 */
export function detectDiagnosisClusters(
  cases: readonly OutbreakCase[],
  { caseThreshold, windowDays }: OutbreakThresholds,
  asOf: Date = new Date()
): OutbreakAlert[] {
  const since = addDays(asOf, -windowDays);
  const inWindow = cases.filter((c) => c.recordedAt >= since && c.recordedAt <= asOf);

  const byDiagnosis = new Map<string, OutbreakCase[]>();
  for (const item of inWindow) {
    const list = byDiagnosis.get(item.diagnosis);
    if (list) list.push(item);
    else byDiagnosis.set(item.diagnosis, [item]);
  }

  const alerts: OutbreakAlert[] = [];

  for (const [diagnosis, group] of byDiagnosis) {
    const animals = distinctAnimals(group);
    if (animals.length < caseThreshold) continue;

    alerts.push(
      buildAlert({
        kind: "DIAGNOSIS_CLUSTER",
        id: `cluster:${diagnosis}`,
        diagnosis,
        group,
        animals,
        caseThreshold,
        windowDays,
      })
    );
  }

  // Worst first: most animals, then most recent.
  alerts.sort(
    (a, b) => b.animalCount - a.animalCount || b.lastSeen.getTime() - a.lastSeen.getTime()
  );
  return alerts;
}

/**
 * Reproductive failures cluster across *different* diagnoses — three abortions
 * and two stillbirths in a week is one problem, but no single diagnosis hits
 * the threshold, so `detectDiagnosisClusters` would stay silent. This pools
 * them (§3.2, "potential genetic defects in offspring clusters" and the
 * fertility alerts alongside it).
 */
export function detectReproductiveFailureCluster(
  cases: readonly OutbreakCase[],
  { caseThreshold, windowDays }: OutbreakThresholds,
  asOf: Date = new Date()
): OutbreakAlert | null {
  const since = addDays(asOf, -windowDays);
  const failures = cases.filter(
    (c) =>
      c.recordedAt >= since &&
      c.recordedAt <= asOf &&
      REPRODUCTIVE_FAILURE_DIAGNOSES.includes(c.diagnosis)
  );

  const animals = distinctAnimals(failures);
  if (animals.length < caseThreshold) return null;

  // A single diagnosis reaching threshold on its own is already reported by
  // the cluster detector; only pool when the mix is what makes the number.
  const distinctDiagnoses = new Set(failures.map((f) => f.diagnosis));
  if (distinctDiagnoses.size < 2) return null;

  return buildAlert({
    kind: "REPRODUCTIVE_FAILURE",
    id: "cluster:reproductive-failure",
    diagnosis: `Reproductive failures (${[...distinctDiagnoses].join(", ")})`,
    group: failures,
    animals,
    caseThreshold,
    windowDays,
    categoryOverride: "REPRODUCTIVE",
    recommendationOverride:
      "Review the breeding herd: check vaccination status, gestation feeding and body condition, and submit material for diagnosis. Look for a common sire or a common service week before assuming disease.",
  });
}

export type MortalitySpike = {
  /** Deaths inside the recent window. */
  recentDeaths: number;
  /** Deaths in the equal-length window immediately before it. */
  baselineDeaths: number;
  /** Mean deaths per window over the baseline period. */
  baselineAverage: number;
  windowDays: number;
  baselineWindowDays: number;
  /** recentDeaths / baselineAverage, or null when the baseline is zero. */
  ratio: number | null;
  flagged: boolean;
  reason: string | null;
};

/**
 * Flags a sudden mortality increase: the recent window against the preceding
 * baseline, expressed per window so the two are comparable.
 *
 * Two conditions, because either alone misfires on a small farm. A ratio test
 * alone turns 0 baseline deaths into a division by zero and 1 death into an
 * "infinite increase"; an absolute test alone never fires on a unit that
 * normally loses several animals a week. So: at least `minimumDeaths` in the
 * window AND at least `spikeMultiple` times the baseline rate — or any deaths
 * at all when the baseline is genuinely zero and the count clears the minimum.
 */
export function detectMortalitySpike(
  deathDates: readonly Date[],
  {
    windowDays = 7,
    baselineWindowDays = 28,
    spikeMultiple = 2,
    minimumDeaths = 2,
    asOf = new Date(),
  }: {
    windowDays?: number;
    baselineWindowDays?: number;
    spikeMultiple?: number;
    minimumDeaths?: number;
    asOf?: Date;
  } = {}
): MortalitySpike {
  const windowStart = addDays(asOf, -windowDays);
  const baselineStart = addDays(windowStart, -baselineWindowDays);

  const recentDeaths = deathDates.filter((d) => d >= windowStart && d <= asOf).length;
  const baselineDeaths = deathDates.filter((d) => d >= baselineStart && d < windowStart).length;

  const baselineAverage = (baselineDeaths / baselineWindowDays) * windowDays;
  const ratio = baselineAverage > 0 ? recentDeaths / baselineAverage : null;

  let flagged = false;
  let reason: string | null = null;

  if (recentDeaths >= minimumDeaths) {
    if (ratio === null) {
      flagged = true;
      reason = `${recentDeaths} deaths in the last ${windowDays} days, against none in the preceding ${baselineWindowDays} days.`;
    } else if (ratio >= spikeMultiple) {
      flagged = true;
      reason = `${recentDeaths} deaths in the last ${windowDays} days — ${ratio.toFixed(
        1
      )}× the preceding ${baselineWindowDays}-day rate of ${baselineAverage.toFixed(
        1
      )} per ${windowDays} days.`;
    }
  }

  return {
    recentDeaths,
    baselineDeaths,
    baselineAverage,
    windowDays,
    baselineWindowDays,
    ratio,
    flagged,
    reason,
  };
}

// ---------------------------------------------------------------------------

function distinctAnimals(group: readonly OutbreakCase[]): { pigId: string; tagNumber: string }[] {
  const seen = new Map<string, string>();
  for (const item of group) {
    if (!seen.has(item.pigId)) seen.set(item.pigId, item.tagNumber);
  }
  return [...seen].map(([pigId, tagNumber]) => ({ pigId, tagNumber }));
}

function summarisePens(group: readonly OutbreakCase[]): AffectedPen[] {
  const pens = new Map<string, { penId: string | null; penName: string; pigIds: Set<string> }>();
  for (const item of group) {
    const mapKey = item.penId ?? "__none__";
    const entry = pens.get(mapKey) ?? {
      penId: item.penId,
      penName: item.penName ?? UNASSIGNED_PEN,
      pigIds: new Set<string>(),
    };
    entry.pigIds.add(item.pigId);
    pens.set(mapKey, entry);
  }
  return [...pens.values()]
    .map((entry) => ({
      penId: entry.penId,
      penName: entry.penName,
      animalCount: entry.pigIds.size,
    }))
    .sort((a, b) => b.animalCount - a.animalCount);
}

function buildAlert({
  kind,
  id,
  diagnosis,
  group,
  animals,
  caseThreshold,
  windowDays,
  categoryOverride,
  recommendationOverride,
}: {
  kind: OutbreakAlert["kind"];
  id: string;
  diagnosis: string;
  group: readonly OutbreakCase[];
  animals: { pigId: string; tagNumber: string }[];
  caseThreshold: number;
  windowDays: number;
  categoryOverride?: HealthCategory;
  recommendationOverride?: string;
}): OutbreakAlert {
  const times = group.map((g) => g.recordedAt.getTime());
  const affectedPens = summarisePens(group);
  const namedPens = affectedPens.filter((p) => p.penId !== null);
  const spreadingAcrossPens = namedPens.length > 1;
  const contagious = findCondition(diagnosis)?.contagious ?? false;
  const category = categoryOverride ?? group[0]?.category ?? "OTHER";

  return {
    id,
    kind,
    diagnosis,
    category,
    animalCount: animals.length,
    recordCount: group.length,
    firstSeen: new Date(Math.min(...times)),
    lastSeen: new Date(Math.max(...times)),
    windowDays,
    threshold: caseThreshold,
    affectedPens,
    spreadingAcrossPens,
    contagious,
    severity: animals.length >= caseThreshold * 2 || spreadingAcrossPens ? "ALERT" : "WATCH",
    recommendation:
      recommendationOverride ?? isolationRecommendation(diagnosis, contagious, affectedPens),
    affectedAnimals: animals,
  };
}

/**
 * Biosecurity advice (§3.2). Contagious and confined to one pen: isolate that
 * pen. Contagious and already in more than one: it has moved, so the advice
 * shifts from "isolate the animals" to "stop the traffic between pens". Not
 * contagious: the pen is the clue, not the vector — a cluster of lameness or
 * tail biting in one pen is a housing or management failure.
 */
export function isolationRecommendation(
  diagnosis: string,
  contagious: boolean,
  affectedPens: readonly AffectedPen[]
): string {
  const named = affectedPens.filter((p) => p.penId !== null);
  const penList = named.map((p) => p.penName).join(", ") || UNASSIGNED_PEN;

  if (!contagious) {
    return named.length <= 1
      ? `Not a contagious condition. Concentrated in ${penList} — inspect that pen's flooring, stocking density, ventilation and feeder access before treating individuals.`
      : `Not a contagious condition, but present in ${named.length} pens (${penList}) — look for a shared cause such as a feed batch, a water line or a recent procedure.`;
  }

  if (named.length <= 1) {
    return `Contagious. Move affected animals to an isolation pen, stop movements in and out of ${penList}, and clean and disinfect before restocking. Handle this pen last on the daily round.`;
  }

  return `Contagious and already in ${named.length} pens (${penList}) — it is spreading by housing. Isolate affected animals, halt all pen-to-pen movement and mixing, use dedicated boots and equipment per pen, and work from youngest and healthiest to oldest and sickest. Call the vet: this warrants a herd-level plan, not individual treatment.`;
}
