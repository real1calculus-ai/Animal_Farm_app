"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  initialResetState,
  requestResetCode,
  setNewPassword,
  verifyResetCode,
  type ResetState,
} from "@/app/forgot-password/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/**
 * Public route (see `isPublicPath` in src/proxy.ts). Three steps, one state
 * object: request a code, verify it, set a new password.
 *
 * All three run as Server Actions rather than calling Supabase from the
 * browser. Verifying the code is what establishes the session, and doing that
 * server-side means the session cookie is written by the same
 * `@/lib/supabase/server` client the rest of the app reads — no second
 * client-side auth path to keep in sync.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();

  const [requestState, requestAction, requestPending] = useActionState(
    requestResetCode,
    initialResetState
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyResetCode,
    initialResetState
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    setNewPassword,
    initialResetState
  );

  // The three hooks each hold their own result; the furthest-along one wins.
  const state: ResetState =
    passwordState.step === "set-password" && (passwordState.error || passwordState.done)
      ? passwordState
      : verifyState.step === "set-password"
        ? { ...verifyState, error: passwordState.error }
        : verifyState.error
          ? verifyState
          : requestState;

  const email = state.email || verifyState.email || requestState.email;

  useEffect(() => {
    if (!passwordState.done) return;
    // The password is changed and the session is live, so land them inside the
    // app. refresh() drops the cached RSC payload rendered for a signed-out
    // visitor, which is what the nav is built from.
    router.replace("/");
    router.refresh();
  }, [passwordState.done, router]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Reset your password
        </h1>
      </div>

      <Card>
        {state.step === "request" ? (
          <form action={requestAction} className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Enter the email address on your account and we&apos;ll send you a six-digit code.
            </p>

            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                defaultValue={email}
              />
            </Field>

            {state.error ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={requestPending} className="mt-1 w-full">
              {requestPending ? "Sending…" : "Send reset code"}
            </Button>
            <BackToSignIn />
          </form>
        ) : state.step === "verify" ? (
          <div className="flex flex-col gap-4">
            <form action={verifyAction} className="flex flex-col gap-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {state.notice ?? `Enter the six-digit code sent to ${email}.`}
              </p>

              <input type="hidden" name="email" value={email} />

              <Field label="Reset code" htmlFor="code" required>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </Field>

              {state.error ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {state.error}
                </p>
              ) : null}

              <Button type="submit" disabled={verifyPending} className="mt-1 w-full">
                {verifyPending ? "Checking…" : "Verify code"}
              </Button>
            </form>

            {/* Re-uses step 1's action, so a resend gets the same
                deliberately-uninformative response as the first request. */}
            <form action={requestAction}>
              <input type="hidden" name="email" value={email} />
              <button
                type="submit"
                disabled={requestPending}
                className="text-sm text-zinc-500 underline hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {requestPending ? "Resending…" : "Send another code"}
              </button>
            </form>
            <BackToSignIn />
          </div>
        ) : (
          <form action={passwordAction} className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Code accepted. Choose a new password for {email}.
            </p>

            <Field label="New password" htmlFor="password" required hint="At least 8 characters.">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>

            <Field label="Confirm new password" htmlFor="confirmPassword" required>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>

            {state.error ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={passwordPending || passwordState.done}
              className="mt-1 w-full"
            >
              {passwordState.done
                ? "Signing you in…"
                : passwordPending
                  ? "Saving…"
                  : "Save password & continue"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    >
      Back to sign in
    </Link>
  );
}
