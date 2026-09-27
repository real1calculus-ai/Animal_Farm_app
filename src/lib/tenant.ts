import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Tenant scoping for row-level security.
 *
 * The policies key on `current_farm_id()`, which reads a *transaction-local*
 * setting. It has to be transaction-local rather than per-connection: the app
 * is serverless behind a pooler, so connections are shared between requests
 * and anything set for the life of a connection would leak from one farm to
 * the next. That is the failure this whole mechanism exists to prevent, so it
 * would be a poor way to implement it.
 *
 * Transaction-local means the query must run on the same transaction that set
 * it. Rather than rewrite every call site to thread a client through,
 * `withTenant` opens the transaction, sets the tenant, and stores the
 * transaction client in AsyncLocalStorage; the exported `prisma` is a proxy
 * that forwards to it when one is in scope. Call sites keep saying
 * `prisma.animal.findMany(...)` and land on the tenant-scoped client.
 *
 * The cost is honest and worth stating: every query inside `withTenant` runs
 * in one interactive transaction, which holds a pooled connection for the
 * length of the request. At this scale that is a fair trade for isolation the
 * database enforces rather than the application remembering to.
 */

const tenantStore = new AsyncLocalStorage<Prisma.TransactionClient>();

const globalForPrisma = globalThis as unknown as { basePrisma?: PrismaClient };

/** The unscoped client. Reaches every tenant — use only where that is right. */
export const basePrisma = globalForPrisma.basePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.basePrisma = basePrisma;

/**
 * Runs `fn` with every query scoped to one farm.
 *
 * Fails closed by construction: the policies compare against a setting that
 * is NULL outside this wrapper, and NULL never matches, so a query that
 * forgets to establish its tenant returns nothing rather than everything.
 */
export async function withTenant<T>(farmId: string, fn: () => Promise<T>): Promise<T> {
  return basePrisma.$transaction(
    async (tx) => {
      // `true` is the is_local flag: discarded when this transaction ends, so
      // it cannot survive onto the next request sharing this connection.
      await tx.$executeRaw`SELECT set_config('app.farm_id', ${farmId}, true)`;
      return tenantStore.run(tx, fn);
    },
    // Generous: a page may run a dozen queries inside one scope.
    { timeout: 20_000, maxWait: 10_000 }
  );
}

/** The transaction client for the current tenant scope, if there is one. */
export function currentTenantClient(): Prisma.TransactionClient | undefined {
  return tenantStore.getStore();
}

/**
 * Whether a tenant scope is currently active. Useful in tests and in the few
 * genuinely cross-tenant paths (sign-in, throttling) that must not be scoped.
 */
export function hasTenantScope(): boolean {
  return tenantStore.getStore() !== undefined;
}
