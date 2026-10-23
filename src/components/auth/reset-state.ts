/**
 * State shape for the three-step password reset.
 *
 * Lives outside src/app/forgot-password/actions.ts because that file is
 * `"use server"`, and such a module may export nothing but async functions.
 * Exporting `initialResetState` from it left the page stuck on the route's
 * Suspense fallback forever: the server returned 200, no error reached the
 * console, and the form simply never mounted — so the rate limiting and the
 * deliberately generic "if this account exists" message were both unreachable.
 *
 * The production build does not catch this. It catches the same mistake when a
 * Server Component imports the const (that fails page-data collection with
 * "a 'use server' file can only export async functions, found object"), but a
 * Client Component importing it compiles and breaks only in the browser.
 */
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
