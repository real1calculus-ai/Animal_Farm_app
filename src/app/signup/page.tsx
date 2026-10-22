"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { completeSignup } from "@/app/signup/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Public route (see `isPublicPath` in src/proxy.ts). Signup happens in two
 * halves: the Supabase Auth user is created here in the browser, then
 * `completeSignup` creates the matching Prisma Profile server-side.
 *
 * What the new account gets is decided entirely in src/lib/account-setup.ts.
 * Without an invitation the signup creates a brand new farm with this person as
 * its Admin. With one — `/signup?invite=<token>` — they join the farm that
 * issued it, at the role it names, already approved.
 */
export default function SignupPage() {
  const router = useRouter();
  const inviteToken = useSearchParams().get("invite")?.trim() ?? "";
  const joiningByInvite = inviteToken.length > 0;
  const [name, setName] = useState("");
  const [farmName, setFarmName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [pending, setPending] = useState(false);


  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // The token rides along in user metadata as well as in the form below,
      // because with email confirmation switched on this page never reaches
      // completeSignup — the Profile is created on first sign-in instead (see
      // src/app/login/actions.ts), and the token has to survive that gap.
      //
      // Metadata is writable by the user it belongs to, so this is not where
      // the invitation is trusted: provisionProfile re-checks the token hash,
      // its expiry, its revocation and that it was issued to this exact email.
      options: {
        data: {
          name: name.trim(),
          ...(joiningByInvite ? { inviteToken } : {}),
        },
      },
    });

    if (signUpError) {
      setPending(false);
      setError(signUpError.message);
      return;
    }

    // With Supabase's "Confirm email" setting on (a project-level dashboard
    // toggle this app does not control), signUp succeeds but returns no
    // session until the emailed link is clicked — there is no authenticated
    // user for completeSignup to attach a Profile to yet. Say so rather than
    // failing opaquely; the Profile gets created on their first sign-in, which
    // src/app/login/actions.ts handles.
    if (!data.session) {
      setPending(false);
      setNeedsEmailConfirmation(true);
      return;
    }

    const formData = new FormData();
    formData.set("name", name.trim());
    if (joiningByInvite) formData.set("inviteToken", inviteToken);
    if (!joiningByInvite && farmName.trim()) formData.set("farmName", farmName.trim());

    try {
      const result = await completeSignup(formData);
      router.replace(result.redirectTo);
      // Layout and nav are rendered from the (now changed) session, so the
      // cached RSC payload for the destination has to be dropped.
      router.refresh();
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <div className="mb-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          🐷
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Create your account
        </h1>
      </div>

      <Card>
        {needsEmailConfirmation ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Check your inbox — we&apos;ve sent a confirmation link to{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{email.trim()}</span>.
              Confirm your address, then sign in to finish setting up your account.
            </p>
            <Link
              href="/login"
              className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              {joiningByInvite
                ? "You have been invited to an existing farm. Sign up with the email address the invitation was sent to — it will not work with any other."
                : "This creates your own farm, with you as its administrator. Your records are visible only to you and the staff you invite."}
            </p>

            <Field label="Your name" htmlFor="name" required>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            {/* Nothing to name when joining someone else's farm, and offering
                the field implies the invitation might create one. */}
            {joiningByInvite ? null : (
              <Field
                label="Farm name"
                htmlFor="farmName"
                hint="You can change this later in Settings."
              >
                <Input
                  id="farmName"
                  name="farmName"
                  placeholder="My Farm"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                />
              </Field>
            )}

            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              required
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Field label="Confirm password" htmlFor="confirmPassword" required>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>

            {error ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="mt-1 w-full">
              {pending ? "Creating account…" : "Create account"}
            </Button>

            <Link
              href="/login"
              className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Already have an account? Sign in
            </Link>
          </form>
        )}
      </Card>
    </div>
  );
}
