import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, formatDate } from "@/lib/format";
import { computeWithdrawalStatus, WITHDRAWAL_MEDICATION_SELECT } from "@/lib/health/withdrawal-period";
import type { FarmSettings } from "@prisma/client";
import { animalLabel, type Alert } from "@/lib/alerts/types";

export async function healthAlerts(farmId: string, settings: FarmSettings, now: Date): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const ongoing = await prisma.healthRecord.findMany({
    where: { farmId, outcome: "ONGOING" },
    select: {
      id: true,
      diagnosis: true,
      severity: true,
      recordedAt: true,
      animal: { select: { id: true, tagNumber: true, name: true } },
    },
    orderBy: { recordedAt: "desc" },
    take: 30,
  });

  for (const record of ongoing) {
    // Batch treatments surface on the batch screens, not as a named animal.
    if (!record.animal) continue;
    alerts.push({
      key: `ongoing-case:${record.id}`,
      severity: record.severity === "SEVERE" ? "CRITICAL" : "WARNING",
      title: "Animal under treatment",
      detail: `${animalLabel(record.animal)} — ${record.diagnosis}, recorded ${formatDate(record.recordedAt)} and still ongoing.`,
      href: `/health/${record.id}`,
      family: "HEALTH",
    });
  }

  // Animals inside a medication withdrawal window. Surfaced not as a warning
  // about the animal's health but because selling one is a food-safety
  // breach — the sale flow blocks it, and this is the advance notice.
  const medicated = await prisma.animal.findMany({
    where: {
      farmId,
      status: "ACTIVE",
      healthRecords: { some: { medications: { some: { withdrawalDays: { gt: 0 } } } } },
    },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      healthRecords: { select: { medications: { select: WITHDRAWAL_MEDICATION_SELECT } } },
    },
    take: 50,
  });

  for (const animal of medicated) {
    const medications = animal.healthRecords.flatMap((record) => record.medications);
    const status = computeWithdrawalStatus(medications, now);
    if (!status.inWithdrawal || !status.clearanceDate) continue;

    alerts.push({
      key: `withdrawal:${animal.id}`,
      severity: "WARNING",
      title: "Inside withdrawal period",
      detail: `${animalLabel(animal)} cannot be sold or slaughtered until ${formatDate(status.clearanceDate)} (${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"}) — ${status.blockingMedications.map((m) => m.drugName).join(", ")}.`,
      href: `/animals/${animal.id}`,
      family: "HEALTH",
    });
  }

  // Disease clustering: N cases of one diagnosis inside the window. Grouped on
  // the normalised diagnosis string the health module writes, which is why
  // that normalisation happens on write rather than at read time.
  const windowStart = addDays(now, -settings.outbreakWindowDays);

  const recent = await prisma.healthRecord.findMany({
    where: {
      farmId,
      recordedAt: { gte: windowStart },
      recordType: { in: ["ILLNESS", "INJURY"] },
    },
    select: { animalId: true, diagnosis: true, animal: { select: { pen: { select: { name: true } } } } },
  });

  const clusters = new Map<string, { animalIds: Set<string>; pens: Set<string> }>();
  for (const record of recent) {
    if (!record.animalId || !record.animal) continue;
    const entry = clusters.get(record.diagnosis) ?? { animalIds: new Set(), pens: new Set() };
    entry.animalIds.add(record.animalId);
    if (record.animal.pen?.name) entry.pens.add(record.animal.pen.name);
    clusters.set(record.diagnosis, entry);
  }

  for (const [diagnosis, entry] of clusters) {
    if (entry.animalIds.size < settings.outbreakCaseThreshold) continue;
    const pens = [...entry.pens];
    alerts.push({
      key: `outbreak:${diagnosis}`,
      severity: "CRITICAL",
      title: "Possible disease cluster",
      detail: `${entry.animalIds.size} animals diagnosed with ${diagnosis} in the last ${settings.outbreakWindowDays} days${pens.length > 0 ? `, across ${pens.join(", ")}` : ""}. Consider isolating affected animals.`,
      href: "/health/monitoring",
      family: "HEALTH",
    });
  }

  // Mortality against the preceding baseline of the same length. A raw count
  // says nothing on its own — three deaths is routine on a large unit and
  // alarming on a small one — so it is the change that is reported.
  const [recentDeaths, priorDeaths] = await Promise.all([
    prisma.animal.count({
      where: { farmId, status: "DECEASED", dateExit: { gte: windowStart, lte: now } },
    }),
    prisma.animal.count({
      where: {
        farmId,
        status: "DECEASED",
        dateExit: { gte: addDays(windowStart, -settings.outbreakWindowDays), lt: windowStart },
      },
    }),
  ]);

  if (recentDeaths >= settings.outbreakCaseThreshold && recentDeaths > priorDeaths) {
    alerts.push({
      key: `mortality-spike:${windowStart.toISOString().slice(0, 10)}`,
      severity: "CRITICAL",
      title: "Mortality up",
      detail: `${recentDeaths} deaths in the last ${settings.outbreakWindowDays} days, against ${priorDeaths} in the ${settings.outbreakWindowDays} days before.`,
      href: "/health/monitoring",
      family: "HEALTH",
    });
  }

  // Vaccinations past their recorded next-due date.
  const overdueVaccinations = await prisma.vaccinationRecord.findMany({
    where: { animal: { farmId, status: "ACTIVE" }, nextDueDate: { lt: now } },
    select: {
      id: true,
      vaccineName: true,
      nextDueDate: true,
      animal: { select: { id: true, tagNumber: true, name: true } },
    },
    orderBy: { nextDueDate: "asc" },
    take: 25,
  });

  for (const record of overdueVaccinations) {
    const overdueBy = daysBetween(record.nextDueDate!, now);
    alerts.push({
      key: `vaccination-overdue:${record.id}`,
      severity: "WARNING",
      title: "Vaccination overdue",
      detail: `${animalLabel(record.animal)} — ${record.vaccineName} was due ${formatDate(record.nextDueDate)}, ${overdueBy} day${overdueBy === 1 ? "" : "s"} ago.`,
      href: "/health/vaccinations",
      family: "HEALTH",
    });
  }

  return alerts;
}
