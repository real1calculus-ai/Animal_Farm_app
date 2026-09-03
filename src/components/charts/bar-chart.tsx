import { ChartFrame, formatNumber } from "@/components/charts/chart-frame";
import { NEUTRAL, type SeriesColor } from "@/components/charts/colors";

export type BarDatum = {
  label: string;
  value: number;
  /** Small right-aligned note, e.g. the sample size behind the bar. */
  hint?: string;
  /** Overrides the default neutral colour — used to flag outliers. */
  color?: SeriesColor;
};

/**
 * Horizontal bars, built from CSS rather than SVG.
 *
 * Horizontal on purpose: the categories here are sire tags, pen names and
 * diagnoses, and rotated x-axis labels are unreadable on the phone this app is
 * actually used on. A CSS bar also reflows with the container for free, which
 * an SVG with a fixed viewBox does not.
 */
export function BarChart({
  title,
  description,
  data,
  formatValue = (value: number) => formatNumber(value),
  emptyMessage,
  footnote,
  max,
}: {
  title: string;
  description?: string;
  data: BarDatum[];
  formatValue?: (value: number) => string;
  emptyMessage?: string;
  footnote?: React.ReactNode;
  /** Fixes the scale — pass 1 for fractions so bars are comparable across charts. */
  max?: number;
}) {
  const scaleMax = max ?? Math.max(...data.map((d) => d.value), 0);
  const safeMax = scaleMax > 0 ? scaleMax : 1;

  return (
    <ChartFrame
      title={title}
      description={description}
      isEmpty={data.length === 0}
      emptyMessage={emptyMessage}
      footnote={footnote}
    >
      <ul className="flex flex-col gap-2">
        {data.map((datum) => {
          const pct = Math.max(0, Math.min(100, (datum.value / safeMax) * 100));
          const color = datum.color ?? NEUTRAL;
          return (
            <li key={datum.label} className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-2">
              <span className="truncate text-xs text-zinc-600 dark:text-zinc-400" title={datum.label}>
                {datum.label}
              </span>
              <span
                className="h-3 w-full overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800"
                role="img"
                aria-label={`${datum.label}: ${formatValue(datum.value)}`}
              >
                <span className={`block h-full rounded-sm ${color.bg}`} style={{ width: `${pct}%` }} />
              </span>
              <span className="whitespace-nowrap text-right text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                {formatValue(datum.value)}
                {datum.hint ? (
                  <span className="ml-1 text-zinc-400 dark:text-zinc-500">{datum.hint}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
