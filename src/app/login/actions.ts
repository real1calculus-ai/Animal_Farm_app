"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { provisionProfile } from "@/lib/account-setup";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";

// Longer than the read-only session checks in proxy.ts and lib/auth.ts: this
// is an action the user is actively waiting on with the button showing a
// pending state, not a per-request background check, so it is worth a longer
// grace period before giving up.
const SIGN_IN_TIMEOUT_MS = 10_000;

export type SignInState = { error: string | null };

export async function signIn(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  // signInWithPassword can hang (Supabase Auth slow or unreachable) or throw
  // outright on a network-level failure rather than returning an `{ error }`
  // shape. Unhandled, either leaves the button stuck in its pending state, so
  // both resolve to a normal visible message instead.
  let result;
  try {
    result = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      SIGN_IN_TIMEOUT_MS
    );
  } catch (err) {
    console.error("signInWithPassword threw:", err);
    return {
      error: "Sign-in is temporarily unavailable. Please wait a moment and try again.",
    };
  }

  if (result.error) {
    const { status, code, message } = result.error;
    // Logged in full server-side; the message shown to the user stays generic
    // for a plain bad-password case so this form cannot be used to work out
    // which email addresses have accounts.
    console.error("signInWithPassword failed:", { status, code, message });

    if (status === 429 || code === "over_request_rate_limit") {
      return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
    }
    return { error: "Invalid email or password." };
  }

  // A Supabase auth user with no Profile row means signup was interrupted
  // between the two writes. Rather than stranding them on a dashboard that
  // redirects to /login forever (getCurrentUser() returns null without a
  // Profile), finish the job here — provisionProfile is idempotent and applies
  // exactly the same first-user-becomes-Admin rule as /signup.
  const authUser = result.data.user;
  let approved = false;

  if (authUser) {
    const profile = await prisma.profile.findUnique({
      where: { id: authUser.id },
      select: { approved: true },
    });

    if (profile) {
      approved = profile.approved;
    } else {
      const metadataName = authUser.user_metadata?.name;
      const provisioned = await provisionProfile({
        authUserId: authUser.id,
        email: authUser.email ?? email,
        name: typeof metadataName === "string" ? metadataName : email,
      });
      approved = provisioned.approved;
    }
  }

  // redirect() throws its control-flow signal, so it must stay outside the
  // try/catch above. An unapproved account goes straight to the explanation
  // rather than to a dashboard that would only bounce it there anyway.
  if (!approved) redirect("/pending-approval");
  redirect("/");
}
