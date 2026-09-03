import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import type { DateRange } from "@/components/reports/date-range";

/**
 * Standard frame for a report page: a heading that names the decision the
 * report supports, the period selector, and the sections.
 *
 * `decision` is not decoration. A report nobody can act on is a screen the
 * owner scrolls past, so every one of these states in one line what it is for
 * — "which sires to keep", "which pens are falling behind".
 */
export function ReportShell({
  title,
  decision,
  path,
  range,
  children,
}: {
  title: string;
  decision: string;
  path: string;
  range: DateRange;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/reports"
          className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← All reports
        </Link>
        <div className="mt-2">
          <PageHeader title={title} description={decision} />
        </div>
        <Card className="p-4">
          <DateRangePicker path={path} range={range} />
        </Card>
      </div>
      {children}
    </div>
  );
}

/** One titled block inside a report. */
export function ReportSection({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

/** Inline key-figure strip, for the two or three numbers a section turns on. */
export function MetricStrip({
  metrics,
}: {
  metrics: { label: string; value: string; hint?: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">{metric.label}</dt>
          <dd className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {metric.value}
          </dd>
          {metric.hint ? (
            <dd className="text-xs text-zinc-500 dark:text-zinc-400">{metric.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * Plain-language conclusion drawn from the numbers above it. Used where the
 * report is expected to make a recommendation rather than leave the reader to
 * infer one — the genetics report especially.
 */
export function Recommendation({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "critical" | "good";
  children: ReactNode;
}) {
  const toneClasses = {
    info: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
    critical:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300",
  }[tone];

  return (
    <p className={`rounded-md border px-4 py-3 text-sm ${toneClasses}`}>{children}</p>
  );
}
