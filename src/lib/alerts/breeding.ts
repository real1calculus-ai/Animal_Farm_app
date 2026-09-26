import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, formatDate } from "@/lib/format";
import type { FarmSettings } from "@prisma/client";
import { animalLabel, type Alert } from "@/lib/alerts/types";
import { LIVESTOCK_ONLY } from "@/lib/species-catalogue";
import { termsFor, titleCase } from "@/lib/species-catalogue";

/**
 * Breeding-calendar alerts. Every threshold reads from FarmSettings — the
 * gestation length in particular, which is ~114 days and not the 21 the
 * requirements document states (21 is the estrus cycle).
 */
/** The animal's own vocabulary, falling back to neutral words. */
const terms = (animal: { species?: Parameters<typeof termsFor>[0] } | null) =>
  termsFor(animal?.species ?? null);

export async function breedingAlerts(farmId: string, settings: FarmSettings, now: Date): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const open = await prisma.breedingRecord.findMany({
    where: { farmId, pregnancyStatus: { in: ["PENDING", "CONFIRMED"] } },
    select: {
      id: true,
      breedingDate: true,
      expectedFarrowingDate: true,
      pregnancyStatus: true,
      dam: { select: { id: true, tagNumber: true, name: true, species: { select: { birthEventTerm: true, youngTerm: true, adultFemaleTerm: true, adultMaleTerm: true, groupTerm: true } } } },
    },
  });

  for (const record of open) {
    const overdueBy = daysBetween(
      addDays(record.expectedFarrowingDate, settings.gestationToleranceDays),
      now
    );

    if (overdueBy > 0) {
      alerts.push({
        key: `overdue-farrowing:${record.id}`,
        severity: "CRITICAL",
        title: `${titleCase(terms(record.dam).birth)} overdue`,
        detail: `${titleCase(terms(record.dam).female)} ${animalLabel(record.dam)} is ${overdueBy} day${overdueBy === 1 ? "" : "s"} past her expected ${terms(record.dam).birth} date of ${formatDate(record.expectedFarrowingDate)}.`,
        href: `/breeding/${record.id}`,
        family: "BREEDING",
      });
      continue;
    }

    const dueIn = daysBetween(now, record.expectedFarrowingDate);
    if (dueIn >= 0 && dueIn <= 7) {
      alerts.push({
        key: `farrowing-due:${record.id}`,
        severity: "WARNING",
        title: `${titleCase(terms(record.dam).birth)} due this week`,
        detail: `${titleCase(terms(record.dam).female)} ${animalLabel(record.dam)} is due ${dueIn === 0 ? "today" : `in ${dueIn} day${dueIn === 1 ? "" : "s"}`} (${formatDate(record.expectedFarrowingDate)}). Move her to a ${terms(record.dam).birth} pen.`,
        href: `/breeding/${record.id}`,
        family: "BREEDING",
      });
    }

    // A pregnancy still unconfirmed past one estrus cycle should have been
    // checked by now: if she returned to heat, the mating failed and the sow is
    // sitting idle at roughly the cost of feeding her.
    const sinceBreeding = daysBetween(record.breedingDate, now);
    if (record.pregnancyStatus === "PENDING" && sinceBreeding > settings.estrusCycleDays) {
      alerts.push({
        key: `unconfirmed-pregnancy:${record.id}`,
        severity: "WARNING",
        title: "Pregnancy unconfirmed",
        detail: `${titleCase(terms(record.dam).female)} ${animalLabel(record.dam)} was bred ${sinceBreeding} days ago and is still unconfirmed — past the ${settings.estrusCycleDays}-day cycle at which a return to heat would have shown.`,
        href: `/breeding/${record.id}`,
        family: "BREEDING",
      });
    }
  }

  // Gilts old and heavy enough to breed that never have been. Each one is a
  // sow's worth of feed with no litters against it.
  const giltCutoff = addDays(now, -settings.minBreedingAgeDaysFemale);

  const readyGilts = await prisma.animal.findMany({
    where: {
      farmId,
      ...LIVESTOCK_ONLY,
      sex: "FEMALE",
      status: "ACTIVE",
      dateOfBirth: { lte: giltCutoff },
      breedingsAsDam: { none: {} },
      OR: [
        { currentWeightKg: { gte: settings.minBreedingWeightKg } },
        { currentWeightKg: null },
      ],
    },
    select: { id: true, tagNumber: true, name: true, dateOfBirth: true, currentWeightKg: true, species: { select: { birthEventTerm: true, youngTerm: true, adultFemaleTerm: true, adultMaleTerm: true, groupTerm: true } } },
    take: 20,
  });

  for (const gilt of readyGilts) {
    const ageDays = daysBetween(gilt.dateOfBirth, now);
    alerts.push({
      key: `gilt-ready:${gilt.id}`,
      severity: "INFO",
      title: `${titleCase(terms(gilt).female)} ready to breed`,
      detail: `${animalLabel(gilt)} is ${ageDays} days old${gilt.currentWeightKg ? ` and ${gilt.currentWeightKg} kg` : ""} and has never been bred.`,
      href: `/breeding/match-finder?damId=${gilt.id}`,
      family: "BREEDING",
    });
  }

  // Sows not seen in heat for well over a cycle, and not currently pregnant.
  const staleHeat = addDays(now, -settings.estrusCycleDays * 2);

  // Nagging the farm to breed its guard dog is exactly the sort of noise that
  // teaches people to stop reading the alert panel.
  const notCycling = await prisma.animal.findMany({
    where: {
      farmId,
      ...LIVESTOCK_ONLY,
      sex: "FEMALE",
      status: "ACTIVE",
      dateOfBirth: { lte: giltCutoff },
      breedingsAsDam: { some: {} },
      NOT: { breedingsAsDam: { some: { pregnancyStatus: { in: ["PENDING", "CONFIRMED"] } } } },
      estrusRecords: { none: { observedAt: { gte: staleHeat } } },
    },
    select: { id: true, tagNumber: true, name: true, species: { select: { birthEventTerm: true, youngTerm: true, adultFemaleTerm: true, adultMaleTerm: true, groupTerm: true } } },
    take: 20,
  });

  for (const sow of notCycling) {
    alerts.push({
      key: `not-cycling:${sow.id}`,
      severity: "WARNING",
      title: `${titleCase(terms(sow).female)} not cycling`,
      detail: `${animalLabel(sow)} is open and has not been recorded in heat for over ${settings.estrusCycleDays * 2} days — worth a fertility check.`,
      href: `/breeding/estrus`,
      family: "BREEDING",
    });
  }

  return alerts;
}
