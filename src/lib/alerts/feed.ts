import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, formatDate, formatKg } from "@/lib/format";
import type { Alert } from "@/lib/alerts/types";

const EXPIRY_HORIZON_DAYS = 30;

export async function feedAlerts(farmId: string, now: Date): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const feedTypes = await prisma.feedType.findMany({
    where: { farmId, isActive: true },
    select: {
      id: true,
      name: true,
      reorderLevelKg: true,
      batches: {
        select: { id: true, batchCode: true, remainingKg: true, expirationDate: true },
      },
    },
  });

  for (const feedType of feedTypes) {
    // Expired stock is counted separately from usable stock. Rolling it into
    // the total is how a store that looks full runs out mid-week: the
    // allocator will refuse to feed it, so it is not really stock at all.
    const usableKg = feedType.batches
      .filter((batch) => !batch.expirationDate || batch.expirationDate.getTime() >= now.getTime())
      .reduce((sum, batch) => sum + batch.remainingKg, 0);

    if (feedType.reorderLevelKg > 0 && usableKg < feedType.reorderLevelKg) {
      alerts.push({
        key: `feed-low:${feedType.id}`,
        severity: usableKg <= 0 ? "CRITICAL" : "WARNING",
        title: usableKg <= 0 ? "Out of feed" : "Feed below reorder level",
        detail: `${feedType.name}: ${formatKg(usableKg, 0)} usable, reorder level ${formatKg(feedType.reorderLevelKg, 0)}.`,
        href: "/feed",
        family: "FEED",
      });
    }

    for (const batch of feedType.batches) {
      if (!batch.expirationDate || batch.remainingKg <= 0) continue;

      if (batch.expirationDate.getTime() < now.getTime()) {
        alerts.push({
          key: `feed-expired:${batch.id}`,
          severity: "WARNING",
          title: "Expired feed still in stock",
          detail: `${feedType.name} batch ${batch.batchCode} expired ${formatDate(batch.expirationDate)} with ${formatKg(batch.remainingKg, 0)} left. It cannot be fed — write it off to keep stock figures honest.`,
          href: "/feed/batches",
          family: "FEED",
        });
        continue;
      }

      const daysLeft = daysBetween(now, batch.expirationDate);
      if (daysLeft <= EXPIRY_HORIZON_DAYS) {
        alerts.push({
          key: `feed-expiring:${batch.id}`,
          severity: "INFO",
          title: "Feed expiring soon",
          detail: `${feedType.name} batch ${batch.batchCode} expires ${formatDate(batch.expirationDate)} (${daysLeft} day${daysLeft === 1 ? "" : "s"}) with ${formatKg(batch.remainingKg, 0)} left.`,
          href: "/feed/batches",
          family: "FEED",
        });
      }
    }
  }

  // A pen going off its feed is usually the first sign of illness, and it
  // shows a day or two before anything a person would notice on a walk-round.
  // Compared against the pen's own recent baseline rather than a herd average,
  // since intake scales with the size and stage of the animals in it.
  const recentStart = addDays(now, -3);
  const baselineStart = addDays(now, -10);

  const [recent, baseline] = await Promise.all([
    prisma.feedingRecord.groupBy({
      by: ["penId"],
      where: { farmId, penId: { not: null }, fedAt: { gte: recentStart, lte: now } },
      _sum: { allocatedKg: true },
    }),
    prisma.feedingRecord.groupBy({
      by: ["penId"],
      where: { farmId, penId: { not: null }, fedAt: { gte: baselineStart, lt: recentStart } },
      _sum: { allocatedKg: true },
    }),
  ]);

  const baselineByPen = new Map(
    baseline.map((row) => [row.penId, (row._sum.allocatedKg ?? 0) / 7])
  );

  const penIds = recent.map((row) => row.penId).filter((id): id is string => id !== null);
  const pens = penIds.length
    ? await prisma.pen.findMany({ where: { id: { in: penIds } }, select: { id: true, name: true } })
    : [];
  const penNames = new Map(pens.map((pen) => [pen.id, pen.name]));

  for (const row of recent) {
    if (!row.penId) continue;
    const dailyBaseline = baselineByPen.get(row.penId);
    // Needs a week of history behind it; below that a "drop" is just a day
    // somebody forgot to write the record down.
    if (!dailyBaseline || dailyBaseline <= 0) continue;

    const dailyRecent = (row._sum.allocatedKg ?? 0) / 3;
    const drop = 1 - dailyRecent / dailyBaseline;

    if (drop >= 0.25) {
      alerts.push({
        key: `feed-drop:${row.penId}`,
        severity: "WARNING",
        title: "Feed intake down",
        detail: `${penNames.get(row.penId) ?? "A pen"} is eating ${Math.round(drop * 100)}% less than its previous week (${formatKg(dailyRecent, 1)}/day against ${formatKg(dailyBaseline, 1)}). Reduced intake often precedes visible illness.`,
        href: `/pens/${row.penId}`,
        family: "FEED",
      });
    }
  }

  return alerts;
}
