"use server";

import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";

const AUTH_TIMEOUT_MS = 10_000;

export type ResetState = {
  step: "request" | "verify" | "set-password";
  error: string | null;
  notice: string | null;
  /** Carried forward between steps so the user retypes their email only once. */
  email: string;
  /** Set once the password has actually been changed — the client navigates on it. */
  done: boolean;
};

export const initialResetState: ResetState = {
  step: "request",
  error: null,
  notice: null,
  email: "",
  done: false,
};

/**
 * Step 1 — email a six-digit code.
 *
 * This step never reveals whether the address belongs to an account.
 * `shouldCreateUser: false` stops signInWithOtp from silently signing anyone
 * up, and every outcome (sent, no such user, rate-limited) produces the same
 * message and the same next step. A distinct "no account found" here would
 * turn this form into an email-enumeration oracle for the farm's staff list.
 */
export async function requestResetCode(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { ...initialResetState, error: "Enter the email address on your account." };
  }

  const supabase = await createClient();
  try {
    await withTimeout(
      supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }),
      AUTH_TIMEOUT_MS
    );
  } catch (err) {
    // Swallowed on purpose — see the note above. Logged so a genuine Supabase
    // outage is still diagnosable from the server logs.
    console.error("signInWithOtp threw:", err);
  }

  return {
    step: "verify",
    error: null,
    notice: `If ${email} has an account, a six-digit code is on its way.`,
    email,
    done: false,
  };
}

/**
 * Step 2 — exchange the code for a session. Verifying the OTP is what signs
 * the user in; the session cookies it sets are what lets step 3 change the
 * password as that user.
 */
export async function verifyResetCode(
  prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim() || prevState.email;
  const token = String(formData.get("code") ?? "").trim();

  if (!token) {
    return { ...prevState, step: "verify", error: "Enter the code from your email.", notice: null };
  }

  const supabase = await createClient();

  let result;
  try {
    result = await withTimeout(
      supabase.auth.verifyOtp({ email, token, type: "email" }),
      AUTH_TIMEOUT_MS
    );
  } catch (err) {
    console.error("verifyOtp threw:", err);
    return {
      ...prevState,
      step: "verify",
      error: "Password reset is temporarily unavailable. Please try again in a moment.",
      notice: null,
      email,
      done: false,
    };
  }

  if (result.error) {
    console.error("verifyOtp failed:", result.error.message);
    return {
      step: "verify",
      error: "That code didn't work — it may have expired. Request a new one below.",
      notice: null,
      email,
      done: false,
    };
  }

  return {
    step: "set-password",
    error: null,
    notice: "Code accepted. Choose a new password.",
    email,
    done: false,
  };
}

/**
 * Step 3 — set the new password against the session established in step 2.
 * Returns rather than redirecting so the client can refresh the router cache
 * (the nav is rendered from the session) before navigating.
 */
export async function setNewPassword(
  prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fail = (error: string): ResetState => ({
    ...prevState,
    step: "set-password",
    error,
    notice: null,
    done: false,
  });

  if (password.length < 8) return fail("Password must be at least 8 characters.");
  if (password !== confirmPassword) return fail("Those passwords don't match.");

  const supabase = await createClient();

  let result;
  try {
    result = await withTimeout(supabase.auth.updateUser({ password }), AUTH_TIMEOUT_MS);
  } catch (err) {
    console.error("updateUser threw:", err);
    return fail("Password reset is temporarily unavailable. Please try again in a moment.");
  }

  if (result.error) {
    console.error("updateUser failed:", result.error.message);
    // updateUser fails with no session when the verified code has since
    // expired — say what to do rather than showing a raw auth error.
    return fail("Your reset session expired. Request a new code and try again.");
  }

  return {
    step: "set-password",
    error: null,
    notice: null,
    email: prevState.email,
    done: true,
  };
}
