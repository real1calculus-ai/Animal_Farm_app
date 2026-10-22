import "server-only";

import { Prisma } from "@prisma/client";
import type { LifeStage, AnimalStatus, Sex } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFarmSettings } from "@/lib/active-farm";
import { deriveLifeStage } from "@/lib/life-stage";
import {
  ancestorsOf,
  generationOf,
  siblingKind,
  type PedigreeIndex,
  type PedigreeNode,
  type SiblingKind,
} from "@/lib/breeding/pedigree";
import { createInbreedingCalculator } from "@/lib/breeding/inbreeding";

/**
 * Shared animal queries. Everything here takes a `farmId` as its first
 * argument rather than resolving one itself — the caller has already done
 * `getActiveFarmId(user)`, and a helper that quietly picked its own farm would
 * be exactly the kind of thing that leaks one tenant's herd into another's
 * screen.
 */

/** Accepts either the global client or a `$transaction` client. */
export type PrismaLike = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type AnimalFilters = {
  /** "ALL" means every status; omitted defaults to ACTIVE at the page level. */
  status?: AnimalStatus | "ALL";
  /** A species id. Omitted means every species the farm keeps. */
  speciesId?: string;
  sex?: Sex;
  breed?: string;
  /** A pen id, or "NONE" for animals with no pen assigned. */
  penId?: string;
  lifeStage?: LifeStage;
  /** Matches tag number or name, case-insensitively. */
  search?: string;
};

const listSelect = {
  id: true,
  tagNumber: true,
  species: { select: { id: true, name: true } },
  name: true,
  breed: true,
  sex: true,
  status: true,
  dateOfBirth: true,
  currentWeightKg: true,
  generation: true,
  inbreedingCoefficient: true,
  pen: { select: { id: true, name: true, housingType: true } },
} satisfies Prisma.AnimalSelect;

export type AnimalListRow = Prisma.AnimalGetPayload<{ select: typeof listSelect }> & {
  lifeStage: LifeStage;
  /** Litters farrowed. Always 0 for males. */
  parity: number;
};

/**
 * The herd list.
 *
 * Life stage is derived, not stored (see src/lib/life-stage.ts), so the stage
 * filter is applied in memory after derivation rather than in SQL. That is the
 * honest trade: pushing it into the query would mean storing a copy of a value
 * that goes stale the first time nobody remembers to update it.
 *
 * Deliberately does NOT load pedigree — this screen is opened dozens of times
 * a day on a phone, and ancestry walking belongs on the pages that show it.
 */
export async function listAnimals(
  farmId: string,
  filters: AnimalFilters = {}
): Promise<AnimalListRow[]> {
  const where: Prisma.AnimalWhereInput = { farmId };

  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.speciesId) where.speciesId = filters.speciesId;
  if (filters.sex) where.sex = filters.sex;
  if (filters.breed) where.breed = filters.breed;
  if (filters.penId === "NONE") where.penId = null;
  else if (filters.penId) where.penId = filters.penId;

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { tagNumber: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  const [animals, parity, settings] = await Promise.all([
    prisma.animal.findMany({ where, select: listSelect, orderBy: { tagNumber: "asc" } }),
    getParityMap(farmId),
    getFarmSettings(farmId),
  ]);

  const rows: AnimalListRow[] = animals.map((animal) => {
    const animalParity = animal.sex === "FEMALE" ? (parity.get(animal.id) ?? 0) : 0;
    return {
      ...animal,
      parity: animalParity,
      lifeStage: deriveLifeStage({
        dateOfBirth: animal.dateOfBirth,
        sex: animal.sex,
        parity: animalParity,
        weaningAgeDays: settings.weaningAgeDays,
        minBreedingAgeDays:
          animal.sex === "FEMALE"
            ? settings.minBreedingAgeDaysFemale
            : settings.minBreedingAgeDaysMale,
      }),
    };
  });

  return filters.lifeStage ? rows.filter((row) => row.lifeStage === filters.lifeStage) : rows;
}

/**
 * Litters farrowed per dam. One query for the whole farm rather than a count
 * per animal, because the herd list needs this for every row at once and per-
 * row counting is what turns a 200-animal list into 200 round trips.
 */
export async function getParityMap(farmId: string): Promise<Map<string, number>> {
  const litters = await prisma.litter.findMany({
    where: { breedingRecord: { farmId } },
    select: { breedingRecord: { select: { damId: true } } },
  });

  const counts = new Map<string, number>();
  for (const litter of litters) {
    const damId = litter.breedingRecord.damId;
    counts.set(damId, (counts.get(damId) ?? 0) + 1);
  }
  return counts;
}

export async function getParityOf(farmId: string, animalId: string): Promise<number> {
  return prisma.litter.count({
    where: { breedingRecord: { farmId, damId: animalId } },
  });
}

/** Distinct breeds and the pens that can be filtered/moved to. */
export async function getAnimalFilterOptions(farmId: string) {
  // Species comes from what the farm actually keeps, not from what its animals
  // happen to be: a farm that keeps goats but has not entered one yet should
  // still be able to filter for them and see the empty state, rather than
  // wonder where the option went.
  const [breeds, pens, species] = await Promise.all([
    prisma.animal.findMany({
      where: { farmId },
      distinct: ["breed"],
      select: { breed: true },
      orderBy: { breed: "asc" },
    }),
    listPensWithOccupancy(farmId),
    prisma.species.findMany({
      where: { farmId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { breeds: breeds.map((row) => row.breed), pens, species };
}

export type PenOption = {
  id: string;
  name: string;
  housingType: string;
  capacity: number;
  occupancy: number;
};

/**
 * Pens with their live headcount, so a move can be refused before it overfills
 * one. Occupancy counts ACTIVE animals only — a pen is not full of animals that
 * have been sold out of it.
 */
export async function listPensWithOccupancy(farmId: string): Promise<PenOption[]> {
  const pens = await prisma.pen.findMany({
    where: { farmId, isActive: true },
    select: {
      id: true,
      name: true,
      housingType: true,
      capacity: true,
      _count: { select: { animals: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { name: "asc" },
  });

  return pens.map((pen) => ({
    id: pen.id,
    name: pen.name,
    housingType: pen.housingType,
    capacity: pen.capacity,
    occupancy: pen._count.animals,
  }));
}

// ---------------------------------------------------------------------------
// One animal, with everything the record page shows
// ---------------------------------------------------------------------------

const detailInclude = {
  pen: { select: { id: true, name: true, housingType: true, capacity: true } },
  mother: { select: { id: true, tagNumber: true, name: true, breed: true, status: true } },
  father: { select: { id: true, tagNumber: true, name: true, breed: true, status: true } },
  litter: {
    select: {
      id: true,
      farrowingDate: true,
      bornAlive: true,
      stillborn: true,
      weaningDate: true,
      weanedCount: true,
      breedingRecord: {
        select: {
          id: true,
          dam: { select: { id: true, tagNumber: true, name: true } },
          sire: { select: { id: true, tagNumber: true, name: true } },
        },
      },
    },
  },
  offspringAsMother: {
    select: { id: true, tagNumber: true, name: true, sex: true, status: true, dateOfBirth: true },
    orderBy: { dateOfBirth: "desc" },
  },
  offspringAsFather: {
    select: { id: true, tagNumber: true, name: true, sex: true, status: true, dateOfBirth: true },
    orderBy: { dateOfBirth: "desc" },
  },
  weightRecords: {
    select: {
      id: true,
      recordedAt: true,
      weightKg: true,
      bodyConditionScore: true,
      notes: true,
      recordedBy: { select: { name: true } },
    },
    orderBy: { recordedAt: "asc" },
  },
  penMovements: {
    select: {
      id: true,
      movedAt: true,
      fromPenName: true,
      toPenName: true,
      reason: true,
      movedBy: { select: { name: true } },
    },
    orderBy: { movedAt: "desc" },
  },
  healthRecords: {
    select: {
      id: true,
      recordedAt: true,
      recordType: true,
      category: true,
      severity: true,
      diagnosis: true,
      outcome: true,
      resolvedAt: true,
    },
    orderBy: { recordedAt: "desc" },
    take: 20,
  },
  vaccinationRecords: {
    select: { id: true, vaccineName: true, administeredAt: true, nextDueDate: true },
    orderBy: { administeredAt: "desc" },
    take: 10,
  },
  breedingsAsDam: {
    select: {
      id: true,
      breedingDate: true,
      method: true,
      pregnancyStatus: true,
      expectedFarrowingDate: true,
      offspringInbreedingCoefficient: true,
      sire: { select: { id: true, tagNumber: true, name: true } },
      dam: { select: { id: true, tagNumber: true, name: true } },
    },
    orderBy: { breedingDate: "desc" },
  },
  breedingsAsSire: {
    select: {
      id: true,
      breedingDate: true,
      method: true,
      pregnancyStatus: true,
      expectedFarrowingDate: true,
      offspringInbreedingCoefficient: true,
      sire: { select: { id: true, tagNumber: true, name: true } },
      dam: { select: { id: true, tagNumber: true, name: true } },
    },
    orderBy: { breedingDate: "desc" },
  },
} satisfies Prisma.AnimalInclude;

export type AnimalDetail = Prisma.AnimalGetPayload<{ include: typeof detailInclude }>;

export async function getAnimalWithRelations(
  farmId: string,
  id: string
): Promise<AnimalDetail | null> {
  return prisma.animal.findFirst({ where: { id, farmId }, include: detailInclude });
}

/** The plain row, for the edit form. */
export async function getAnimal(farmId: string, id: string) {
  return prisma.animal.findFirst({ where: { id, farmId } });
}

/**
 * Every animal on the farm, trimmed to what a parent picker needs. The picker
 * filters by sex and birth date on the client for responsiveness, but the
 * Server Action re-checks both — a select is a suggestion, not a constraint.
 */
export async function listParentCandidates(farmId: string) {
  return prisma.animal.findMany({
    where: { farmId },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      sex: true,
      status: true,
      dateOfBirth: true,
      breed: true,
    },
    orderBy: { tagNumber: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Siblings
// ---------------------------------------------------------------------------

export type SiblingGroups = {
  full: PedigreeNode[];
  maternalHalf: PedigreeNode[];
  paternalHalf: PedigreeNode[];
};

/**
 * Walks the farm's pedigree index once and buckets every other animal by how
 * it is related. `siblingKind` is the single definition of "sibling" in this
 * codebase — including its refusal to treat two unknown parents as a match.
 */
export function findSiblings(index: PedigreeIndex, id: string): SiblingGroups {
  const groups: SiblingGroups = { full: [], maternalHalf: [], paternalHalf: [] };

  for (const node of index.values()) {
    if (node.id === id) continue;
    const kind: SiblingKind = siblingKind(index, id, node.id);
    if (kind === "FULL") groups.full.push(node);
    else if (kind === "MATERNAL_HALF") groups.maternalHalf.push(node);
    else if (kind === "PATERNAL_HALF") groups.paternalHalf.push(node);
  }

  const byTag = (a: PedigreeNode, b: PedigreeNode) => a.tagNumber.localeCompare(b.tagNumber);
  groups.full.sort(byTag);
  groups.maternalHalf.sort(byTag);
  groups.paternalHalf.sort(byTag);

  return groups;
}

// ---------------------------------------------------------------------------
// Generation / inbreeding recompute
// ---------------------------------------------------------------------------

/**
 * Loads the pedigree index through a specific client.
 *
 * `loadPedigreeIndex()` in the breeding lib always uses the global client,
 * which is right for read paths but wrong inside a `$transaction`: the rows
 * just written would not be visible, and the animal being created would be
 * missing from its own recompute.
 */
async function loadIndexWith(client: PrismaLike, farmId: string): Promise<PedigreeIndex> {
  const rows = await client.animal.findMany({
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

/** Everything downstream of `roots`, plus the roots themselves. */
function withDescendants(index: PedigreeIndex, roots: string[]): Set<string> {
  const affected = new Set(roots.filter((id) => index.has(id)));

  // Repeated sweeps rather than a child index: a farm-sized herd is a few
  // hundred rows, and the loop terminates because `changed` can only flip
  // while the set is still growing.
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of index.values()) {
      if (affected.has(node.id)) continue;
      if (
        (node.motherId && affected.has(node.motherId)) ||
        (node.fatherId && affected.has(node.fatherId))
      ) {
        affected.add(node.id);
        changed = true;
      }
    }
  }

  return affected;
}

/**
 * Recomputes and stores `generation` and `inbreedingCoefficient` for the given
 * animals *and every descendant of theirs*.
 *
 * The descendants matter: re-parenting an animal changes the ancestry of
 * everything below it, and leaving those rows on their old cached F is how a
 * herd ends up making breeding decisions on numbers that were true last month.
 *
 * Other modules call this too — registering a litter creates offspring whose
 * generation and F are only knowable once their parents are attached.
 */
export async function recomputePedigreeMetrics(
  farmId: string,
  rootIds: string[],
  client: PrismaLike = prisma
): Promise<void> {
  if (rootIds.length === 0) return;

  const index = await loadIndexWith(client, farmId);
  const affected = withDescendants(index, rootIds);
  if (affected.size === 0) return;

  const calculator = createInbreedingCalculator(index);

  for (const id of affected) {
    await client.animal.update({
      where: { id },
      data: {
        generation: generationOf(index, id),
        inbreedingCoefficient: calculator.inbreedingOf(id),
      },
    });
  }
}

/**
 * Ancestry validation shared by the create and edit actions (§8.1).
 *
 * Returns a human-readable reason, or null when the parentage is acceptable.
 * `childId` is null on create — there is no row yet, so the cycle check has
 * nothing to walk and the date checks carry the weight.
 */
export function validateParentage({
  index,
  childId,
  dateOfBirth,
  motherId,
  fatherId,
}: {
  index: PedigreeIndex;
  childId: string | null;
  dateOfBirth: Date;
  motherId: string | null;
  fatherId: string | null;
}): string | null {
  if (motherId && motherId === fatherId) {
    return "The same animal cannot be recorded as both dam and sire.";
  }

  for (const [parentId, role, expectedSex] of [
    [motherId, "Dam", "FEMALE"],
    [fatherId, "Sire", "MALE"],
  ] as const) {
    if (!parentId) continue;

    if (childId && parentId === childId) {
      return `An animal cannot be its own ${role.toLowerCase()}.`;
    }

    const parent = index.get(parentId);
    if (!parent) return `The selected ${role.toLowerCase()} is not an animal on this farm.`;

    if (parent.sex !== expectedSex) {
      return `${role} ${parent.tagNumber} is ${parent.sex === "MALE" ? "male" : "female"} — a ${role.toLowerCase()} must be ${expectedSex === "FEMALE" ? "female" : "male"}.`;
    }

    if (parent.dateOfBirth.getTime() > dateOfBirth.getTime()) {
      return `${role} ${parent.tagNumber} was born after this animal — a parent cannot be younger than its offspring.`;
    }

    // The cycle check. A data-entry slip here does not corrupt one row, it
    // corrupts every inbreeding number computed through that loop afterwards.
    if (childId && ancestorsOf(index, parentId).has(childId)) {
      return `${parent.tagNumber} is a descendant of this animal, so it cannot also be its ${role.toLowerCase()}.`;
    }
  }

  return null;
}

/**
 * Ids of everything descended from `id` (not including `id` itself). Used by
 * the edit form to keep an animal's own descendants out of its parent pickers
 * — the UI half of the cycle check in `validateParentage`.
 */
export function descendantIdsOf(index: PedigreeIndex, id: string): string[] {
  const affected = withDescendants(index, [id]);
  affected.delete(id);
  return [...affected];
}
