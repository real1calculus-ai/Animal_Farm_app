"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type SignInState } from "@/app/login/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DEMO_MODE, DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

const initialState: SignInState = { error: null };

/**
 * Public route — listed alongside /signup and /forgot-password in the
 * `isPublicPath` check in src/proxy.ts, so an unauthenticated visitor is not
 * bounced away from the page that exists to authenticate them.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <div className="mb-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          🐷
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Animal Farm Management
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to your farm records.
        </p>
      </div>

      {DEMO_MODE ? (
        /*
          One click in, with the credentials shown anyway. A recruiter who has
          to type a password from a README usually closes the tab instead, and
          the account holds nothing but invented animals, so there is nothing
          to protect.
        */
        <Card className="mb-4 border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-sm text-emerald-900 dark:text-emerald-200">
            This is a live demo on fabricated records. Explore it without
            signing up.
          </p>
          <form action={formAction} className="mt-3">
            <input type="hidden" name="email" value={DEMO_EMAIL} />
            <input type="hidden" name="password" value={DEMO_PASSWORD} />
            <Button type="submit" disabled={pending}>
              {pending ? "Opening the demo…" : "Explore the demo"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-300">
            Or sign in below with <code>{DEMO_EMAIL}</code> and{" "}
            <code>{DEMO_PASSWORD}</code>.
          </p>
        </Card>
      ) : null}

      <Card>
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          {state.error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          ) : null}

          {/* Not SubmitButton: useActionState gives `pending` directly here, and
              a plain Button keeps the disabled-while-pending guard without
              needing useFormStatus's enclosing-form indirection. */}
          <Button type="submit" disabled={pending} className="mt-1 w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>

          <div className="flex items-center justify-between gap-3 pt-1">
            <Link
              href="/forgot-password"
              className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Forgot password?
            </Link>
            <Link
              href="/signup"
              className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Create an account
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
