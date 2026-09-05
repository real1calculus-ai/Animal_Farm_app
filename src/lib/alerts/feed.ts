import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, formatDate, formatKg } from "@/lib/format";
import type { Alert } from "@/lib/alerts/types";

const EXPIRY_HORIZON_DAYS = 30;
const RECENT_WINDOW_DAYS = 3;
const BASELINE_WINDOW_DAYS = 7;
/** Fewer recorded days than this and there is no baseline worth comparing to. */
const MIN_BASELINE_DAYS = 4;
const DROP_THRESHOLD = 0.25;

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
  //
  // The averages divide by the number of days that actually carry a record,
  // not by the nominal width of the window. Dividing by a fixed 3 and 7 makes
  // a pen fed identically every day report a 33% collapse the moment a
  // boundary clips one record — and an alert panel that cries wolf is one
  // people stop reading, which costs more than the feature is worth.
  const recentStart = addDays(now, -RECENT_WINDOW_DAYS);
  const baselineStart = addDays(now, -(RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS));

  const records = await prisma.feedingRecord.findMany({
    where: { farmId, penId: { not: null }, fedAt: { gte: baselineStart, lte: now } },
    select: { penId: true, fedAt: true, allocatedKg: true },
  });

  type Window = { total: number; days: Set<string> };
  const byPen = new Map<string, { recent: Window; baseline: Window }>();

  for (const record of records) {
    if (!record.penId) continue;

    const entry =
      byPen.get(record.penId) ??
      { recent: { total: 0, days: new Set<string>() }, baseline: { total: 0, days: new Set<string>() } };

    const window = record.fedAt.getTime() >= recentStart.getTime() ? entry.recent : entry.baseline;
    window.total += record.allocatedKg;
    // Several feeds in a day are one day's intake, not several.
    window.days.add(record.fedAt.toISOString().slice(0, 10));

    byPen.set(record.penId, entry);
  }

  const penIds = [...byPen.keys()];
  const pens = penIds.length
    ? await prisma.pen.findMany({ where: { id: { in: penIds } }, select: { id: true, name: true } })
    : [];
  const penNames = new Map(pens.map((pen) => [pen.id, pen.name]));

  for (const [penId, entry] of byPen) {
    // Needs a real baseline behind it: below a few days of history, a "drop"
    // is just a day somebody forgot to write down.
    if (entry.baseline.days.size < MIN_BASELINE_DAYS || entry.recent.days.size === 0) continue;

    const dailyBaseline = entry.baseline.total / entry.baseline.days.size;
    const dailyRecent = entry.recent.total / entry.recent.days.size;
    if (dailyBaseline <= 0) continue;

    const drop = 1 - dailyRecent / dailyBaseline;
    if (drop < DROP_THRESHOLD) continue;

    alerts.push({
      key: `feed-drop:${penId}`,
      severity: "WARNING",
      title: "Feed intake down",
      detail: `${penNames.get(penId) ?? "A pen"} is eating ${Math.round(drop * 100)}% less than its previous week (${formatKg(dailyRecent, 1)}/day against ${formatKg(dailyBaseline, 1)}). Reduced intake often precedes visible illness.`,
      href: `/pens/${penId}`,
      family: "FEED",
    });
  }

  return alerts;
}
