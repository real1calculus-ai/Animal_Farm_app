import { ChartFrame, ChartLegend, formatNumber } from "@/components/charts/chart-frame";
import {
  AXIS_STROKE,
  BENCHMARK_STROKE,
  GRID_STROKE,
  seriesColor,
} from "@/components/charts/colors";

export type LinePoint = {
  label: string;
  /** Null renders a gap rather than a zero — "no weigh-in that month" is not "0 kg". */
  value: number | null;
};

export type LineSeries = {
  name: string;
  points: LinePoint[];
  /** Drawn dashed and unfilled — used for the weight-at-age benchmark curve. */
  isBenchmark?: boolean;
};

const WIDTH = 640;
const HEIGHT = 190;
const PAD_LEFT = 42;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 26;

/**
 * Multi-series line chart as inline SVG.
 *
 * All series must share the same x labels — every caller here is plotting
 * against the same bucketed timeline, and letting series carry independent
 * x-axes would mean interpolating, which silently invents data points the farm
 * never recorded.
 */
export function LineChart({
  title,
  description,
  series,
  formatValue = (value: number) => formatNumber(value),
  yZero = false,
  emptyMessage,
  footnote,
}: {
  title: string;
  description?: string;
  series: LineSeries[];
  formatValue?: (value: number) => string;
  /** Anchors the y-axis at zero — right for counts, wrong for weights. */
  yZero?: boolean;
  emptyMessage?: string;
  footnote?: React.ReactNode;
}) {
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const values = series.flatMap((s) =>
    s.points.map((p) => p.value).filter((v): v is number => v !== null)
  );

  const isEmpty = labels.length === 0 || values.length === 0;

  let min = values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 1;
  if (yZero) min = Math.min(0, min);
  if (max === min) max = min + 1;
  // A little headroom so the top point isn't welded to the frame.
  const span = max - min;
  max += span * 0.08;
  min -= yZero && min === 0 ? 0 : span * 0.08;

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (index: number) =>
    labels.length <= 1
      ? PAD_LEFT + plotWidth / 2
      : PAD_LEFT + (index / (labels.length - 1)) * plotWidth;
  const y = (value: number) => PAD_TOP + plotHeight - ((value - min) / (max - min)) * plotHeight;

  // Every 1st, middle and last label, plus a stride that keeps them from
  // colliding on a narrow screen.
  const stride = Math.max(1, Math.ceil(labels.length / 6));

  return (
    <ChartFrame
      title={title}
      description={description}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      footnote={footnote}
      legend={
        series.length > 1 ? (
          <ChartLegend
            items={series.map((s, i) => ({
              label: s.isBenchmark ? `${s.name} (benchmark)` : s.name,
              bg: s.isBenchmark ? "bg-zinc-400 dark:bg-zinc-500" : seriesColor(i).bg,
            }))}
          />
        ) : undefined
      }
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-44 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}. ${series
          .map(
            (s) =>
              `${s.name}: ${formatValue(
                s.points.filter((p) => p.value !== null).at(-1)?.value ?? 0
              )} most recently`
          )
          .join("; ")}`}
      >
        {/* Horizontal gridlines at min / mid / max. */}
        {[0, 0.5, 1].map((t) => {
          const value = min + (max - min) * (1 - t);
          return (
            <g key={t}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={PAD_TOP + plotHeight * t}
                y2={PAD_TOP + plotHeight * t}
                className={GRID_STROKE}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD_LEFT - 6}
                y={PAD_TOP + plotHeight * t + 3}
                textAnchor="end"
                className="fill-zinc-500 text-[9px] dark:fill-zinc-400"
              >
                {formatValue(value)}
              </text>
            </g>
          );
        })}

        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT}
          y1={PAD_TOP}
          y2={PAD_TOP + plotHeight}
          className={AXIS_STROKE}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {series.map((s, seriesIndex) => {
          const color = seriesColor(seriesIndex);
          // Split into runs of consecutive non-null points so gaps stay gaps.
          const runs: { index: number; value: number }[][] = [];
          let current: { index: number; value: number }[] = [];
          s.points.forEach((point, index) => {
            if (point.value === null) {
              if (current.length > 0) runs.push(current);
              current = [];
            } else {
              current.push({ index, value: point.value });
            }
          });
          if (current.length > 0) runs.push(current);

          return (
            <g key={s.name}>
              {runs.map((run, runIndex) => (
                <polyline
                  key={runIndex}
                  points={run.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={s.isBenchmark ? "4 3" : undefined}
                  className={s.isBenchmark ? BENCHMARK_STROKE : color.stroke}
                />
              ))}
              {!s.isBenchmark &&
                s.points.map((point, index) =>
                  point.value === null ? null : (
                    <circle
                      key={index}
                      cx={x(index)}
                      cy={y(point.value)}
                      r={2}
                      className={color.fill}
                    />
                  )
                )}
            </g>
          );
        })}

        {labels.map((label, index) =>
          index % stride === 0 || index === labels.length - 1 ? (
            <text
              key={label + index}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-zinc-500 text-[9px] dark:fill-zinc-400"
            >
              {label}
            </text>
          ) : null
        )}
      </svg>
    </ChartFrame>
  );
}

/**
 * Trend-only line, no axes — sized to sit inside a dashboard tile. Deliberately
 * unlabelled beyond its `label`: it answers "which way is this going", and the
 * number it belongs to is already on the tile.
 */
export function Sparkline({
  values,
  label,
  className = "h-10 w-full",
}: {
  values: number[];
  label: string;
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Not enough history yet to show a trend.
      </p>
    );
  }

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const width = 200;
  const height = 40;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / (max - min || 1)) * (height - 4) - 2;

  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${height} ${line} ${x(values.length - 1)},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${values.map((v) => formatNumber(v)).join(", ")}`}
    >
      <polygon points={area} className="fill-sky-500/15 dark:fill-sky-400/20" />
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className="stroke-sky-600 dark:stroke-sky-400"
      />
    </svg>
  );
}
