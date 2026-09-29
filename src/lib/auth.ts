import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";

const AUTH_TIMEOUT_MS = 5000;

export type Role = "ADMIN" | "MANAGER" | "VETERINARIAN" | "WORKER";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  farmId: string | null;
  approved: boolean;
};

/**
 * Raw Supabase-authenticated user with no Profile join. Exported because
 * signup runs before a Profile row exists and so cannot go through
 * getCurrentUser().
 *
 * The call is timed out, and any failure — timeout or thrown error, e.g. a
 * Supabase Auth outage — is treated the same as "no session". Every page and
 * Server Action in the app funnels through here, so an unguarded hang would
 * stall the entire app rather than one request. Failing to "no user" is safe:
 * it is exactly what happens for a genuinely logged-out visitor.
 */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    return user;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    farmId: profile.farmId,
    approved: profile.approved,
  };
}

/** Requires a logged-in, approved user. Redirects rather than throwing. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.approved) redirect("/pending-approval");
  return user;
}

/**
 * Requires one of `roles`. This is the real authorisation boundary, not the
 * nav or Proxy: Server Actions are reachable by direct POST, so every action
 * calls this itself rather than trusting that the UI hid the button.
 */
export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Error("You do not have permission to perform this action");
  }
  return user;
}

/** Roles allowed to change herd/production data (not just read it). */
export const WRITE_ROLES: Role[] = ["ADMIN", "MANAGER", "WORKER"];
/** Roles allowed to touch health and reproductive records. */
export const HEALTH_ROLES: Role[] = ["ADMIN", "MANAGER", "VETERINARIAN"];
/** Roles allowed to see money. Workers and vets do not get the P&L. */
export const FINANCE_ROLES: Role[] = ["ADMIN", "MANAGER"];
/** Roles allowed to administer the farm itself: staff, settings, protocols. */
export const ADMIN_ROLES: Role[] = ["ADMIN", "MANAGER"];
/**
 * Roles allowed to record what they saw in the field — health observations
 * — without being able to go back and rewrite or delete the record
 * afterwards. Shared between src/app/health/actions.ts (the online path)
 * and src/app/api/offline/sync/route.ts (the offline one), so the two
 * can't drift apart.
 */
export const OBSERVE_ROLES: Role[] = ["ADMIN", "MANAGER", "VETERINARIAN", "WORKER"];

export function canSeeFinancials(role: Role): boolean {
  return FINANCE_ROLES.includes(role);
}
