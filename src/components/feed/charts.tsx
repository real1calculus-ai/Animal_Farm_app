/**
 * Inline-SVG charts for the feed module. No charting library on purpose: these
 * are four fixed shapes on a page that is mostly read on a phone over a barn's
 * mobile signal, and a 100 kB chart bundle to draw twenty line segments is not
 * a trade worth making. They are Server Components — the markup ships already
 * rendered, with no hydration at all.
 *
 * Colours come through Tailwind classes on the SVG and `currentColor` on the
 * marks, so dark mode is handled by the same class pairs as everything else.
 */

export type SeriesPoint = {
  label: string;
  value: number;
};

/**
 * Intake trend. Draws the series as a line with an area fill, plus an optional
 * baseline rule — on the consumption charts that baseline is the preceding
 * week's average, which is what makes a drop visible rather than merely
 * present in the numbers.
 */
export function LineChart({
  points,
  height = 140,
  baseline,
  baselineLabel,
  ariaLabel,
  tone = "default",
}: {
  points: readonly SeriesPoint[];
  height?: number;
  baseline?: number | null;
  baselineLabel?: string;
  ariaLabel: string;
  tone?: "default" | "danger";
}) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Not enough data to chart yet.
      </p>
    );
  }

  const width = 600;
  const padding = { top: 8, right: 8, bottom: 22, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  const candidates = baseline != null ? [...values, baseline] : values;
  const max = Math.max(...candidates, 0.0001);
  const min = Math.min(...candidates, 0);
  const span = max - min || 1;

  const x = (index: number) =>
    padding.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => padding.top + innerH - ((value - min) / span) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(padding.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padding.top + innerH).toFixed(1)} Z`;

  const strokeClass =
    tone === "danger" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${strokeClass}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <path d={area} fill="currentColor" opacity="0.12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={p.label} cx={x(i)} cy={y(p.value)} r="2.5" fill="currentColor" />
      ))}
      {baseline != null ? (
        <>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.5"
          />
          {baselineLabel ? (
            <text
              x={padding.left + 2}
              y={y(baseline) - 4}
              className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
            >
              {baselineLabel}
            </text>
          ) : null}
        </>
      ) : null}
      <text
        x={padding.left}
        y={height - 6}
        className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
      >
        {points[0].label}
      </text>
      {points.length > 1 ? (
        <text
          x={width - padding.right}
          y={height - 6}
          textAnchor="end"
          className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
        >
          {points[points.length - 1].label}
        </text>
      ) : null}
    </svg>
  );
}

/**
 * Horizontal bars with the label and value written next to each one. Preferred
 * over vertical columns because the labels here are pen names and feed types,
 * which do not fit under a 40px column on a phone.
 */
export function BarChart({
  points,
  ariaLabel,
  unit = "",
  highlight,
}: {
  points: readonly SeriesPoint[];
  ariaLabel: string;
  unit?: string;
  /** Labels drawn in the warning colour — the pens worth looking at. */
  highlight?: readonly string[];
}) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Nothing to chart yet.
      </p>
    );
  }

  const rowHeight = 26;
  const width = 600;
  const labelW = 150;
  const valueW = 84;
  const trackW = width - labelW - valueW;
  const max = Math.max(...points.map((p) => Math.abs(p.value)), 0.0001);

  return (
    <svg
      viewBox={`0 0 ${width} ${points.length * rowHeight}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      style={{ height: points.length * rowHeight }}
    >
      {points.map((point, i) => {
        const barW = (Math.abs(point.value) / max) * trackW;
        const flagged = highlight?.includes(point.label) ?? false;
        return (
          <g key={point.label} transform={`translate(0, ${i * rowHeight})`}>
            <text
              x="0"
              y={rowHeight / 2 + 4}
              className="fill-zinc-700 text-[11px] dark:fill-zinc-300"
            >
              {point.label.length > 22 ? `${point.label.slice(0, 21)}…` : point.label}
            </text>
            <rect
              x={labelW}
              y={5}
              width={trackW}
              height={rowHeight - 12}
              rx="2"
              className="fill-zinc-100 dark:fill-zinc-800"
            />
            <rect
              x={labelW}
              y={5}
              width={Math.max(barW, 1)}
              height={rowHeight - 12}
              rx="2"
              className={
                flagged
                  ? "fill-amber-500 dark:fill-amber-500"
                  : "fill-zinc-800 dark:fill-zinc-300"
              }
            />
            <text
              x={width}
              y={rowHeight / 2 + 4}
              textAnchor="end"
              className="fill-zinc-600 text-[11px] tabular-nums dark:fill-zinc-400"
            >
              {point.value.toFixed(2)}
              {unit}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Stock level against its reorder line. The reorder mark is drawn on the track
 * rather than written underneath it, because the only question this screen
 * has to answer at a glance is "am I under the line".
 */
export function StockBar({
  valueKg,
  reorderLevelKg,
  capacityKg,
  expiredKg = 0,
}: {
  valueKg: number;
  reorderLevelKg?: number;
  capacityKg?: number | null;
  expiredKg?: number;
}) {
  const scaleMax = Math.max(
    valueKg + expiredKg,
    capacityKg ?? 0,
    (reorderLevelKg ?? 0) * 1.5,
    1
  );
  const pct = (kg: number) => Math.min(100, (kg / scaleMax) * 100);
  const below = reorderLevelKg !== undefined && reorderLevelKg > 0 && valueKg < reorderLevelKg;

  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${
          below ? "bg-red-500" : "bg-emerald-500"
        }`}
        style={{ width: `${pct(valueKg)}%` }}
      />
      {expiredKg > 0 ? (
        <div
          className="absolute inset-y-0 bg-zinc-400 dark:bg-zinc-600"
          style={{ left: `${pct(valueKg)}%`, width: `${pct(expiredKg)}%` }}
          title={`${expiredKg.toFixed(1)} kg expired`}
        />
      ) : null}
      {reorderLevelKg !== undefined && reorderLevelKg > 0 ? (
        <div
          className="absolute inset-y-0 w-0.5 bg-zinc-900 dark:bg-zinc-100"
          style={{ left: `${pct(reorderLevelKg)}%` }}
          title={`Reorder level ${reorderLevelKg.toFixed(0)} kg`}
        />
      ) : null}
    </div>
  );
}
