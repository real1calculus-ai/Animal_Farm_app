import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Tenant scoping for row-level security.
 *
 * The policies compare against `current_farm_id()`, which reads a
 * transaction-local setting. Transaction-local rather than per-connection
 * because the app runs serverless behind a pooler: connections are shared
 * between requests, and a per-connection tenant would leak from one farm to
 * the next — the exact failure the policies exist to prevent.
 *
 * That means the setting and the query must share a transaction. Rather than
 * rewrite 183 call sites to thread a client through, the farm id lives in
 * AsyncLocalStorage and `src/lib/prisma.ts` proxies each operation into a
 * transaction that sets it first. Call sites keep saying
 * `prisma.animal.findMany(...)`.
 *
 * `getActiveFarmId()` establishes the scope, and it already runs before every
 * farm-scoped query in the app — so the wiring is one line in one place
 * rather than a hundred wrappers that someone will eventually forget.
 */

const farmScope = new AsyncLocalStorage<string>();

const globalForPrisma = globalThis as unknown as { basePrisma?: PrismaClient };

/**
 * The role every runtime query is executed as.
 *
 * It is not the role in the connection string, and it cannot be. Supabase's
 * pooler authenticates only the users it holds for the project — in practice
 * `postgres` — and refuses a custom role with 28P01 no matter how recently its
 * password was set. It also silently discards `options=-c role=...` from the
 * connection string: current_user comes back as `postgres` regardless. The
 * direct database host would accept either, but it is IPv6-only without the
 * paid add-on.
 *
 * So the connection is made as `postgres`, which carries BYPASSRLS, and every
 * transaction immediately drops to `app_user`, which does not. `SET LOCAL`
 * reverts when the transaction ends, so the connection returns to the pool as
 * `postgres` and the next request starts from the same place.
 *
 * Set APP_DB_ROLE="" to disable, which is only correct when DATABASE_URL
 * already connects as a NOBYPASSRLS role.
 */
const RUNTIME_ROLE = process.env.APP_DB_ROLE ?? "app_user";

/** Matches an unquoted SQL identifier. SET ROLE takes no bind parameter, so
 *  the value is interpolated, and this is what makes that safe. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Drops the transaction to the non-privileged runtime role.
 *
 * Must run inside a transaction. `SET LOCAL` outside one is a no-op that only
 * raises a warning, which would leave the query running as `postgres` with
 * every policy bypassed and nothing on screen to say so.
 */
export async function applyRuntimeRole(tx: Prisma.TransactionClient): Promise<void> {
  if (!RUNTIME_ROLE) return;
  if (!SAFE_IDENTIFIER.test(RUNTIME_ROLE)) {
    throw new Error(`APP_DB_ROLE is not a plain identifier: ${RUNTIME_ROLE}`);
  }
  await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RUNTIME_ROLE}`);
}

/**
 * The unscoped client. Reached only through the proxy in src/lib/prisma.ts,
 * which still runs its operations as `app_user` — so with no tenant set the
 * policies see none and return nothing. Used where crossing tenants is the
 * point: sign-in, signup, auth throttling.
 */
export const basePrisma = globalForPrisma.basePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.basePrisma = basePrisma;

/**
 * Binds the rest of this request to one farm.
 *
 * Uses `enterWith` rather than `run(cb)` so it can be called from inside
 * `getActiveFarmId` and still cover everything that follows in the request.
 * That is the unusual case `enterWith` exists for; Next.js gives each request
 * its own async context, so the scope cannot bleed into another request.
 */
export function enterFarmScope(farmId: string): void {
  farmScope.enterWith(farmId);
}

/** The farm this execution context is bound to, if any. */
export function currentFarmId(): string | undefined {
  return farmScope.getStore();
}

/**
 * Runs `fn` bound to a farm, restoring the previous scope afterwards. Used by
 * tests and by the few background paths that have no request behind them.
 */
export async function withTenant<T>(farmId: string, fn: () => Promise<T>): Promise<T> {
  return farmScope.run(farmId, fn);
}

/** Sets the role and the tenant on a transaction so its policies resolve. */
export async function applyFarmScope(
  tx: Prisma.TransactionClient,
  farmId: string
): Promise<void> {
  // Role first. The tenant setting is worthless while the connection still
  // holds a role that ignores the policies it feeds.
  await applyRuntimeRole(tx);

  // `true` is the is_local flag — discarded when the transaction ends, so it
  // cannot survive onto the next request sharing this pooled connection.
  await tx.$executeRaw`SELECT set_config('app.farm_id', ${farmId}, true)`;
}
