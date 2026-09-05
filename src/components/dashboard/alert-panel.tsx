import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dismissAlert } from "@/app/dashboard-actions";
import { FAMILY_LABELS, severityVariant, type Alert } from "@/lib/alerts/types";

/**
 * The first thing on the screen, because the question a farmer opens this app
 * to answer is "what needs me today?" — not "how many animals do I have".
 */
export function AlertPanel({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <Card className="mb-6 border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Nothing needs attention right now.
        </p>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
          No overdue farrowings, animals under treatment, low feed or housing problems.
        </p>
      </Card>
    );
  }

  return (
    <div className="mb-6 space-y-2">
      {alerts.map((alert) => (
        <Card key={alert.key} className="flex flex-wrap items-start gap-3 py-4">
          <Badge variant={severityVariant(alert.severity)}>{alert.title}</Badge>

          <div className="min-w-[16rem] flex-1">
            <p className="text-sm text-zinc-800 dark:text-zinc-200">{alert.detail}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {FAMILY_LABELS[alert.family]}
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Link href={alert.href} className="underline underline-offset-2">
              Open
            </Link>

            {/*
              Two separate forms rather than one with a select: on a phone,
              "not now" and "done with this" are one tap each, and a dropdown
              between them is a tap nobody makes.
            */}
            <form action={dismissAlert}>
              <input type="hidden" name="alertKey" value={alert.key} />
              <input type="hidden" name="snoozeDays" value="7" />
              <button
                type="submit"
                className="text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Snooze 7d
              </button>
            </form>

            <form action={dismissAlert}>
              <input type="hidden" name="alertKey" value={alert.key} />
              <button
                type="submit"
                className="text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Dismiss
              </button>
            </form>
          </div>
        </Card>
      ))}
    </div>
  );
}
