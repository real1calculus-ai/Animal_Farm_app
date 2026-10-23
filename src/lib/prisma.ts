import { Prisma } from "@prisma/client";

import { applyFarmScope, applyRuntimeRole, basePrisma, currentFarmId } from "@/lib/tenant";

/**
 * The client every query in the app goes through.
 *
 * When a farm scope is active (see `enterFarmScope`), each operation is run
 * inside a transaction that first sets `app.farm_id`, so the row-level
 * security policies resolve to that farm. Outside a scope the operation goes
 * straight to the unscoped client, where the policies see no tenant and — as
 * `app_user` — return nothing. Failing closed is deliberate: a query that
 * forgets its tenant should yield an empty screen, not another farm's herd.
 *
 * Done as a proxy so call sites stay ordinary. Threading a client through 183
 * call sites is the same isolation with 183 chances to forget it, and
 * forgetting it is precisely the failure the policies are there to catch.
 *
 * The cost, stated plainly: a scoped query is two round trips rather than
 * one, because the setting and the query must share a transaction. Group
 * several into one transaction with `prisma.$transaction(...)` where that
 * matters — the proxy sets the tenant once for the whole transaction.
 */

const MODEL_OPERATIONS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow",
  "create", "createMany", "createManyAndReturn",
  "update", "updateMany", "upsert",
  "delete", "deleteMany",
  "count", "aggregate", "groupBy",
]);

/** Model names, lower-cased as Prisma exposes them (`prisma.animal`). */
const MODEL_KEYS = new Set(
  Prisma.dmmf.datamodel.models.map((model) => model.name.charAt(0).toLowerCase() + model.name.slice(1))
);

type AnyClient = Record<string, unknown>;

/**
 * A model delegate for requests with no farm scope — sign-in, signup, auth
 * throttling. Still wrapped in a transaction, because the runtime role has to
 * be dropped from `postgres` to `app_user` and `SET LOCAL` needs one. Without
 * it an unscoped query would run with BYPASSRLS and see every farm on the
 * platform rather than none.
 */
function unscopedDelegate(model: string) {
  return new Proxy(
    {},
    {
      get(_target, operation: string) {
        if (!MODEL_OPERATIONS.has(operation)) {
          return (basePrisma as unknown as AnyClient)[model] &&
            ((basePrisma as unknown as Record<string, AnyClient>)[model][operation]);
        }

        return (...args: unknown[]) =>
          basePrisma.$transaction(async (tx) => {
            await applyRuntimeRole(tx);
            const delegate = (tx as unknown as Record<string, AnyClient>)[model];
            return (delegate[operation] as (...a: unknown[]) => Promise<unknown>)(...args);
          });
      },
    }
  );
}

function scopedDelegate(model: string, farmId: string) {
  return new Proxy(
    {},
    {
      get(_target, operation: string) {
        if (!MODEL_OPERATIONS.has(operation)) {
          return (basePrisma as unknown as AnyClient)[model] &&
            ((basePrisma as unknown as Record<string, AnyClient>)[model][operation]);
        }

        return (...args: unknown[]) =>
          basePrisma.$transaction(async (tx) => {
            await applyFarmScope(tx, farmId);
            const delegate = (tx as unknown as Record<string, AnyClient>)[model];
            return (delegate[operation] as (...a: unknown[]) => Promise<unknown>)(...args);
          });
      },
    }
  );
}

export const prisma = new Proxy(basePrisma, {
  get(target, property, receiver) {
    const farmId = currentFarmId();
    const key = String(property);

    // An explicit transaction: set the tenant once, for the whole of it.
    // Without this every `tx.animal.create(...)` inside the 16 interactive
    // transactions in this codebase would run with no tenant and be refused.
    if (key === "$transaction") {
      return (arg: unknown, options?: unknown) => {
        if (typeof arg === "function") {
          const fn = arg as (tx: Prisma.TransactionClient) => Promise<unknown>;
          return basePrisma.$transaction(async (tx) => {
            // Role either way; the tenant only when there is one. An unscoped
            // transaction still must not run as the BYPASSRLS owner.
            if (farmId) await applyFarmScope(tx, farmId);
            else await applyRuntimeRole(tx);
            return fn(tx);
          }, options as Parameters<typeof basePrisma.$transaction>[1]);
        }
        // Array form: no callback to hook, so it is left unscoped rather than
        // silently half-applied. Nothing in this codebase uses it.
        return (target.$transaction as (...a: unknown[]) => unknown)(arg, options);
      };
    }

    if (MODEL_KEYS.has(key)) {
      return farmId ? scopedDelegate(key, farmId) : unscopedDelegate(key);
    }

    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export { basePrisma, withTenant, enterFarmScope, currentFarmId } from "@/lib/tenant";
