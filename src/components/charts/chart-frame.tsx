import type { ReactNode } from "react";

/**
 * Shared shell for every chart: a caption, an optional one-line reading of what
 * the chart is for, and — crucially — a real empty state.
 *
 * A chart with no data must say so in words. An axis with nothing on it looks
 * identical to a chart that failed to load, and on a farm that has just started
 * recording, most charts are empty for the first few weeks.
 */
export function ChartFrame({
  title,
  description,
  isEmpty,
  emptyMessage = "Nothing recorded in this period yet.",
  legend,
  footnote,
  children,
}: {
  title: string;
  description?: string;
  isEmpty?: boolean;
  emptyMessage?: string;
  legend?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </span>
        ) : null}
      </figcaption>

      {isEmpty ? (
        <p className="rounded-md border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {emptyMessage}
        </p>
      ) : (
        <>
          {children}
          {legend ? <div className="mt-3">{legend}</div> : null}
        </>
      )}

      {footnote ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{footnote}</p>
      ) : null}
    </figure>
  );
}

/** Swatch + label row, shared by the multi-series charts. */
export function ChartLegend({ items }: { items: { label: string; bg: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${item.bg}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Compact number formatting shared by the chart labels. */
export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return value.toLocaleString("en-GB");
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
