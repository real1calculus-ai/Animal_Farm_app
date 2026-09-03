import { formatDate, formatKg } from "@/lib/format";

export type WeightPoint = { recordedAt: Date; weightKg: number };

const WIDTH = 640;
const HEIGHT = 240;
const PADDING = { top: 16, right: 16, bottom: 32, left: 52 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

/**
 * Growth curve, drawn as inline SVG.
 *
 * No charting library: this is one series of a few dozen points, and a chart
 * dependency would cost more kilobytes over a barn's mobile connection than
 * the entire rest of the page. The viewBox scales it to whatever width it is
 * given, so it stays readable on a phone.
 */
export function WeightChart({ points }: { points: WeightPoint[] }) {
  if (points.length === 0) return null;

  const times = points.map((point) => point.recordedAt.getTime());
  const weights = points.map((point) => point.weightKg);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);

  // A single weigh-in, or several at the same weight, would otherwise divide
  // by zero; pad the range so the point lands mid-plot instead.
  const timeSpan = maxTime - minTime || 1;
  const weightPad = (maxWeight - minWeight) * 0.1 || Math.max(maxWeight * 0.1, 1);
  const yMin = Math.max(0, minWeight - weightPad);
  const yMax = maxWeight + weightPad;
  const weightSpan = yMax - yMin || 1;

  const x = (time: number) => PADDING.left + ((time - minTime) / timeSpan) * PLOT_WIDTH;
  const y = (weight: number) =>
    PADDING.top + PLOT_HEIGHT - ((weight - yMin) / weightSpan) * PLOT_HEIGHT;

  const coords = points.map((point) => ({
    cx: x(point.recordedAt.getTime()),
    cy: y(point.weightKg),
    point,
  }));

  const gridValues = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <figure className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full min-w-[320px]"
        role="img"
        aria-label={`Growth curve: ${points.length} weigh-ins from ${formatKg(
          points[0].weightKg
        )} on ${formatDate(points[0].recordedAt)} to ${formatKg(
          points[points.length - 1].weightKg
        )} on ${formatDate(points[points.length - 1].recordedAt)}`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(value)}
              y2={y(value)}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 8}
              y={y(value) + 4}
              textAnchor="end"
              className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
            >
              {value.toFixed(0)}
            </text>
          </g>
        ))}

        {coords.length > 1 ? (
          <polyline
            points={coords.map((coord) => `${coord.cx},${coord.cy}`).join(" ")}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-emerald-600 dark:stroke-emerald-400"
          />
        ) : null}

        {coords.map((coord) => (
          <circle
            key={`${coord.cx}-${coord.cy}`}
            cx={coord.cx}
            cy={coord.cy}
            r={3.5}
            className="fill-emerald-600 dark:fill-emerald-400"
          >
            <title>
              {formatDate(coord.point.recordedAt)}: {formatKg(coord.point.weightKg)}
            </title>
          </circle>
        ))}

        <text
          x={PADDING.left}
          y={HEIGHT - 8}
          className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
        >
          {formatDate(points[0].recordedAt)}
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 8}
          textAnchor="end"
          className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
        >
          {formatDate(points[points.length - 1].recordedAt)}
        </text>
      </svg>
      <figcaption className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Liveweight in kilograms against weigh-in date.
      </figcaption>
    </figure>
  );
}
