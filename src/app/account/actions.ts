"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireString } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Self-service account deletion — Apple Guideline 5.1.1(v): an app that lets
 * someone create an account in-app must let them delete it in-app, not just
 * deactivate it. This mirrors `removeStaff` in src/app/staff/actions.ts
 * (Profile row first, then the Supabase Auth login, so a failure never
 * leaves a deleted profile with a still-usable login) but is reachable by
 * every approved role, not just an Admin acting on someone else.
 *
 * Confirmation is typing your own email, not just the SubmitButton's
 * double-tap guard — this is the one action in the app that cannot be
 * undone from inside it.
 */
export async function deleteOwnAccount(formData: FormData): Promise<void> {
  const actor = await requireUser();

  const confirmation = requireString(formData, "confirmEmail").toLowerCase();
  if (confirmation !== actor.email.toLowerCase()) {
    throw new Error("Type your email exactly as shown to confirm.");
  }

  if (actor.farmId) {
    const otherMembers = await prisma.profile.count({
      where: { farmId: actor.farmId, id: { not: actor.id } },
    });

    if (otherMembers === 0) {
      // Sole member: there is no farm left without them, so the account
      // delete takes the whole farm with it. Farm-owned tables cascade from
      // Farm in the schema; Profile itself is SetNull on Farm, not Cascade,
      // so it's deleted explicitly in the same transaction.
      await prisma.$transaction([
        prisma.farm.delete({ where: { id: actor.farmId } }),
        prisma.profile.delete({ where: { id: actor.id } }),
      ]);
    } else {
      if (actor.role === "ADMIN") {
        const otherAdmins = await prisma.profile.count({
          where: { farmId: actor.farmId, role: "ADMIN", approved: true, id: { not: actor.id } },
        });
        if (otherAdmins === 0) {
          throw new Error(
            "You're the only administrator on a farm with other staff. Promote someone else " +
              "to Administrator before deleting your account, or nobody will be able to manage it."
          );
        }
      }
      // Other members remain: only this Profile goes. Records already
      // attributed to this profile (health entries, transactions, ...) stay
      // on the farm's history, same as a paper logbook would keep an entry
      // after the person who wrote it leaves.
      await prisma.profile.delete({ where: { id: actor.id } });
    }
  } else {
    await prisma.profile.delete({ where: { id: actor.id } });
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(actor.id);
  if (error) {
    // The profile is already gone, so they can no longer reach the app —
    // but say plainly that an orphaned login remains rather than claim a
    // clean deletion.
    throw new Error(
      `Your account data was deleted, but your sign-in could not be removed from Supabase Auth ` +
        `(${error.message}). Contact support so the leftover login can be cleared.`
    );
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login");
}
