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
 * The species to assume when a caller has not chosen one — the farm's first
 * individually-tracked livestock species. Exists so screens written before
 * multi-species support keep working rather than failing on a required field.
 */
export async function getDefaultSpecies(farmId: string): Promise<Species> {
  const existing = await prisma.species.findFirst({
    where: { farmId, isActive: true, trackingMode: { in: ["INDIVIDUAL", "HYBRID"] } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const all = await ensureSpeciesCatalogue(farmId);
  const fallback = all.find((s) => s.trackingMode !== "BATCH") ?? all[0];
  if (!fallback) throw new Error("No species are configured for this farm");
  return fallback;
}
