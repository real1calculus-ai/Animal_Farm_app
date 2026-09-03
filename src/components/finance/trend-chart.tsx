import { formatCentsCompact } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/db/finance";

/**
 * Month-over-month income and expense, as inline SVG.
 *
 * Hand-drawn rather than pulled from a chart library: this is six pairs of
 * rectangles, and a charting dependency would cost more kilobytes than the
 * rest of the page. Drawn in a fixed viewBox and scaled with CSS, so it stays
 * legible from a 360px phone to a desktop without a resize observer.
 *
 * Colour is not the only carrier of meaning — each pair is labelled and the
 * whole figure has a text summary for screen readers.
 */

const VIEW_W = 720;
const VIEW_H = 220;
const PAD_TOP = 12;
const PAD_BOTTOM = 34;
const PAD_X = 8;

export function TrendChart({ points }: { points: MonthlyPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No transactions recorded yet.
      </p>
    );
  }

  const max = Math.max(...points.flatMap((p) => [p.incomeCents, p.expenseCents]), 1);
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const slot = (VIEW_W - PAD_X * 2) / points.length;
  const barW = Math.min(26, (slot - 10) / 2);

  const scale = (cents: number) => (cents / max) * plotH;

  const summary = points
    .map(
      (p) =>
        `${p.label}: income ${formatCentsCompact(p.incomeCents)}, expenses ${formatCentsCompact(p.expenseCents)}`
    )
    .join(". ");

  return (
    <figure className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-44 w-full sm:h-52"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Income and expenses by month. ${summary}`}
      >
        {/* Baseline */}
        <line
          x1={PAD_X}
          y1={PAD_TOP + plotH}
          x2={VIEW_W - PAD_X}
          y2={PAD_TOP + plotH}
          className="stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth={1}
        />

        {points.map((point, index) => {
          const centre = PAD_X + slot * index + slot / 2;
          const incomeH = scale(point.incomeCents);
          const expenseH = scale(point.expenseCents);

          return (
            <g key={point.start.toISOString()}>
              <rect
                x={centre - barW - 2}
                y={PAD_TOP + plotH - incomeH}
                width={barW}
                height={Math.max(incomeH, point.incomeCents > 0 ? 2 : 0)}
                rx={2}
                className="fill-emerald-500/85 dark:fill-emerald-500/75"
              />
              <rect
                x={centre + 2}
                y={PAD_TOP + plotH - expenseH}
                width={barW}
                height={Math.max(expenseH, point.expenseCents > 0 ? 2 : 0)}
                rx={2}
                className="fill-amber-500/85 dark:fill-amber-500/75"
              />
              <text
                x={centre}
                y={VIEW_H - 14}
                textAnchor="middle"
                className="fill-zinc-500 text-[13px] dark:fill-zinc-400"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/85" aria-hidden="true" />
          Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/85" aria-hidden="true" />
          Expenses
        </span>
        <span className="text-zinc-500 dark:text-zinc-500">
          Tallest bar {formatCentsCompact(max)}
        </span>
      </figcaption>
    </figure>
  );
}
