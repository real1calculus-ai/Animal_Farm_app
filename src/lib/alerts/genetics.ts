import { prisma } from "@/lib/prisma";
import { addDays, formatPercent } from "@/lib/format";
import { loadPedigreeIndex, ancestorsOf } from "@/lib/breeding/pedigree";
import { createInbreedingCalculator } from "@/lib/breeding/inbreeding";
import type { FarmSettings } from "@prisma/client";
import { animalLabel, type Alert } from "@/lib/alerts/types";

/** A sire taking more than this share of recent matings is a bottleneck risk. */
const SIRE_DOMINANCE_FRACTION = 0.4;
/** A founder above this share of the herd's ancestry is over-represented. */
const FOUNDER_DOMINANCE_FRACTION = 0.5;

/**
 * Genetic-diversity alerts (§3.1).
 *
 * These are the slow failures — nothing here goes wrong today, and each
 * individual mating that caused it looked acceptable at the time. A herd
 * closes its own gene pool one reasonable decision at a time, which is exactly
 * why it needs watching by something that never gets bored.
 */
export async function geneticsAlerts(
  farmId: string,
  settings: FarmSettings,
  now: Date
): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const index = await loadPedigreeIndex(farmId);
  if (index.size === 0) return alerts;

  const calculator = createInbreedingCalculator(index);

  const active = await prisma.animal.findMany({
    where: { farmId, status: "ACTIVE" },
    select: { id: true, tagNumber: true, name: true },
  });

  if (active.length === 0) return alerts;

  let total = 0;
  for (const animal of active) {
    const f = calculator.inbreedingOf(animal.id);
    total += f;

    if (f > settings.maxInbreedingCoefficient) {
      alerts.push({
        key: `inbred-animal:${animal.id}`,
        severity: "WARNING",
        title: "Animal above inbreeding limit",
        detail: `${animalLabel(animal)} has an inbreeding coefficient of ${formatPercent(f)}, above the farm limit of ${formatPercent(settings.maxInbreedingCoefficient)}.`,
        href: `/animals/${animal.id}/pedigree`,
        family: "GENETICS",
      });
    }
  }

  const herdAverage = total / active.length;
  if (herdAverage > settings.warnInbreedingCoefficient) {
    alerts.push({
      key: "herd-inbreeding",
      severity: herdAverage > settings.maxInbreedingCoefficient ? "CRITICAL" : "WARNING",
      title: "Herd inbreeding rising",
      detail: `Average inbreeding across the active herd is ${formatPercent(herdAverage)}, above the ${formatPercent(settings.warnInbreedingCoefficient)} warning threshold. Introducing unrelated breeding stock is the usual remedy.`,
      href: "/reports/genetics",
      family: "GENETICS",
    });
  }

  // One boar over-used in the last year narrows the next generation whether or
  // not any single mating exceeded the inbreeding limit.
  const yearAgo = addDays(now, -365);
  const bySire = await prisma.breedingRecord.groupBy({
    by: ["sireId"],
    where: { farmId, breedingDate: { gte: yearAgo } },
    _count: { _all: true },
  });

  const matings = bySire.reduce((sum, row) => sum + row._count._all, 0);

  if (matings >= 5) {
    for (const row of bySire) {
      const share = row._count._all / matings;
      if (share < SIRE_DOMINANCE_FRACTION) continue;

      const sire = index.get(row.sireId);
      alerts.push({
        key: `sire-overused:${row.sireId}`,
        severity: "WARNING",
        title: "One boar dominating matings",
        detail: `${sire ? animalLabel(sire) : "A boar"} sired ${row._count._all} of the last ${matings} matings (${Math.round(share * 100)}%). Spreading service across more boars keeps the next generation's options open.`,
        href: "/reports/genetics",
        family: "GENETICS",
      });
    }
  }

  // Founder concentration: how much of the current herd descends from any one
  // ancestor. This catches narrowing that F alone misses, because F stays low
  // while everything quietly descends from the same few animals.
  const contributions = new Map<string, number>();
  for (const animal of active) {
    for (const ancestorId of ancestorsOf(index, animal.id).keys()) {
      contributions.set(ancestorId, (contributions.get(ancestorId) ?? 0) + 1);
    }
  }

  for (const [ancestorId, count] of contributions) {
    const share = count / active.length;
    if (share < FOUNDER_DOMINANCE_FRACTION) continue;

    const ancestor = index.get(ancestorId);
    if (!ancestor) continue;

    alerts.push({
      key: `founder-dominant:${ancestorId}`,
      severity: "INFO",
      title: "Founder over-represented",
      detail: `${animalLabel(ancestor)} appears in the ancestry of ${Math.round(share * 100)}% of the active herd.`,
      href: "/reports/genetics",
      family: "GENETICS",
    });
  }

  return alerts;
}
