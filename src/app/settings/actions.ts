"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { updateFarmProfile, updateFarmSettings } from "@/lib/db/settings";
import {
  optionalString,
  requireEnum,
  requireFloat,
  requireInt,
  requireString,
} from "@/lib/validation";
import { HALF_SIB_POLICY_LABELS } from "@/lib/labels";
import type { HalfSibPolicy } from "@prisma/client";

const HALF_SIB_POLICIES = Object.keys(HALF_SIB_POLICY_LABELS) as HalfSibPolicy[];

/**
 * Inbreeding coefficients are Wright's F: a FRACTION in the database (0.10),
 * but nobody says "point one zero inbreeding" out loud — the form takes and
 * shows percentages (10). This is the single conversion point on the way in;
 * `formatPercent` in src/lib/format.ts is the matching one on the way out.
 *
 * Bounded to 0–100 before dividing, so a fat-fingered "1000" cannot store an
 * F of 10.0 and quietly switch the match finder off by making every possible
 * pairing pass the threshold.
 */
function percentToFraction(formData: FormData, key: string): number {
  const percent = requireFloat(formData, key);
  if (percent < 0 || percent > 100) {
    throw new Error(`${key} must be between 0 and 100 percent`);
  }
  return percent / 100;
}

function requirePositiveInt(formData: FormData, key: string): number {
  const value = requireInt(formData, key);
  if (value < 1) throw new Error(`${key} must be at least 1`);
  return value;
}

function requireNonNegativeInt(formData: FormData, key: string): number {
  const value = requireInt(formData, key);
  if (value < 0) throw new Error(`${key} cannot be negative`);
  return value;
}

/**
 * Saves the farm profile and every threshold in one submit — they are one form
 * on screen, and splitting the write would let a half-applied save leave the
 * breeding engine reading a warn threshold above its own max.
 */
export async function saveFarmSettings(formData: FormData): Promise<void> {
  // Server Actions are reachable by direct POST, so this is the real
  // permission check — not the nav hiding the Settings link.
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const maxInbreedingCoefficient = percentToFraction(formData, "maxInbreedingPercent");
  const warnInbreedingCoefficient = percentToFraction(formData, "warnInbreedingPercent");

  // A warn threshold at or above the max would never fire: anything that
  // reached it would already have been rejected outright.
  if (warnInbreedingCoefficient > maxInbreedingCoefficient) {
    throw new Error(
      "The warning threshold must be at or below the maximum inbreeding coefficient."
    );
  }

  const gestationDays = requirePositiveInt(formData, "gestationDays");
  const minBreedingWeightKg = requireFloat(formData, "minBreedingWeightKg");
  if (minBreedingWeightKg <= 0) {
    throw new Error("Minimum breeding weight must be greater than zero.");
  }

  await updateFarmProfile(farmId, {
    name: requireString(formData, "name"),
    location: optionalString(formData, "location"),
  });

  await updateFarmSettings(farmId, {
    currency: requireString(formData, "currency").toUpperCase(),
    maxInbreedingCoefficient,
    warnInbreedingCoefficient,
    halfSibPolicy: requireEnum(formData, "halfSibPolicy", HALF_SIB_POLICIES),
    maxSireUsesPerYear: requirePositiveInt(formData, "maxSireUsesPerYear"),
    gestationDays,
    gestationToleranceDays: requireNonNegativeInt(formData, "gestationToleranceDays"),
    estrusCycleDays: requirePositiveInt(formData, "estrusCycleDays"),
    weaningAgeDays: requirePositiveInt(formData, "weaningAgeDays"),
    minBreedingAgeDaysFemale: requirePositiveInt(formData, "minBreedingAgeDaysFemale"),
    minBreedingAgeDaysMale: requirePositiveInt(formData, "minBreedingAgeDaysMale"),
    minBreedingWeightKg,
    outbreakCaseThreshold: requirePositiveInt(formData, "outbreakCaseThreshold"),
    outbreakWindowDays: requirePositiveInt(formData, "outbreakWindowDays"),
  });

  // The farm name shows in the header on every screen and these thresholds
  // drive the dashboard alerts, so revalidate the whole tree, not just here.
  revalidatePath("/", "layout");
}
