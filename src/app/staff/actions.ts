"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole, type CurrentUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { requireEnum } from "@/lib/validation";
import { ROLE_LABELS } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFarmInvite, revokeFarmInvite } from "@/lib/account-setup";
import type { InviteActionState } from "@/components/staff/invite-form-state";
import type { Role } from "@prisma/client";

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

/**
 * Staff administration. Every guard here is enforced in the action, not in the
 * page: Server Actions are reachable by direct POST, so a button the UI chose
 * not to render is not a permission check.
 *
 * Two rules matter more than the rest, because breaking either one locks a
 * real operator out of their own farm with no way back in short of database
 * surgery:
 *
 *   1. Nobody may change their own role or remove themselves. One mis-tap on
 *      the wrong row otherwise demotes the only Admin.
 *   2. The last remaining Admin may not be demoted or deleted. Approval and
 *      role changes require an Admin or Manager, so a farm with zero Admins
 *      and no Manager can never grant anyone access again.
 */

/**
 * Loads a staff member, refusing to touch anyone outside the caller's farm.
 *
 * Profiles with a null farmId are in scope too: a signup that lands while no
 * farm exists is attached to nobody, and if this filtered on farmId alone such
 * an account would be invisible on /staff and could never be approved.
 * Approval assigns them to the acting Admin's farm.
 */
async function loadTarget(actor: CurrentUser, profileId: string) {
  const farmId = await getActiveFarmId(actor);

  const target = await prisma.profile.findFirst({
    // Scoped strictly to the actor's own farm. The previous version also
    // matched profiles with no farm at all, so any farm's Admin could adopt,
    // re-role or delete an unattached account belonging to nobody — harmless
    // with one farm, a cross-tenant grab with many.
    where: { id: profileId, farmId },
    select: { id: true, name: true, email: true, role: true, approved: true, farmId: true },
  });

  if (!target) {
    // Same message whether the profile is missing or simply belongs to another
    // farm — the distinction would confirm that an id exists.
    throw new Error("Staff member not found on this farm.");
  }

  return { target, farmId };
}

/**
 * Throws unless at least one *other* approved Admin would remain on the farm.
 * Called before any change that removes an Admin from the farm's roster.
 */
async function assertNotLastAdmin(farmId: string, profileId: string): Promise<void> {
  const otherAdmins = await prisma.profile.count({
    where: { farmId, role: "ADMIN", approved: true, id: { not: profileId } },
  });

  if (otherAdmins === 0) {
    throw new Error(
      "This is the farm's only administrator. Promote someone else to Administrator first."
    );
  }
}

/**
 * Only an Admin may hand out the Admin role or act on an existing one. A
 * Manager can run day-to-day staff admin, but letting one mint Admins would
 * make the Manager role a one-step promotion to full control of the farm.
 */
function assertMayAssign(actor: CurrentUser, role: Role): void {
  if (role === "ADMIN" && actor.role !== "ADMIN") {
    throw new Error("Only an administrator can grant the Administrator role.");
  }
}

function assertMayActOn(actor: CurrentUser, targetRole: Role): void {
  if (targetRole === "ADMIN" && actor.role !== "ADMIN") {
    throw new Error("Only an administrator can change or remove another administrator.");
  }
}

/**
 * Approves a pending signup and sets the role in the same write. Both belong
 * to one decision — approving someone without choosing their role would leave
 * them briefly holding the WORKER default that account-setup assigned.
 */
export async function approveStaff(profileId: string, formData: FormData): Promise<void> {
  const actor = await requireRole(ADMIN_ROLES);
  const { target, farmId } = await loadTarget(actor, profileId);

  const role = requireEnum(formData, "role", ALL_ROLES);
  assertMayAssign(actor, role);

  if (target.approved) {
    // Nothing to do; a double-submitted approval is a no-op rather than a
    // second write that could silently reset a role someone just changed.
    return;
  }

  await prisma.profile.update({
    where: { id: profileId },
    // farmId is set here as well as approved/role, for the unattached-signup
    // case described on loadTarget.
    data: { approved: true, role, farmId: target.farmId ?? farmId },
  });

  revalidatePath("/staff");
}

export async function updateStaffRole(profileId: string, formData: FormData): Promise<void> {
  const actor = await requireRole(ADMIN_ROLES);

  if (profileId === actor.id) {
    throw new Error("You can't change your own role. Ask another administrator to do it.");
  }

  const { target, farmId } = await loadTarget(actor, profileId);
  const role = requireEnum(formData, "role", ALL_ROLES);

  assertMayActOn(actor, target.role);
  assertMayAssign(actor, role);

  if (role === target.role) return;

  // Demoting an Admin removes them from the Admin roster, so it is subject to
  // the same last-Admin guard as deleting one.
  if (target.role === "ADMIN") {
    await assertNotLastAdmin(farmId, profileId);
  }

  await prisma.profile.update({ where: { id: profileId }, data: { role } });

  revalidatePath("/staff");
}

/**
 * Removes a staff member: the Profile row first, then the Supabase Auth login.
 *
 * That order is deliberate. The Profile is what getCurrentUser() requires for
 * any access at all, so if the auth deletion fails halfway the account is
 * already locked out rather than left as a dangling but still-usable login.
 */
export async function removeStaff(profileId: string): Promise<void> {
  const actor = await requireRole(ADMIN_ROLES);

  if (profileId === actor.id) {
    throw new Error("You can't remove your own account.");
  }

  const { target, farmId } = await loadTarget(actor, profileId);
  assertMayActOn(actor, target.role);

  if (target.role === "ADMIN") {
    await assertNotLastAdmin(farmId, profileId);
  }

  await prisma.profile.delete({ where: { id: profileId } });

  const { error } = await createAdminClient().auth.admin.deleteUser(profileId);
  if (error) {
    // The list is already out of date by this point, so refresh it before
    // throwing — otherwise the error boundary leaves a deleted row on screen.
    revalidatePath("/staff");
    // The profile is gone, so they can no longer reach anything — but say
    // plainly that an orphaned login remains, rather than reporting success.
    throw new Error(
      `${target.name} was removed from the farm, but their sign-in could not be deleted from ` +
        `Supabase Auth (${error.message}). They can no longer access the app; remove the ` +
        `leftover auth user from the Supabase dashboard when convenient.`
    );
  }

  revalidatePath("/staff");
}


/**
 * Invites someone onto this farm.
 *
 * Until this existed there was no way to add a colleague at all: open signup
 * creates a brand new farm for whoever signs up, so a second person never
 * appeared on this screen to be approved. The invite is the only path that
 * attaches an account to an existing farm.
 *
 * No email is sent — nothing in this app is wired to a mail provider. The link
 * is handed back once for the Admin to pass on however they already talk to
 * their staff, which on a smallholding is WhatsApp.
 */
export async function inviteStaff(
  _prev: InviteActionState,
  formData: FormData
): Promise<InviteActionState> {
  const actor = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(actor);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter the email address this person will sign up with.", created: null };
  }

  const role = requireEnum(formData, "role", ALL_ROLES);

  // An Admin invite hands over the farm. Managers may add staff but not peers
  // who outrank them, which is the same rule updateStaffRole already enforces.
  if (role === "ADMIN" && actor.role !== "ADMIN") {
    return { error: "Only an Admin can invite another Admin.", created: null };
  }

  const alreadyHere = await prisma.profile.findFirst({
    where: { farmId, email },
    select: { id: true },
  });
  if (alreadyHere) {
    return { error: `${email} is already on this farm.`, created: null };
  }

  const invite = await createFarmInvite({
    farmId,
    email,
    role,
    createdByProfileId: actor.id,
  });

  revalidatePath("/staff");

  return {
    error: null,
    created: {
      email,
      role,
      token: invite.token,
      expiresAt: invite.expiresAt.toISOString(),
    },
  };
}

/** Withdraws an invitation that has not been accepted. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const actor = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(actor);

  await revokeFarmInvite(farmId, inviteId);
  revalidatePath("/staff");
}
