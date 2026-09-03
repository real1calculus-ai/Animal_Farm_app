import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Account bootstrap: the rule that decides what a brand-new signup gets.
 *
 * There is a genuine chicken-and-egg problem here. Every meaningful screen in
 * the app is behind `requireUser()`, which redirects unapproved profiles to
 * /pending-approval, and only an Admin can approve someone from /staff. On a
 * fresh install there is no Admin, so if every signup were unapproved nobody
 * could ever get in. The inverse mistake is worse: if every signup were
 * auto-approved as Admin, anyone who found the URL could hand themselves the
 * keys to a working farm's records.
 *
 * So the bootstrap is strictly first-come: the FIRST profile ever created
 * becomes an approved ADMIN and owns the farm. Everyone after that is an
 * unapproved WORKER waiting on an Admin. "First" is measured by a count of
 * Profile rows inside a Serializable transaction — two people hitting signup
 * in the same second must not both read zero and both become Admin, and
 * Serializable is what makes that read-then-write pair safe (one of the two
 * transactions aborts and retries against the now-non-empty table).
 */

const DEFAULT_FARM_NAME = "My Farm";

export type ProvisionedProfile = {
  id: string;
  role: "ADMIN" | "MANAGER" | "VETERINARIAN" | "WORKER";
  approved: boolean;
  farmId: string | null;
  /** True when this call is the one that bootstrapped the install. */
  isFirstUser: boolean;
};

export type ProvisionProfileInput = {
  /** The Supabase auth user id. `Profile.id` IS this value — see the schema. */
  authUserId: string;
  email: string;
  name: string;
  /** Only used when this signup is the one that creates the farm. */
  farmName?: string | null;
};

/**
 * Creates the Prisma `Profile` for a user who already exists in Supabase Auth,
 * bootstrapping the Farm + FarmSettings rows if this is the first user.
 *
 * Idempotent: called twice for the same auth user (a double-submitted form, a
 * retried request) the second call returns the existing profile untouched
 * rather than re-running the bootstrap or resetting an Admin's approval.
 */
export async function provisionProfile(
  input: ProvisionProfileInput
): Promise<ProvisionedProfile> {
  const name = input.name.trim() || input.email;
  const farmName = input.farmName?.trim() || DEFAULT_FARM_NAME;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.profile.findUnique({
        where: { id: input.authUserId },
        select: { id: true, role: true, approved: true, farmId: true },
      });
      if (existing) {
        return { ...existing, isFirstUser: false };
      }

      const profileCount = await tx.profile.count();
      const isFirstUser = profileCount === 0;

      if (isFirstUser) {
        const farmId = await ensureFarm(tx, farmName);
        const profile = await tx.profile.create({
          data: {
            id: input.authUserId,
            email: input.email,
            name,
            role: "ADMIN",
            approved: true,
            farmId,
          },
          select: { id: true, role: true, approved: true, farmId: true },
        });
        return { ...profile, isFirstUser: true };
      }

      // Subsequent signups are attached to the existing farm so an Admin only
      // has to decide on the role, not re-assign the tenant. They stay
      // `approved: false`, which is what `requireUser()` gates on — being
      // attached to a farm grants nothing on its own.
      const farm = await tx.farm.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      const profile = await tx.profile.create({
        data: {
          id: input.authUserId,
          email: input.email,
          name,
          role: "WORKER",
          approved: false,
          farmId: farm?.id ?? null,
        },
        select: { id: true, role: true, approved: true, farmId: true },
      });
      return { ...profile, isFirstUser: false };
    },
    // See the note above: the count-then-create pair is only safe against a
    // concurrent second signup under Serializable isolation.
    { isolationLevel: "Serializable" }
  );
}

/**
 * Returns the farm the first Admin is attached to, creating it (with its
 * settings row) when the install has none. A Farm without FarmSettings would
 * break every threshold read in the breeding and alert engines, so the two are
 * always created together.
 */
async function ensureFarm(tx: Prisma.TransactionClient, farmName: string): Promise<string> {
  const existing = await tx.farm.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existing) {
    // A farm can exist before any user does — e.g. `npm run db:seed` was run
    // against a fresh database. Adopt it rather than creating a second one.
    await tx.farmSettings.upsert({
      where: { farmId: existing.id },
      update: {},
      create: { farmId: existing.id },
    });
    return existing.id;
  }

  const farm = await tx.farm.create({
    data: {
      name: farmName,
      settings: { create: {} },
    },
    select: { id: true },
  });
  return farm.id;
}
