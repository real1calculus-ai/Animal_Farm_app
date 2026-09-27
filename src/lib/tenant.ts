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
 * The unscoped client. Under the `app_user` role the policies still apply to
 * it and it sees nothing; under an owner role it sees everything. Used only
 * where crossing tenants is the point: sign-in, signup, auth throttling.
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

/** Sets the tenant on a transaction so its policies resolve. */
export async function applyFarmScope(
  tx: Prisma.TransactionClient,
  farmId: string
): Promise<void> {
  // `true` is the is_local flag — discarded when the transaction ends, so it
  // cannot survive onto the next request sharing this pooled connection.
  await tx.$executeRaw`SELECT set_config('app.farm_id', ${farmId}, true)`;
}
