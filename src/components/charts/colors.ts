/**
 * Chart colours as Tailwind class pairs rather than hex literals.
 *
 * Every chart in this app is inline SVG or CSS — there is no charting library —
 * so the palette has to survive dark mode the same way the rest of the UI does:
 * a `dark:` variant on every colour. Hard-coded hex fills look correct in light
 * mode and then disappear against a near-black background, which is exactly the
 * failure a farm owner hits when they open the dashboard before dawn.
 *
 * The 500/400 pairing is deliberate: the 500 shade carries enough contrast on
 * white, and the 400 shade lifts off #0a0a0a without glowing.
 */

export type SeriesColor = {
  /** SVG shape fill. */
  fill: string;
  /** SVG line/border stroke. */
  stroke: string;
  /** CSS-bar background, for the non-SVG charts. */
  bg: string;
  /** Legend swatch text colour. */
  text: string;
};

export const SERIES_COLORS: SeriesColor[] = [
  {
    fill: "fill-sky-500 dark:fill-sky-400",
    stroke: "stroke-sky-500 dark:stroke-sky-400",
    bg: "bg-sky-500 dark:bg-sky-400",
    text: "text-sky-700 dark:text-sky-300",
  },
  {
    fill: "fill-emerald-500 dark:fill-emerald-400",
    stroke: "stroke-emerald-500 dark:stroke-emerald-400",
    bg: "bg-emerald-500 dark:bg-emerald-400",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  {
    fill: "fill-amber-500 dark:fill-amber-400",
    stroke: "stroke-amber-500 dark:stroke-amber-400",
    bg: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-700 dark:text-amber-300",
  },
  {
    fill: "fill-violet-500 dark:fill-violet-400",
    stroke: "stroke-violet-500 dark:stroke-violet-400",
    bg: "bg-violet-500 dark:bg-violet-400",
    text: "text-violet-700 dark:text-violet-300",
  },
  {
    fill: "fill-rose-500 dark:fill-rose-400",
    stroke: "stroke-rose-500 dark:stroke-rose-400",
    bg: "bg-rose-500 dark:bg-rose-400",
    text: "text-rose-700 dark:text-rose-300",
  },
  {
    fill: "fill-teal-500 dark:fill-teal-400",
    stroke: "stroke-teal-500 dark:stroke-teal-400",
    bg: "bg-teal-500 dark:bg-teal-400",
    text: "text-teal-700 dark:text-teal-300",
  },
  {
    fill: "fill-orange-500 dark:fill-orange-400",
    stroke: "stroke-orange-500 dark:stroke-orange-400",
    bg: "bg-orange-500 dark:bg-orange-400",
    text: "text-orange-700 dark:text-orange-300",
  },
  {
    fill: "fill-indigo-500 dark:fill-indigo-400",
    stroke: "stroke-indigo-500 dark:stroke-indigo-400",
    bg: "bg-indigo-500 dark:bg-indigo-400",
    text: "text-indigo-700 dark:text-indigo-300",
  },
];

export function seriesColor(index: number): SeriesColor {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** Neutral bar for single-series charts, where colour carries no meaning. */
export const NEUTRAL: SeriesColor = {
  fill: "fill-zinc-400 dark:fill-zinc-500",
  stroke: "stroke-zinc-400 dark:stroke-zinc-500",
  bg: "bg-zinc-300 dark:bg-zinc-600",
  text: "text-zinc-600 dark:text-zinc-400",
};

/** Reference/benchmark lines and axes. */
export const AXIS_STROKE = "stroke-zinc-300 dark:stroke-zinc-700";
export const GRID_STROKE = "stroke-zinc-200 dark:stroke-zinc-800";
export const BENCHMARK_STROKE = "stroke-zinc-400 dark:stroke-zinc-500";

/** Severity-flavoured bars, for "this value is bad" charts. */
export const GOOD: SeriesColor = SERIES_COLORS[1];
export const BAD: SeriesColor = SERIES_COLORS[4];
