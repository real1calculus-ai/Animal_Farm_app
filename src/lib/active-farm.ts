import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { enterFarmScope } from "@/lib/tenant";


/**
 * Resolves which farm the current request operates on.
 *
 * A user assigned to a farm is locked to it — the cookie cannot be used to
 * reach another tenant's data, which matters because the cookie is entirely
 * client-controlled. Only an unassigned Admin (the multi-farm operator case)
 * may switch, and even then the id is validated against the farms table rather
 * than trusted as given.
 */
/**
 * Thrown when a signed-in user has no farm. Distinct from a generic error so
 * pages can route to a "your account is not attached to a farm" screen rather
 * than showing a stack of red text.
 */
export class NoFarmAssignedError extends Error {
  constructor() {
    super("Your account is not attached to a farm.");
    this.name = "NoFarmAssignedError";
  }
}


/**
 * Farm settings, with the row created on first access. Every threshold in the
 * breeding and alert engines reads from here, so a missing row would break
 * those paths on a fresh install; creating on demand keeps that impossible.
 */
/**
 * The farm this request operates on.
 *
 * A user's own `farmId` is the only answer. There is deliberately no fallback
 * and no cookie.
 *
 * Both used to exist and both became cross-tenant holes the moment the app
 * stopped being one farm. The fallback returned the *oldest farm on the
 * platform* to any user without one of their own, handing a stranger's herd,
 * treatments and finances to whoever happened to have a null column. The
 * cookie let an unattached Admin name any farm id and be believed, because it
 * checked only that the farm existed — never that the Admin belonged to it.
 *
 * Neither was wrong when there was one farm. Both are how a SaaS leaks. An
 * unattached account now gets nothing, which is the only safe reading of "we
 * do not know which tenant you are".
 */
export async function getActiveFarmId(user: CurrentUser): Promise<string> {
  if (!user.farmId) throw new NoFarmAssignedError();

  // Binds the rest of this request to the farm, so every query after this
  // point carries the tenant into its transaction and the row-level security
  // policies resolve. This call already precedes every farm-scoped query in
  // the app, which is why the wiring is one line here rather than a wrapper
  // around 183 call sites that somebody would eventually leave off.
  enterFarmScope(user.farmId);

  return user.farmId;
}

export async function getFarmSettings(farmId: string) {
  const existing = await prisma.farmSettings.findUnique({ where: { farmId } });
  if (existing) return existing;
  return prisma.farmSettings.create({ data: { farmId } });
}

