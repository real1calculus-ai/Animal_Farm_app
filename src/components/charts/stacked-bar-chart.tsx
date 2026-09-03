import { ChartFrame, ChartLegend, formatNumber } from "@/components/charts/chart-frame";
import { seriesColor } from "@/components/charts/colors";

export type StackedRow = {
  label: string;
  segments: { name: string; value: number }[];
  /** Right-hand note, e.g. the row total in its natural unit. */
  hint?: string;
};

/**
 * Composition across rows — feed usage split by classification, mortality split
 * by cause, disease split by category.
 *
 * Rows are normalised to their own total so the *mix* is comparable between a
 * pen of 8 and a pen of 80; the absolute total goes in `hint`, because a
 * percentage without its denominator is how a single sick piglet becomes
 * "50% respiratory disease".
 */
export function StackedBarChart({
  title,
  description,
  rows,
  seriesNames,
  emptyMessage,
  footnote,
  formatSegment = (value: number) => formatNumber(value),
}: {
  title: string;
  description?: string;
  rows: StackedRow[];
  /** Segment order and legend order; rows may omit a name (treated as zero). */
  seriesNames: string[];
  emptyMessage?: string;
  footnote?: React.ReactNode;
  formatSegment?: (value: number) => string;
}) {
  const populated = rows.filter((row) =>
    row.segments.some((segment) => segment.value > 0)
  );

  return (
    <ChartFrame
      title={title}
      description={description}
      isEmpty={populated.length === 0}
      emptyMessage={emptyMessage}
      footnote={footnote}
      legend={
        <ChartLegend
          items={seriesNames.map((name, i) => ({ label: name, bg: seriesColor(i).bg }))}
        />
      }
    >
      <ul className="flex flex-col gap-2">
        {populated.map((row) => {
          const total = row.segments.reduce((sum, s) => sum + s.value, 0) || 1;
          return (
            <li key={row.label} className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-2">
              <span className="truncate text-xs text-zinc-600 dark:text-zinc-400" title={row.label}>
                {row.label}
              </span>
              <span
                className="flex h-3 w-full overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800"
                role="img"
                aria-label={`${row.label}: ${row.segments
                  .filter((s) => s.value > 0)
                  .map((s) => `${s.name} ${formatSegment(s.value)}`)
                  .join(", ")}`}
              >
                {seriesNames.map((name, i) => {
                  const value = row.segments.find((s) => s.name === name)?.value ?? 0;
                  if (value <= 0) return null;
                  return (
                    <span
                      key={name}
                      className={`block h-full ${seriesColor(i).bg}`}
                      style={{ width: `${(value / total) * 100}%` }}
                    />
                  );
                })}
              </span>
              <span className="whitespace-nowrap text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {row.hint ?? formatSegment(total)}
              </span>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
