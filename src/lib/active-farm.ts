import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";

const ACTIVE_FARM_COOKIE = "active-farm-id";

/**
 * Resolves which farm the current request operates on.
 *
 * A user assigned to a farm is locked to it — the cookie cannot be used to
 * reach another tenant's data, which matters because the cookie is entirely
 * client-controlled. Only an unassigned Admin (the multi-farm operator case)
 * may switch, and even then the id is validated against the farms table rather
 * than trusted as given.
 */
export async function getActiveFarmId(user: CurrentUser): Promise<string> {
  if (user.farmId) return user.farmId;

  if (user.role === "ADMIN") {
    const requested = (await cookies()).get(ACTIVE_FARM_COOKIE)?.value;
    if (requested) {
      const farm = await prisma.farm.findFirst({
        where: { id: requested, isActive: true },
        select: { id: true },
      });
      if (farm) return farm.id;
    }
  }

  const fallback = await prisma.farm.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!fallback) {
    throw new Error("No active farm exists. Create one in Settings first.");
  }

  return fallback.id;
}

export async function listActiveFarms(): Promise<{ id: string; name: string }[]> {
  return prisma.farm.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Farm settings, with the row created on first access. Every threshold in the
 * breeding and alert engines reads from here, so a missing row would break
 * those paths on a fresh install; creating on demand keeps that impossible.
 */
export async function getFarmSettings(farmId: string) {
  const existing = await prisma.farmSettings.findUnique({ where: { farmId } });
  if (existing) return existing;
  return prisma.farmSettings.create({ data: { farmId } });
}

export { ACTIVE_FARM_COOKIE };
