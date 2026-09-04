import "server-only";

import { prisma } from "@/lib/prisma";
import { getFarmSettings } from "@/lib/active-farm";
import { canSeeFinancials, type Role } from "@/lib/auth";
import { breedingAlerts } from "@/lib/alerts/breeding";
import { healthAlerts } from "@/lib/alerts/health";
import { feedAlerts } from "@/lib/alerts/feed";
import { geneticsAlerts } from "@/lib/alerts/genetics";
import { housingAlerts } from "@/lib/alerts/housing";
import { sortAlerts, type Alert, type AlertFamily } from "@/lib/alerts/types";

export * from "@/lib/alerts/types";

/**
 * Computes every alert for a farm, drops the ones the user has dismissed, and
 * returns them most severe first.
 *
 * The families run in parallel because none of them depend on each other, and
 * this runs on every dashboard load — the screen people leave open all day.
 */
export async function getAlerts(
  farmId: string,
  role: Role,
  now: Date = new Date()
): Promise<Alert[]> {
  const settings = await getFarmSettings(farmId);

  const [breeding, health, feed, genetics, housing, acknowledgements] = await Promise.all([
    breedingAlerts(farmId, settings, now),
    healthAlerts(farmId, settings, now),
    feedAlerts(farmId, now),
    geneticsAlerts(farmId, settings, now),
    housingAlerts(farmId, now),
    prisma.alertAcknowledgement.findMany({
      where: { farmId },
      select: { alertKey: true, snoozedUntil: true },
    }),
  ]);

  // A dismissal with no snooze date is permanent; one with a date in the
  // future is a snooze that has not yet lapsed. Anything else is stale and the
  // alert comes back.
  const dismissed = new Set(
    acknowledgements
      .filter((ack) => !ack.snoozedUntil || ack.snoozedUntil.getTime() > now.getTime())
      .map((ack) => ack.alertKey)
  );

  let alerts = [...breeding, ...health, ...feed, ...genetics, ...housing].filter(
    (alert) => !dismissed.has(alert.key)
  );

  // Housing alerts mention equipment and repairs, which is farm business
  // rather than money, so no family is finance-gated today. The check stays so
  // that adding a cash-flow alert later cannot accidentally show a worker the
  // farm's margins.
  if (!canSeeFinancials(role)) {
    const financeFamilies: AlertFamily[] = [];
    alerts = alerts.filter((alert) => !financeFamilies.includes(alert.family));
  }

  return sortAlerts(alerts);
}

export type AlertCounts = { critical: number; warning: number; info: number; total: number };

export function countAlerts(alerts: Alert[]): AlertCounts {
  return {
    critical: alerts.filter((a) => a.severity === "CRITICAL").length,
    warning: alerts.filter((a) => a.severity === "WARNING").length,
    info: alerts.filter((a) => a.severity === "INFO").length,
    total: alerts.length,
  };
}
