import "server-only";

import { prisma } from "@/lib/prisma";
import type { Species } from "@prisma/client";
import { SPECIES_CATALOGUE } from "@/lib/species-catalogue";

export { SPECIES_CATALOGUE, speciesTerms, type SpeciesSeed } from "@/lib/species-catalogue";

export async function listSpecies(farmId: string, { activeOnly = true } = {}): Promise<Species[]> {
  return prisma.species.findMany({
    where: { farmId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ purpose: "asc" }, { name: "asc" }],
  });
}

export async function getSpecies(farmId: string, id: string): Promise<Species | null> {
  return prisma.species.findFirst({ where: { id, farmId } });
}

/**
 * Installs the catalogue for a farm that has none. Idempotent — skips any
 * species already present by code, so a farm that has renamed or edited one
 * keeps its version.
 */
export async function ensureSpeciesCatalogue(farmId: string): Promise<Species[]> {
  const existing = await prisma.species.findMany({ where: { farmId }, select: { code: true } });
  const have = new Set(existing.map((row) => row.code));

  const missing = SPECIES_CATALOGUE.filter((entry) => !have.has(entry.code));
  if (missing.length > 0) {
    await prisma.species.createMany({
      data: missing.map((entry) => ({ ...entry, farmId })),
      skipDuplicates: true,
    });
  }

  return listSpecies(farmId, { activeOnly: false });
}

/**
 * Species an animal can be recorded as individually. BATCH species are
 * excluded: a broiler flock is a batch, and offering "Broiler chicken" on the
 * single-animal form invites someone to create three hundred rows by hand.
 * WORKING species are included — a guard dog is an individual.
 */
export async function listIndividualSpecies(farmId: string): Promise<Species[]> {
  return prisma.species.findMany({
    where: { farmId, isActive: true, trackingMode: { in: ["INDIVIDUAL", "HYBRID"] } },
    orderBy: [{ purpose: "asc" }, { name: "asc" }],
  });
}

/**
 * The species to assume when the form did not name one — and only when there
 * is exactly one it could possibly mean. A farm keeping nothing but goats
 * should not be made to pick "Goat" on every animal; a farm keeping goats and
 * pigs must not have one chosen for it behind its back.
 *
 * This replaced a getDefaultSpecies() that took `orderBy: { createdAt: "asc" }`.
 * The whole catalogue was inserted in one createMany at signup, so all eleven
 * rows shared a createdAt and Postgres returned an arbitrary winner: every
 * animal added through the UI got a species nobody chose, and since the list
 * screen never showed species, a sow stored as a rabbit looked completely
 * normal.
 */
export async function getSoleLivestockSpecies(farmId: string): Promise<Species | null> {
  // take: 2 is the whole point — we need to know "exactly one", not "a first".
  const candidates = await prisma.species.findMany({
    where: {
      farmId,
      isActive: true,
      purpose: "LIVESTOCK",
      trackingMode: { in: ["INDIVIDUAL", "HYBRID"] },
    },
    orderBy: { name: "asc" },
    take: 2,
  });

  return candidates.length === 1 ? candidates[0] : null;
}


export type SpeciesWithUsage = Species & {
  /** Animals on the farm of this species, whatever their status. */
  animalCount: number;
  /** Batches of this species, whatever their status. */
  batchCount: number;
};

/**
 * The farm's species with enough usage information to decide whether one can
 * safely be switched off. Counts ignore status deliberately: a sold animal is
 * still a record that reads "Goat", and turning the species off underneath it
 * would leave the history describing something the farm says it never kept.
 */
export async function listSpeciesWithUsage(farmId: string): Promise<SpeciesWithUsage[]> {
  const species = await prisma.species.findMany({
    where: { farmId },
    orderBy: [{ purpose: "asc" }, { name: "asc" }],
    include: { _count: { select: { animals: true, batches: true } } },
  });

  return species.map(({ _count, ...rest }) => ({
    ...rest,
    animalCount: _count.animals,
    batchCount: _count.batches,
  }));
}

/**
 * Switches species on and off to match what the farm says it keeps.
 *
 * Deactivating is the dangerous direction, so it is the one that is checked: a
 * species carrying animals or batches stays on, and the caller is told which.
 * Nothing is ever deleted — `Animal.species` is `onDelete: Restrict` and the
 * history has to keep reading correctly years later.
 */
export async function setActiveSpecies(
  farmId: string,
  activeIds: string[]
): Promise<{ blocked: string[] }> {
  const all = await listSpeciesWithUsage(farmId);
  const wanted = new Set(activeIds);

  const blocked = all
    .filter((s) => !wanted.has(s.id) && s.animalCount + s.batchCount > 0)
    .map((s) => s.name);

  const toDeactivate = all
    .filter((s) => !wanted.has(s.id) && s.animalCount + s.batchCount === 0)
    .map((s) => s.id);
  const toActivate = all.filter((s) => wanted.has(s.id)).map((s) => s.id);

  // Callback form, not the array form. src/lib/prisma.ts only hooks the
  // callback: the array form has no function to wrap, so it is deliberately
  // left unscoped and `app.farm_id` is never set. Both updateMany calls would
  // then be refused by row-level security, match zero rows, and report a
  // successful save that changed nothing.
  await prisma.$transaction(async (tx) => {
    await tx.species.updateMany({
      where: { farmId, id: { in: toDeactivate } },
      data: { isActive: false },
    });
    await tx.species.updateMany({
      where: { farmId, id: { in: toActivate } },
      data: { isActive: true },
    });
  });

  return { blocked };
}
