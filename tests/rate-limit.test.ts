import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAttempts, ruleFor, formatRetryAfter, type AttemptRow } from "@/lib/rate-limit-policy";

/**
 * Throttling boundaries are pinned here because getting one wrong is invisible.
 * An off-by-one that grants a sixth guess where five were intended reads fine
 * in review and fails silently in production — there is no error, just a
 * slightly wider door.
 */

const NOW = new Date("2026-09-05T12:00:00.000Z");
const IDENTIFIER = "hash-identifier";
const CLIENT = "hash-client";
const KEYS = { identifier: IDENTIFIER, client: CLIENT };

/**
 * Attempts spaced one second apart, so a burst stays inside the window it is
 * being tested against. Spacing them by minutes would push the earlier ones
 * out of a 15-minute window and quietly test nothing.
 */
function attempts(keyHash: string, count: number, minutesAgo = 1): AttemptRow[] {
  const base = NOW.getTime() - minutesAgo * 60_000;
  return Array.from({ length: count }, (_, i) => ({
    keyHash,
    attemptedAt: new Date(base - i * 1_000),
  }));
}

test("an unused identifier is allowed", () => {
  const verdict = evaluateAttempts([], KEYS, ruleFor("LOGIN"), NOW);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.retryAfterSeconds, 0);
});

test("the last attempt inside the allowance still goes through", () => {
  const rule = ruleFor("LOGIN");
  // One short of the limit must be allowed — the limit is the number of
  // attempts permitted, not the number after which blocking starts.
  const verdict = evaluateAttempts(attempts(IDENTIFIER, rule.perIdentifier - 1), KEYS, rule, NOW);
  assert.equal(verdict.allowed, true);
});

test("reaching the allowance blocks the next attempt", () => {
  const rule = ruleFor("LOGIN");
  const verdict = evaluateAttempts(attempts(IDENTIFIER, rule.perIdentifier), KEYS, rule, NOW);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.retryAfterSeconds > 0);
});

test("attempts older than the window do not count", () => {
  const rule = ruleFor("LOGIN");
  // Well past the 15-minute window: these must age out entirely, or a limiter
  // would harden into a permanent lockout over a day of honest typos.
  const stale = attempts(IDENTIFIER, rule.perIdentifier * 3, 600);
  assert.equal(evaluateAttempts(stale, KEYS, rule, NOW).allowed, true);
});

test("the client limit blocks even when each identifier is under its own", () => {
  const rule = ruleFor("LOGIN");
  // The spray attack: one source, many different emails, none individually
  // over the per-identifier limit.
  const verdict = evaluateAttempts(attempts(CLIENT, rule.perClient), KEYS, rule, NOW);
  assert.equal(verdict.allowed, false);
});

test("the identifier limit blocks even when the client limit is untouched", () => {
  const rule = ruleFor("LOGIN");
  // The distributed attack: many sources, one target account.
  const verdict = evaluateAttempts(attempts(IDENTIFIER, rule.perIdentifier), KEYS, rule, NOW);
  assert.equal(verdict.allowed, false);
});

test("retry-after counts from the oldest blocking attempt, not from now", () => {
  const rule = ruleFor("LOGIN");
  // Oldest attempt was 5 minutes ago, so with a 15-minute window the caller
  // waits the remaining 10 — not a fresh 15, which would compound into a
  // lockout that never expires under repeated tries.
  const rows: AttemptRow[] = Array.from({ length: rule.perIdentifier }, (_, i) => ({
    keyHash: IDENTIFIER,
    attemptedAt: new Date(NOW.getTime() - (5 - i * 0.1) * 60_000),
  }));

  const verdict = evaluateAttempts(rows, KEYS, rule, NOW);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.retryAfterSeconds, 10 * 60);
});

test("the reset-code limit is tighter than the login limit", () => {
  // A six-digit code is a million possibilities, which is not many when
  // guesses are cheap — and it grants a full account takeover rather than
  // merely confirming a password.
  const verify = ruleFor("PASSWORD_RESET_VERIFY");
  const login = ruleFor("LOGIN");
  assert.ok(verify.perClient < login.perClient);
  assert.ok(verify.perIdentifier <= login.perIdentifier);
});

test("reset requests are limited more tightly than sign-ins per identifier", () => {
  // Every request sends a real email; loose limits make the farm's own mail
  // domain a spam vector aimed at whoever's address is typed in.
  assert.ok(ruleFor("PASSWORD_RESET_REQUEST").perIdentifier < ruleFor("LOGIN").perIdentifier);
});

test("retry delays read as time, not seconds", () => {
  assert.equal(formatRetryAfter(30), "a minute");
  assert.equal(formatRetryAfter(60), "a minute");
  assert.equal(formatRetryAfter(61), "2 minutes");
  assert.equal(formatRetryAfter(600), "10 minutes");
});
