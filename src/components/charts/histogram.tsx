import { ChartFrame, formatNumber } from "@/components/charts/chart-frame";
import { AXIS_STROKE, NEUTRAL, type SeriesColor } from "@/components/charts/colors";

export type HistogramBucket = {
  /** Axis label for the bucket, e.g. "0–5%". */
  label: string;
  count: number;
  /** Colour override — the genetics report reds the over-threshold buckets. */
  color?: SeriesColor;
};

const WIDTH = 640;
const HEIGHT = 190;
const PAD_LEFT = 30;
const PAD_RIGHT = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 30;

/**
 * Distribution of a value across buckets, as inline SVG columns.
 *
 * Kept distinct from BarChart because the question is different: a histogram is
 * read as a *shape* — where the mass sits and how long the right tail is — so
 * the buckets stay in numeric order and keep their width even when empty. A bar
 * chart sorts by value and drops empty categories; doing that here would hide
 * the gap that is the finding.
 */
export function Histogram({
  title,
  description,
  buckets,
  emptyMessage,
  footnote,
  xAxisLabel,
}: {
  title: string;
  description?: string;
  buckets: HistogramBucket[];
  emptyMessage?: string;
  footnote?: React.ReactNode;
  xAxisLabel?: string;
}) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(...buckets.map((b) => b.count), 1);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = buckets.length > 0 ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.max(4, slot * 0.7);

  return (
    <ChartFrame
      title={title}
      description={description}
      isEmpty={total === 0}
      emptyMessage={emptyMessage}
      footnote={footnote}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-48 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}. ${buckets
          .map((b) => `${b.label}: ${b.count}`)
          .join(", ")}. ${total} animals in total.`}
      >
        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={PAD_TOP + plotHeight}
          y2={PAD_TOP + plotHeight}
          className={AXIS_STROKE}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {buckets.map((bucket, index) => {
          const height = (bucket.count / max) * plotHeight;
          const cx = PAD_LEFT + slot * index + slot / 2;
          const color = bucket.color ?? NEUTRAL;
          return (
            <g key={bucket.label}>
              <rect
                x={cx - barWidth / 2}
                y={PAD_TOP + plotHeight - height}
                width={barWidth}
                height={Math.max(height, bucket.count > 0 ? 2 : 0)}
                rx={2}
                className={color.fill}
              />
              {bucket.count > 0 ? (
                <text
                  x={cx}
                  y={PAD_TOP + plotHeight - height - 4}
                  textAnchor="middle"
                  className="fill-zinc-600 text-[9px] dark:fill-zinc-400"
                >
                  {formatNumber(bucket.count)}
                </text>
              ) : null}
              <text
                x={cx}
                y={HEIGHT - PAD_BOTTOM + 14}
                textAnchor="middle"
                className="fill-zinc-500 text-[9px] dark:fill-zinc-400"
              >
                {bucket.label}
              </text>
            </g>
          );
        })}

        {xAxisLabel ? (
          <text
            x={WIDTH / 2}
            y={HEIGHT - 3}
            textAnchor="middle"
            className="fill-zinc-400 text-[9px] dark:fill-zinc-500"
          >
            {xAxisLabel}
          </text>
        ) : null}
      </svg>
    </ChartFrame>
  );
}
