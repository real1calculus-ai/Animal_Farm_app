import { basePrisma, currentTenantClient } from "@/lib/tenant";
import type { PrismaClient } from "@prisma/client";

/**
 * The client every query in the app goes through.
 *
 * A proxy rather than a plain client: inside `withTenant(...)` it forwards to
 * that scope's transaction client, so the row-level-security setting applied
 * there actually covers the query. Outside a tenant scope it forwards to the
 * unscoped client, where the policies see no tenant and return nothing.
 *
 * Done this way so call sites stay ordinary. The alternative — threading a
 * client parameter through every db function, page and action — is the same
 * isolation with several hundred more places to forget it, and forgetting it
 * is the exact failure the policies are there to catch.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = currentTenantClient() ?? basePrisma;
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { basePrisma, withTenant, hasTenantScope } from "@/lib/tenant";
