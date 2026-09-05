import type { AlertSeverity } from "@prisma/client";

/**
 * Alerts are derived, never stored.
 *
 * A persisted alerts table goes stale the moment the condition behind it
 * changes: a sow flagged "overdue" stays flagged after she farrows unless
 * something remembers to clear the row, and the one thing nobody does on a
 * busy farm is tidy up a notifications table. So every alert here is computed
 * from live data on each load, and the only thing written down is a person's
 * decision to dismiss one (`AlertAcknowledgement`, keyed by `key` below).
 *
 * `key` must therefore be stable across recomputation and unique per subject —
 * "overdue-farrowing:<breedingRecordId>", not "overdue-farrowing" — or a
 * dismissal would silence every alert of that kind rather than the one the
 * user actually looked at.
 */
export type Alert = {
  key: string;
  severity: AlertSeverity;
  /** Short noun phrase, e.g. "Farrowing overdue". */
  title: string;
  /**
   * One specific sentence naming the animal, pen or feed involved. A vague
   * alert is worse than none: it costs attention and gives no way to act.
   */
  detail: string;
  /** Where to go to resolve it. */
  href: string;
  /** Groups alerts on the dashboard. */
  family: AlertFamily;
};

export type AlertFamily = "BREEDING" | "HEALTH" | "FEED" | "GENETICS" | "HOUSING";

export const FAMILY_LABELS: Record<AlertFamily, string> = {
  BREEDING: "Breeding",
  HEALTH: "Health",
  FEED: "Feed",
  GENETICS: "Genetics",
  HOUSING: "Housing & assets",
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title)
  );
}

export function severityVariant(severity: AlertSeverity): "danger" | "warning" | "default" {
  if (severity === "CRITICAL") return "danger";
  if (severity === "WARNING") return "warning";
  return "default";
}

/** Describes an animal in one token the user recognises on the pen wall. */
export function animalLabel(animal: { tagNumber: string; name: string | null }): string {
  return animal.name ? `${animal.tagNumber} (${animal.name})` : animal.tagNumber;
}
