import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, formatDate } from "@/lib/format";
import { computeWithdrawalStatus, WITHDRAWAL_MEDICATION_SELECT } from "@/lib/health/withdrawal-period";
import type { FarmSettings } from "@prisma/client";
import { pigLabel, type Alert } from "@/lib/alerts/types";

export async function healthAlerts(farmId: string, settings: FarmSettings, now: Date): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const ongoing = await prisma.healthRecord.findMany({
    where: { farmId, outcome: "ONGOING" },
    select: {
      id: true,
      diagnosis: true,
      severity: true,
      recordedAt: true,
      pig: { select: { id: true, tagNumber: true, name: true } },
    },
    orderBy: { recordedAt: "desc" },
    take: 30,
  });

  for (const record of ongoing) {
    alerts.push({
      key: `ongoing-case:${record.id}`,
      severity: record.severity === "SEVERE" ? "CRITICAL" : "WARNING",
      title: "Animal under treatment",
      detail: `${pigLabel(record.pig)} — ${record.diagnosis}, recorded ${formatDate(record.recordedAt)} and still ongoing.`,
      href: `/health/${record.id}`,
      family: "HEALTH",
    });
  }

  // Animals inside a medication withdrawal window. Surfaced not as a warning
  // about the animal's health but because selling one is a food-safety
  // breach — the sale flow blocks it, and this is the advance notice.
  const medicated = await prisma.pig.findMany({
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

  for (const pig of medicated) {
    const medications = pig.healthRecords.flatMap((record) => record.medications);
    const status = computeWithdrawalStatus(medications, now);
    if (!status.inWithdrawal || !status.clearanceDate) continue;

    alerts.push({
      key: `withdrawal:${pig.id}`,
      severity: "WARNING",
      title: "Inside withdrawal period",
      detail: `${pigLabel(pig)} cannot be sold or slaughtered until ${formatDate(status.clearanceDate)} (${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"}) — ${status.blockingMedications.map((m) => m.drugName).join(", ")}.`,
      href: `/animals/${pig.id}`,
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
    select: { pigId: true, diagnosis: true, pig: { select: { pen: { select: { name: true } } } } },
  });

  const clusters = new Map<string, { pigIds: Set<string>; pens: Set<string> }>();
  for (const record of recent) {
    const entry = clusters.get(record.diagnosis) ?? { pigIds: new Set(), pens: new Set() };
    entry.pigIds.add(record.pigId);
    if (record.pig.pen?.name) entry.pens.add(record.pig.pen.name);
    clusters.set(record.diagnosis, entry);
  }

  for (const [diagnosis, entry] of clusters) {
    if (entry.pigIds.size < settings.outbreakCaseThreshold) continue;
    const pens = [...entry.pens];
    alerts.push({
      key: `outbreak:${diagnosis}`,
      severity: "CRITICAL",
      title: "Possible disease cluster",
      detail: `${entry.pigIds.size} animals diagnosed with ${diagnosis} in the last ${settings.outbreakWindowDays} days${pens.length > 0 ? `, across ${pens.join(", ")}` : ""}. Consider isolating affected animals.`,
      href: "/health/monitoring",
      family: "HEALTH",
    });
  }

  // Mortality against the preceding baseline of the same length. A raw count
  // says nothing on its own — three deaths is routine on a large unit and
  // alarming on a small one — so it is the change that is reported.
  const [recentDeaths, priorDeaths] = await Promise.all([
    prisma.pig.count({
      where: { farmId, status: "DECEASED", dateExit: { gte: windowStart, lte: now } },
    }),
    prisma.pig.count({
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
    where: { pig: { farmId, status: "ACTIVE" }, nextDueDate: { lt: now } },
    select: {
      id: true,
      vaccineName: true,
      nextDueDate: true,
      pig: { select: { id: true, tagNumber: true, name: true } },
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
      detail: `${pigLabel(record.pig)} — ${record.vaccineName} was due ${formatDate(record.nextDueDate)}, ${overdueBy} day${overdueBy === 1 ? "" : "s"} ago.`,
      href: "/health/vaccinations",
      family: "HEALTH",
    });
  }

  return alerts;
}
