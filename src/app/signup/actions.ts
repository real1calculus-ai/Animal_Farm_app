"use server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { provisionProfile } from "@/lib/account-setup";
import { requireString, optionalString } from "@/lib/validation";

export type CompleteSignupResult = {
  /** Where the browser should go next. */
  redirectTo: "/" | "/pending-approval";
  /** True when this signup bootstrapped the install and became the Admin. */
  isFirstUser: boolean;
};

/**
 * Second half of signup. The browser has already created the Supabase Auth
 * user and holds a session (see ./page.tsx); this creates the matching Prisma
 * Profile whose `id` IS the Supabase user id.
 *
 * Uses getAuthUser(), not requireUser()/getCurrentUser(): there is no Profile
 * row yet at this point, so those would redirect to /login and the account
 * would never be finished.
 *
 * Returns the destination instead of calling redirect(). This action is
 * invoked imperatively from a Client Component that wraps the call in
 * try/catch, and redirect() signals by throwing — a catch block would swallow
 * the navigation and report it to the user as a failure.
 */
export async function completeSignup(formData: FormData): Promise<CompleteSignupResult> {
  const authUser = await getAuthUser();
  if (!authUser) {
    throw new Error("Your sign-up session expired. Please sign in and try again.");
  }

  const name = requireString(formData, "name");
  const farmName = optionalString(formData, "farmName");

  const profile = await provisionProfile({
    authUserId: authUser.id,
    email: authUser.email ?? "",
    name,
    farmName,
  });

  return {
    redirectTo: profile.approved ? "/" : "/pending-approval",
    isFirstUser: profile.isFirstUser,
  };
}

/**
 * Whether this install has no users yet — i.e. whoever signs up next becomes
 * the Admin and names the farm. Read by the signup form so it can show the
 * farm-name field only when it will actually be used.
 *
 * Deliberately returns a bare boolean, not a count or any profile data: this
 * is callable by an unauthenticated visitor, and "has this farm been set up"
 * is the most it should ever reveal.
 */
export async function isFirstSignup(): Promise<boolean> {
  return (await prisma.profile.count()) === 0;
}
