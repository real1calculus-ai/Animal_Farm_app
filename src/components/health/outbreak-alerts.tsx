import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { HEALTH_CATEGORY_LABELS } from "@/lib/labels";
import type { OutbreakAlert } from "@/lib/health/outbreak";

/**
 * Active disease clusters, with the pens they are in and what to do about it.
 *
 * The pen breakdown is the point: three cases in one pen and three cases
 * spread over three pens are the same number and completely different
 * problems, and only the second one means it is travelling.
 */
export function OutbreakAlerts({
  alerts,
  caseThreshold,
  windowDays,
}: {
  alerts: OutbreakAlert[];
  caseThreshold: number;
  windowDays: number;
}) {
  if (alerts.length === 0) {
    return (
      <Card>
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Outbreak alerts</h2>
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          No condition has affected {caseThreshold} or more animals in the last {windowDays} days.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <Card
          key={alert.id}
          className={
            alert.severity === "ALERT"
              ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
              : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {alert.diagnosis}
              </h3>
              <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                {alert.animalCount} animals ({alert.recordCount} records) in {alert.windowDays}{" "}
                days — threshold is {alert.threshold}. First seen {formatDate(alert.firstSeen)}, most
                recent {formatDate(alert.lastSeen)}.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={alert.severity === "ALERT" ? "danger" : "warning"}>
                {alert.severity === "ALERT" ? "Outbreak" : "Watch"}
              </Badge>
              <Badge>{HEALTH_CATEGORY_LABELS[alert.category]}</Badge>
              {alert.contagious ? <Badge variant="danger">Contagious</Badge> : null}
              {alert.spreadingAcrossPens ? (
                <Badge variant="danger">Multiple pens</Badge>
              ) : null}
            </div>
          </div>

          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Affected pens
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {alert.affectedPens.map((pen) => (
                  <span
                    key={pen.penId ?? "none"}
                    className="rounded-md bg-white px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
                  >
                    {pen.penName}: {pen.animalCount}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Affected animals
              </dt>
              <dd className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                {alert.affectedAnimals.map((animal) => (
                  <Link
                    key={animal.pigId}
                    href={`/animals/${animal.pigId}`}
                    className="underline decoration-dotted underline-offset-2 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    {animal.tagNumber}
                  </Link>
                ))}
              </dd>
            </div>
          </dl>

          <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-zinc-800 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
            <span className="font-medium">Recommended action: </span>
            {alert.recommendation}
          </p>
        </Card>
      ))}
    </div>
  );
}
