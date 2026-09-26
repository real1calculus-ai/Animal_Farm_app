/**
 * Rate-limit policy — the thresholds and the decision, with no database, no
 * request context and no `server-only` guard.
 *
 * Split from `rate-limit.ts` for the same reason the withdrawal maths is split
 * from its queries: that module is `server-only`, which throws the instant a
 * plain test process imports it. A throttling boundary that cannot be tested
 * is a throttling boundary nobody has checked, and an off-by-one here is
 * invisible — there is no error, just a slightly wider door.
 */

export type RateLimitScope =
  | "LOGIN"
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_RESET_VERIFY"
  | "SIGNUP";

type Rule = {
  /** Attempts allowed per identifier (usually the email) inside the window. */
  perIdentifier: number;
  /** Attempts allowed from one client address inside the window. */
  perClient: number;
  windowMs: number;
};

const MINUTE = 60_000;

const RULES: Record<RateLimitScope, Rule> = {
  // Five wrong passwords in fifteen minutes is already far past honest
  // mistyping, and well below what makes guessing worthwhile.
  LOGIN: { perIdentifier: 5, perClient: 20, windowMs: 15 * MINUTE },

  // Each request sends a real email. Loose limits here make the farm's own
  // mail domain a spam vector against whoever's address is typed in.
  PASSWORD_RESET_REQUEST: { perIdentifier: 3, perClient: 10, windowMs: 15 * MINUTE },

  // The tightest rule in the file. A six-digit code is a million
  // possibilities, which sounds strong and is not: at even ten guesses a
  // second, unthrottled, an attacker expects to land one inside a day — and
  // the code is a full account takeover, not a password hint.
  PASSWORD_RESET_VERIFY: { perIdentifier: 5, perClient: 15, windowMs: 15 * MINUTE },

  SIGNUP: { perIdentifier: 3, perClient: 10, windowMs: 60 * MINUTE },
};

/**
 * Identifiers are hashed before they are stored. A table listing every email
 * that has ever attempted a login is a disclosure risk in its own right, and
 * this table has no reason to hold one — it only ever needs to count.
 *
 * The salt is not a secret so much as a nuisance: it stops the column being
 * checked against a list of addresses somebody already has.
 */

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the oldest attempt in the window falls out of it. */
  retryAfterSeconds: number;
};

export const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterSeconds: 0 };

export type AttemptRow = { keyHash: string; attemptedAt: Date };

/**
 * The decision itself, given the attempts already in the window.
 *
 * Pure and exported so the boundaries can be pinned by tests: an off-by-one
 * that allows a sixth guess where five were intended is invisible in review
 * and silent in production. The database and the request headers stay in the
 * shell around it.
 */
export function evaluateAttempts(
  rows: AttemptRow[],
  keys: { identifier: string; client: string },
  rule: Rule,
  now: Date = new Date()
): RateLimitVerdict {
  const cutoff = now.getTime() - rule.windowMs;
  const inWindow = rows
    .filter((row) => row.attemptedAt.getTime() > cutoff)
    .sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime());

  const byIdentifier = inWindow.filter((row) => row.keyHash === keys.identifier);
  const byClient = inWindow.filter((row) => row.keyHash === keys.client);

  const breaches: Date[] = [];
  if (byIdentifier.length >= rule.perIdentifier) breaches.push(byIdentifier[0].attemptedAt);
  if (byClient.length >= rule.perClient) breaches.push(byClient[0].attemptedAt);

  if (breaches.length === 0) return ALLOWED;

  // Blocked until the earliest breaching attempt ages out of the window.
  const oldest = Math.min(...breaches.map((date) => date.getTime()));
  const retryAfterMs = Math.max(0, oldest + rule.windowMs - now.getTime());

  return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
}

/** The configured rules, exposed so tests assert against the real numbers. */
export function ruleFor(scope: RateLimitScope): Rule {
  return RULES[scope];
}

/**
 * Checks whether an attempt may proceed. Does not record it — call
 * `recordAuthAttempt` after, so a request that never reached the auth provider
 * (a validation failure, say) does not spend the caller's budget.
 *
 * Fails OPEN. If the database is unreachable the limiter cannot answer, and
 * refusing every sign-in during a database blip would turn a degraded
 * dependency into a total outage. The trade is deliberate: throttling is a
 * hardening measure, not the authentication boundary.
 */

export function formatRetryAfter(seconds: number): string {
  if (seconds <= 60) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minutes`;
}

/**
 * Longest configured window. Nothing older than this can affect any decision,
 * so it is the floor for pruning the attempt log.
 */
export const MAX_WINDOW_MS = Math.max(...Object.values(RULES).map((rule) => rule.windowMs));
