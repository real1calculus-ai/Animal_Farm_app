import type { PedigreeIndex } from "@/lib/breeding/pedigree";

/**
 * Wright's coefficient of inbreeding (F), computed through the coancestry
 * (kinship) recursion rather than by enumerating paths.
 *
 * The textbook path formula — F_X = Σ (1/2)^(n1+n2+1) · (1 + F_A) over every
 * path through every common ancestor A — is the definition, but implementing it
 * literally means enumerating paths, and the number of paths explodes in
 * exactly the case that matters: a herd that has been line-bred for several
 * generations. The kinship recursion below is mathematically equivalent and
 * linear in the size of the pedigree once memoised:
 *
 *     f(i, i) = ½ · (1 + F_i)
 *     f(i, j) = ½ · (f(sire_i, j) + f(dam_i, j))     expanding the younger of the two
 *     f(i, j) = 0                                     if either animal is unknown
 *     F_x     = f(sire_x, dam_x)
 *
 * It picks up multiple paths and inbred common ancestors automatically, which
 * is where hand-rolled path counting usually goes wrong.
 *
 * Unknown parents are treated as unrelated founders. That is the standard
 * assumption, and it biases F *downward*: an animal with a shallow recorded
 * pedigree will look less inbred than it is. Callers should show pedigree
 * completeness alongside F rather than reading a low number as reassurance —
 * `pedigreeCompleteness()` below exists for exactly that.
 */

export type InbreedingCalculator = {
  /** Coancestry between two animals — the F their offspring would have. */
  kinship: (aId: string | null, bId: string | null) => number;
  /** Wright's F for an existing animal. */
  inbreedingOf: (id: string) => number;
  /** F of the hypothetical offspring of this pairing. */
  offspringInbreeding: (sireId: string, damId: string) => number;
};

const MAX_DEPTH = 25;

export function createInbreedingCalculator(index: PedigreeIndex): InbreedingCalculator {
  const kinshipMemo = new Map<string, number>();
  const inbreedingMemo = new Map<string, number>();

  function kinship(aId: string | null, bId: string | null, depth = 0): number {
    if (!aId || !bId) return 0;
    // A cycle in the data (an animal recorded as its own ancestor) would
    // otherwise recurse forever. Bail out rather than crash the page: the
    // pedigree is bad input, and returning 0 keeps the rest of the herd usable.
    if (depth > MAX_DEPTH) return 0;

    const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    const cached = kinshipMemo.get(key);
    if (cached !== undefined) return cached;

    let result: number;

    if (aId === bId) {
      result = 0.5 * (1 + inbreedingOf(aId, depth));
    } else {
      const a = index.get(aId);
      const b = index.get(bId);
      if (!a || !b) return 0;

      // Expand whichever animal is younger. The recursion is only valid when it
      // walks *up* the pedigree, and expanding an ancestor toward its own
      // parents while the other side stays put would step over the very
      // relationship being measured.
      const expandA =
        a.dateOfBirth.getTime() > b.dateOfBirth.getTime() ||
        // Same recorded birth date (littermates, or dates entered as dates
        // rather than instants): break the tie deterministically so the memo
        // key and the expansion order stay consistent.
        (a.dateOfBirth.getTime() === b.dateOfBirth.getTime() && aId > bId);

      const younger = expandA ? a : b;
      const otherId = expandA ? bId : aId;

      if (!younger.motherId && !younger.fatherId) {
        result = 0;
      } else {
        result =
          0.5 *
          (kinship(younger.motherId, otherId, depth + 1) +
            kinship(younger.fatherId, otherId, depth + 1));
      }
    }

    kinshipMemo.set(key, result);
    return result;
  }

  function inbreedingOf(id: string, depth = 0): number {
    const cached = inbreedingMemo.get(id);
    if (cached !== undefined) return cached;
    if (depth > MAX_DEPTH) return 0;

    const node = index.get(id);
    // A founder, or an animal with only one parent recorded, has F = 0 by the
    // unrelated-founder assumption: with one side unknown there is no path
    // through which alleles could be identical by descent.
    if (!node || !node.motherId || !node.fatherId) {
      inbreedingMemo.set(id, 0);
      return 0;
    }

    // Seed the memo before recursing so a cyclic pedigree terminates instead of
    // re-entering this animal forever.
    inbreedingMemo.set(id, 0);
    const result = kinship(node.motherId, node.fatherId, depth + 1);
    inbreedingMemo.set(id, result);
    return result;
  }

  return {
    kinship: (aId, bId) => kinship(aId, bId, 0),
    inbreedingOf: (id) => inbreedingOf(id, 0),
    // The offspring of a pairing are inbred to the degree their parents are
    // related — F_offspring is by definition the parents' coancestry.
    offspringInbreeding: (sireId, damId) => kinship(sireId, damId, 0),
  };
}

/**
 * Fraction of an animal's ancestor slots that are actually filled, over
 * `generations` generations (2^1 + 2^2 + ... slots).
 *
 * Read F next to this number, never alone: F = 0.00 on a pedigree that is 20%
 * complete means "we don't know", not "unrelated".
 */
export function pedigreeCompleteness(
  index: PedigreeIndex,
  id: string,
  generations = 4
): number {
  let known = 0;
  let total = 0;

  function walk(currentId: string | null, depth: number): void {
    if (depth > generations) return;
    total += 1;
    if (!currentId) return;
    const node = index.get(currentId);
    if (!node) return;
    known += 1;
    walk(node.motherId, depth + 1);
    walk(node.fatherId, depth + 1);
  }

  const root = index.get(id);
  if (!root) return 0;
  walk(root.motherId, 1);
  walk(root.fatherId, 1);

  return total === 0 ? 0 : known / total;
}

export type InbreedingBand = "NONE" | "LOW" | "MODERATE" | "HIGH";

/**
 * Buckets F for display. Thresholds come from the farm's own settings rather
 * than being fixed here — what counts as acceptable depends on how much
 * unrelated breeding stock the farm can actually get hold of.
 */
export function inbreedingBand(
  f: number,
  warnThreshold: number,
  maxThreshold: number
): InbreedingBand {
  if (f <= 0.0001) return "NONE";
  if (f < warnThreshold) return "LOW";
  if (f < maxThreshold) return "MODERATE";
  return "HIGH";
}

export function inbreedingBandVariant(band: InbreedingBand): "success" | "default" | "warning" | "danger" {
  switch (band) {
    case "NONE":
      return "success";
    case "LOW":
      return "default";
    case "MODERATE":
      return "warning";
    case "HIGH":
      return "danger";
  }
}
