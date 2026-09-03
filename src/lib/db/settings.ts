import "server-only";

import { prisma } from "@/lib/prisma";
import { getFarmSettings } from "@/lib/active-farm";
import type { FarmSettings, HalfSibPolicy } from "@prisma/client";

/**
 * Query helpers for the farm profile and its thresholds. Read by /settings and
 * by every engine that needs a threshold, so it lives here rather than inline
 * in the page (AGENTS.md: shared queries go in src/lib/db/<domain>.ts).
 */

export type FarmWithSettings = {
  id: string;
  name: string;
  location: string | null;
  settings: FarmSettings;
};

export async function getFarmWithSettings(farmId: string): Promise<FarmWithSettings> {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: { id: true, name: true, location: true },
  });

  if (!farm) throw new Error("Farm not found.");

  // getFarmSettings creates the row on first access, so a farm that predates
  // the settings table (or a hand-inserted one) still renders this page.
  const settings = await getFarmSettings(farmId);

  return { ...farm, settings };
}

export type FarmProfileInput = {
  name: string;
  location: string | null;
};

export async function updateFarmProfile(
  farmId: string,
  input: FarmProfileInput
): Promise<void> {
  await prisma.farm.update({
    where: { id: farmId },
    data: { name: input.name, location: input.location },
  });
}

/**
 * Everything on FarmSettings that /settings exposes. Inbreeding coefficients
 * arrive here already converted to fractions — the percent-to-fraction
 * conversion happens once, in the Server Action, and is documented there.
 */
export type FarmSettingsInput = {
  currency: string;
  maxInbreedingCoefficient: number;
  warnInbreedingCoefficient: number;
  halfSibPolicy: HalfSibPolicy;
  maxSireUsesPerYear: number;
  gestationDays: number;
  gestationToleranceDays: number;
  estrusCycleDays: number;
  weaningAgeDays: number;
  minBreedingAgeDaysFemale: number;
  minBreedingAgeDaysMale: number;
  minBreedingWeightKg: number;
  outbreakCaseThreshold: number;
  outbreakWindowDays: number;
};

export async function updateFarmSettings(
  farmId: string,
  input: FarmSettingsInput
): Promise<void> {
  const { currency, ...rest } = input;

  await prisma.farmSettings.upsert({
    where: { farmId },
    // The schema carries both `currency` and `currencyCode` with the same
    // default. They are never meaningfully different — one currency, one code —
    // so the form edits a single field and both columns are written together
    // rather than being allowed to drift apart.
    update: { ...rest, currency, currencyCode: currency },
    create: { farmId, ...rest, currency, currencyCode: currency },
  });
}
