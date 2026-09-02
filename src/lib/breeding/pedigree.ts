import { prisma } from "@/lib/prisma";

/**
 * The pedigree is loaded once per request as a flat in-memory index and then
 * walked synchronously.
 *
 * The alternative — recursive database queries per ancestor — is what makes
 * genealogy features slow, and it gets worse exactly where it matters: the
 * match finder evaluates one dam against every eligible boar, and each of those
 * pairings walks both animals' full ancestry. A 200-animal herd is a few
 * kilobytes of (id, parents, birth date), so one query up front turns the whole
 * problem into pure in-memory recursion.
 */

export type PedigreeNode = {
  id: string;
  tagNumber: string;
  name: string | null;
  sex: "MALE" | "FEMALE";
  dateOfBirth: Date;
  motherId: string | null;
  fatherId: string | null;
};

export type PedigreeIndex = Map<string, PedigreeNode>;

/** Loads every animal on the farm, including exited ones — dead ancestors are
 *  still ancestors, and dropping them would silently understate relatedness. */
export async function loadPedigreeIndex(farmId: string): Promise<PedigreeIndex> {
  const rows = await prisma.pig.findMany({
    where: { farmId },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      sex: true,
      dateOfBirth: true,
      motherId: true,
      fatherId: true,
    },
  });

  return new Map(rows.map((row) => [row.id, row]));
}

/** Guards against a data-entry cycle (an animal recorded as its own ancestor)
 *  turning any of the walks below into infinite recursion. */
const MAX_DEPTH = 25;

/**
 * All ancestors of `id`, mapped to the shortest number of generations back at
 * which each appears. Depth 1 is a parent, 2 a grandparent, and so on.
 */
export function ancestorsOf(
  index: PedigreeIndex,
  id: string | null,
  maxDepth = MAX_DEPTH
): Map<string, number> {
  const found = new Map<string, number>();
  if (!id) return found;

  // Breadth-first, so the first time an ancestor is reached is by its shortest
  // path — which is the depth that matters when describing a relationship
  // ("grandfather", not "also a great-great-grandfather by another route").
  let frontier: string[] = [id];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const currentId of frontier) {
      const node = index.get(currentId);
      if (!node) continue;
      for (const parentId of [node.motherId, node.fatherId]) {
        if (!parentId || found.has(parentId) || parentId === id) continue;
        found.set(parentId, depth);
        next.push(parentId);
      }
    }
    frontier = next;
  }

  return found;
}

/** True if `ancestorId` appears anywhere in `descendantId`'s ancestry. */
export function isAncestorOf(
  index: PedigreeIndex,
  ancestorId: string,
  descendantId: string
): boolean {
  return ancestorsOf(index, descendantId).has(ancestorId);
}

export type SiblingKind = "FULL" | "MATERNAL_HALF" | "PATERNAL_HALF" | "NONE";

/**
 * Full siblings share both parents; half siblings share exactly one. Two
 * animals with no recorded parents are not siblings — an unknown parent is
 * unknown, not a match, and treating two nulls as equal would wrongly reject
 * every pairing of newly-purchased stock.
 */
export function siblingKind(
  index: PedigreeIndex,
  aId: string,
  bId: string
): SiblingKind {
  const a = index.get(aId);
  const b = index.get(bId);
  if (!a || !b) return "NONE";

  const sameMother = a.motherId !== null && a.motherId === b.motherId;
  const sameFather = a.fatherId !== null && a.fatherId === b.fatherId;

  if (sameMother && sameFather) return "FULL";
  if (sameMother) return "MATERNAL_HALF";
  if (sameFather) return "PATERNAL_HALF";
  return "NONE";
}

export type RelationshipKind =
  | "SELF"
  | "PARENT_OFFSPRING"
  | "FULL_SIBLING"
  | "HALF_SIBLING"
  | "ANCESTOR_DESCENDANT"
  | "RELATED"
  | "UNRELATED";

export type Relationship = {
  kind: RelationshipKind;
  /** Human-readable, for explaining a rejection to the person on the screen. */
  label: string;
};

/**
 * Classifies how two animals are related. Ordered most-specific first, so a
 * pairing that is both parent-offspring and (through an inbred line) distantly
 * related is reported as the parent-offspring relationship, which is the one
 * the user needs to see.
 */
export function classifyRelationship(
  index: PedigreeIndex,
  aId: string,
  bId: string
): Relationship {
  if (aId === bId) return { kind: "SELF", label: "The same animal" };

  const a = index.get(aId);
  const b = index.get(bId);
  if (!a || !b) return { kind: "UNRELATED", label: "No shared ancestry on record" };

  if (a.motherId === bId || a.fatherId === bId || b.motherId === aId || b.fatherId === aId) {
    return { kind: "PARENT_OFFSPRING", label: "Parent and offspring" };
  }

  const sibling = siblingKind(index, aId, bId);
  if (sibling === "FULL") return { kind: "FULL_SIBLING", label: "Full siblings" };
  if (sibling === "MATERNAL_HALF") {
    return { kind: "HALF_SIBLING", label: "Half siblings (same dam)" };
  }
  if (sibling === "PATERNAL_HALF") {
    return { kind: "HALF_SIBLING", label: "Half siblings (same sire)" };
  }

  const aAncestors = ancestorsOf(index, aId);
  const bAncestors = ancestorsOf(index, bId);

  if (bAncestors.has(aId)) {
    return {
      kind: "ANCESTOR_DESCENDANT",
      label: `Direct ancestor (${bAncestors.get(aId)} generations back)`,
    };
  }
  if (aAncestors.has(bId)) {
    return {
      kind: "ANCESTOR_DESCENDANT",
      label: `Direct descendant (${aAncestors.get(bId)} generations forward)`,
    };
  }

  const shared: string[] = [];
  for (const ancestorId of aAncestors.keys()) {
    if (bAncestors.has(ancestorId)) shared.push(ancestorId);
  }

  if (shared.length === 0) {
    return { kind: "UNRELATED", label: "No shared ancestry on record" };
  }

  const closest = Math.min(
    ...shared.map((id) => Math.max(aAncestors.get(id)!, bAncestors.get(id)!))
  );

  return {
    kind: "RELATED",
    label: `${shared.length} common ancestor${shared.length === 1 ? "" : "s"}, closest ${closest} generations back`,
  };
}

/**
 * Proportion of the two animals' combined ancestry that is *not* shared —
 * the Jaccard distance between their ancestor sets.
 *
 * This is the spec's "diversity potential" score made measurable. It answers a
 * different question from the inbreeding coefficient: F weighs shared ancestors
 * by how recent they are, so it stays near zero for two animals whose overlap
 * is all far back, while this notices that their family trees are nonetheless
 * drawn from the same small pool. Ranking on F alone lets a herd drift into a
 * genetic bottleneck one acceptable-looking mating at a time.
 *
 * Returns 1 (maximally diverse) when neither animal has recorded ancestry —
 * there is no evidence of overlap, and penalising unknown pedigree would push
 * the finder toward well-documented, already-central animals.
 */
export function ancestryDiversity(index: PedigreeIndex, aId: string, bId: string): number {
  const aAncestors = ancestorsOf(index, aId);
  const bAncestors = ancestorsOf(index, bId);

  if (aAncestors.size === 0 && bAncestors.size === 0) return 1;

  let shared = 0;
  for (const id of aAncestors.keys()) {
    if (bAncestors.has(id)) shared += 1;
  }

  const union = aAncestors.size + bAncestors.size - shared;
  if (union === 0) return 1;

  return 1 - shared / union;
}

/** Generation depth: 0 for a founder, else 1 + the deeper parent. */
export function generationOf(index: PedigreeIndex, id: string, depth = 0): number {
  if (depth > MAX_DEPTH) return depth;
  const node = index.get(id);
  if (!node || (!node.motherId && !node.fatherId)) return 0;

  const mother = node.motherId ? generationOf(index, node.motherId, depth + 1) : -1;
  const father = node.fatherId ? generationOf(index, node.fatherId, depth + 1) : -1;

  return Math.max(mother, father) + 1;
}

export type PedigreeTreeNode = {
  id: string | null;
  tagNumber: string;
  name: string | null;
  sex: "MALE" | "FEMALE" | null;
  dateOfBirth: Date | null;
  /** Depth 0 is the animal itself. */
  depth: number;
  mother: PedigreeTreeNode | null;
  father: PedigreeTreeNode | null;
};

/**
 * Builds the ancestry tree for display. Unknown parents become placeholder
 * nodes rather than being omitted, so the visualisation shows the *shape* of
 * what is missing — a half-empty tree is itself the finding when someone is
 * deciding whether a pedigree is complete enough to breed on.
 */
export function buildPedigreeTree(
  index: PedigreeIndex,
  id: string | null,
  generations: number,
  depth = 0
): PedigreeTreeNode | null {
  if (depth > generations) return null;

  if (!id) {
    return {
      id: null,
      tagNumber: "Unknown",
      name: null,
      sex: null,
      dateOfBirth: null,
      depth,
      mother: null,
      father: null,
    };
  }

  const node = index.get(id);
  if (!node) return null;

  return {
    id: node.id,
    tagNumber: node.tagNumber,
    name: node.name,
    sex: node.sex,
    dateOfBirth: node.dateOfBirth,
    depth,
    mother: depth < generations ? buildPedigreeTree(index, node.motherId, generations, depth + 1) : null,
    father: depth < generations ? buildPedigreeTree(index, node.fatherId, generations, depth + 1) : null,
  };
}
