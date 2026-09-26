import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import {
  ALLOWED,
  evaluateAttempts,
  MAX_WINDOW_MS,
  ruleFor,
  type RateLimitScope,
  type RateLimitVerdict,
} from "@/lib/rate-limit-policy";

export {
  evaluateAttempts,
  ruleFor,
  formatRetryAfter,
  type AttemptRow,
  type RateLimitScope,
  type RateLimitVerdict,
} from "@/lib/rate-limit-policy";

const HASH_SALT = "pig-farm-app:auth-attempt:v1";

function hashKey(scope: RateLimitScope, value: string): string {
  return createHash("sha256")
    .update(`${HASH_SALT}|${scope}|${value.trim().toLowerCase()}`)
    .digest("hex");
}

/**
 * Best-effort client address. Behind Vercel or any proxy the socket address is
 * the proxy's, so the forwarded headers are what carry the caller — the first
 * entry of `x-forwarded-for` being the original client.
 *
 * A client that fakes these headers only ever splits its own budget into
 * smaller pieces; it cannot borrow anyone else's, and the per-identifier limit
 * still applies regardless. So the header being spoofable weakens this limit
 * without breaking the pair.
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const address =
    forwarded?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("cf-connecting-ip")?.trim() ||
    "unknown";
  return address;
}

export async function checkRateLimit(
  scope: RateLimitScope,
  identifier: string
): Promise<RateLimitVerdict> {
  const rule = ruleFor(scope);
  const since = new Date(Date.now() - rule.windowMs);

  try {
    const keys = [hashKey(scope, identifier), hashKey(scope, `client:${await clientKey()}`)];

    const rows = await prisma.authAttempt.findMany({
      where: { keyHash: { in: keys }, attemptedAt: { gte: since } },
      select: { keyHash: true, attemptedAt: true },
      orderBy: { attemptedAt: "asc" },
    });

    return evaluateAttempts(rows, { identifier: keys[0], client: keys[1] }, rule);
  } catch (error) {
    console.error("Rate limit check failed; allowing the request:", error);
    return ALLOWED;
  }
}

/**
 * Records an attempt against both keys.
 *
 * Successes are recorded as well as failures. Counting only failures lets an
 * attacker with one valid account reset their budget at will by interleaving a
 * known-good sign-in between guesses.
 */
export async function recordAuthAttempt(
  scope: RateLimitScope,
  identifier: string,
  succeeded: boolean
): Promise<void> {
  try {
    const attemptedAt = new Date();
    const client = await clientKey();

    await prisma.authAttempt.createMany({
      data: [
        { keyHash: hashKey(scope, identifier), scope, succeeded, attemptedAt },
        { keyHash: hashKey(scope, `client:${client}`), scope, succeeded, attemptedAt },
      ],
    });

    await pruneOccasionally();
  } catch (error) {
    // Never fail a sign-in because bookkeeping failed.
    console.error("Failed to record auth attempt:", error);
  }
}

const PRUNE_PROBABILITY = 0.02;

/**
 * Drops rows that can no longer influence a decision. Done probabilistically
 * on write rather than on a schedule: this app has no job runner, and a table
 * that only ever grows would eventually make the window query the slowest part
 * of signing in.
 */
async function pruneOccasionally(): Promise<void> {
  if (Math.random() > PRUNE_PROBABILITY) return;

  // A generous multiple of the longest window, so a clock skew between
  // instances can never delete a row that still counts.
  const cutoff = new Date(Date.now() - MAX_WINDOW_MS * 4);
  await prisma.authAttempt.deleteMany({ where: { attemptedAt: { lt: cutoff } } });
}

/** Human phrasing for a retry delay, for the rare message that shows one. */
