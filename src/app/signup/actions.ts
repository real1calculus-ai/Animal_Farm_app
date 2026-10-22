"use server";

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

  // The form carries the token on the happy path; metadata is the fallback for
  // a session that was re-established after an email confirmation. Either way
  // provisionProfile is the thing that decides whether it is valid.
  const metadataToken = authUser.user_metadata?.inviteToken;
  const inviteToken =
    optionalString(formData, "inviteToken") ??
    (typeof metadataToken === "string" ? metadataToken : null);

  const profile = await provisionProfile({
    authUserId: authUser.id,
    email: authUser.email ?? "",
    name,
    farmName,
    inviteToken,
  });

  return {
    redirectTo: profile.approved ? "/" : "/pending-approval",
    isFirstUser: profile.isFirstUser,
  };
}
