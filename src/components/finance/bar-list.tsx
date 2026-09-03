import { formatCents } from "@/lib/format";

/**
 * A horizontal bar list — the breakdown of expenses by category and income by
 * source.
 *
 * Plain CSS widths rather than a charting library: there are at most a dozen
 * categories, every one of them is labelled with its own figure anyway, and a
 * bar list reads better than a pie chart on a phone held one-handed in a barn.
 * It also renders entirely on the server, so there is no client bundle and no
 * layout shift while a chart library boots.
 */

export type BarListItem = {
  key: string;
  label: string;
  amountCents: number;
  count?: number;
};

export function BarList({
  items,
  tone = "neutral",
  emptyMessage = "Nothing recorded in this period.",
}: {
  items: BarListItem[];
  tone?: "neutral" | "income" | "expense";
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>;
  }

  const total = items.reduce((sum, item) => sum + item.amountCents, 0);
  // Scale against the largest bar, not the total: with one dominant category
  // (feed usually) every other bar collapses to an invisible sliver otherwise.
  const max = Math.max(...items.map((item) => item.amountCents), 1);

  const barClass =
    tone === "income"
      ? "bg-emerald-500/80 dark:bg-emerald-500/70"
      : tone === "expense"
        ? "bg-amber-500/80 dark:bg-amber-500/70"
        : "bg-zinc-400/80 dark:bg-zinc-500/70";

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const share = total > 0 ? item.amountCents / total : 0;
        const width = Math.max(1, (item.amountCents / max) * 100);

        return (
          <li key={item.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                {item.label}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-300">
                {formatCents(item.amountCents)}
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {(share * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
              role="img"
              aria-label={`${item.label}: ${formatCents(item.amountCents)}, ${(share * 100).toFixed(0)} percent of the total`}
            >
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
