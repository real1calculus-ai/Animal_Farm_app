import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { SPECIES_CATALOGUE } from "@/lib/species-catalogue";
import type { Role } from "@prisma/client";

/**
 * Account bootstrap for a multi-tenant install.
 *
 * The rule that matters: **an open signup creates its own farm.** Previously
 * the first signup created a farm and every later one joined it, which is
 * correct for a single farm and catastrophic for a SaaS — the second farmer
 * to register would land inside the first farmer's herd, reading their
 * animals, their treatments and their money.
 *
 * That leaves a real question the old code never had to answer: how does a
 * farm add its own staff, if signing up makes you a new farm? Through an
 * invite. The two paths are genuinely different intents — "I am starting a
 * farm" and "I work at one that already exists" — and they are now
 * distinguishable rather than guessed at.
 *
 * Every new farm is seeded with the species catalogue, because a farm with no
 * species cannot record a single animal, and making that the farmer's first
 * task is a poor way to open the app.
 */

const DEFAULT_FARM_NAME = "My Farm";
const INVITE_TTL_DAYS = 14;

export type ProvisionedProfile = {
  id: string;
  role: "ADMIN" | "MANAGER" | "VETERINARIAN" | "WORKER";
  approved: boolean;
  farmId: string | null;
  /** True when this signup created its own farm and owns it. */
  isFirstUser: boolean;
  /** True when the user joined an existing farm through an invitation. */
  joinedByInvite: boolean;
};

export type ProvisionProfileInput = {
  /** The Supabase auth user id. `Profile.id` IS this value — see the schema. */
  authUserId: string;
  email: string;
  name: string;
  /** Names the farm this signup creates. Ignored when joining by invite. */
  farmName?: string | null;
  /** Plaintext invite token, when the user is joining an existing farm. */
  inviteToken?: string | null;
};

/**
 * Creates the Prisma `Profile` for a user who already exists in Supabase Auth,
 * bootstrapping the Farm + FarmSettings rows if this is the first user.
 *
 * Idempotent: called twice for the same auth user (a double-submitted form, a
 * retried request) the second call returns the existing profile untouched
 * rather than re-running the bootstrap or resetting an Admin's approval.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** A fresh invite token: the plaintext for the link, the hash for the row. */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export async function provisionProfile(
  input: ProvisionProfileInput
): Promise<ProvisionedProfile> {
  const name = input.name.trim() || input.email;
  const farmName = input.farmName?.trim() || DEFAULT_FARM_NAME;
  const inviteToken = input.inviteToken?.trim() || null;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.profile.findUnique({
        where: { id: input.authUserId },
        select: { id: true, role: true, approved: true, farmId: true },
      });
      if (existing) {
        return { ...existing, isFirstUser: false, joinedByInvite: false };
      }

      // --- Joining an existing farm by invite --------------------------
      if (inviteToken) {
        const invite = await tx.farmInvite.findUnique({
          where: { tokenHash: hashInviteToken(inviteToken) },
          select: { id: true, farmId: true, role: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true },
        });

        if (!invite || invite.revokedAt) throw new Error("That invitation is no longer valid.");
        if (invite.acceptedAt) throw new Error("That invitation has already been used.");
        if (invite.expiresAt.getTime() < Date.now()) throw new Error("That invitation has expired. Ask for a new one.");

        // Bound to the address it was sent to. Without this, anyone holding
        // the link joins the farm — and invite links get forwarded.
        if (invite.email.toLowerCase() !== input.email.trim().toLowerCase()) {
          throw new Error("That invitation was issued to a different email address.");
        }

        const profile = await tx.profile.create({
          data: {
            id: input.authUserId,
            email: input.email,
            name,
            role: invite.role,
            // Approved on the strength of the invite: an Admin already
            // decided this person belongs, and making them wait for a second
            // approval after accepting is pure friction.
            approved: true,
            farmId: invite.farmId,
          },
          select: { id: true, role: true, approved: true, farmId: true },
        });

        await tx.farmInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

        return { ...profile, isFirstUser: false, joinedByInvite: true };
      }

      // --- Open signup: a new farm, owned by whoever signed up ----------
      const farm = await tx.farm.create({
        data: { name: farmName, settings: { create: {} } },
        select: { id: true },
      });

      // A farm with no species cannot record an animal. Seeding the catalogue
      // means the first screen after signup is usable rather than a setup chore.
      await tx.species.createMany({
        data: SPECIES_CATALOGUE.map((entry) => ({ ...entry, farmId: farm.id })),
        skipDuplicates: true,
      });

      const profile = await tx.profile.create({
        data: {
          id: input.authUserId,
          email: input.email,
          name,
          role: "ADMIN",
          approved: true,
          farmId: farm.id,
        },
        select: { id: true, role: true, approved: true, farmId: true },
      });

      return { ...profile, isFirstUser: true, joinedByInvite: false };
    },
    // The invite lookup-then-accept pair must not let two people redeem the
    // same invitation concurrently.
    { isolationLevel: "Serializable" }
  );
}

/** Creates an invitation and returns the plaintext token for the link. */
export async function createFarmInvite(input: {
  farmId: string;
  email: string;
  role: Role;
  createdByProfileId: string;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  const { token, tokenHash } = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  const invite = await prisma.farmInvite.create({
    data: {
      farmId: input.farmId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      tokenHash,
      expiresAt,
      createdByProfileId: input.createdByProfileId,
    },
    select: { id: true },
  });

  // The plaintext is returned once and never stored. A leaked database must
  // not hand over working invitations to every farm on the platform.
  return { id: invite.id, token, expiresAt };
}
