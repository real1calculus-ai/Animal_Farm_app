import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { RANGE_PRESETS, toParam, type DateRange } from "@/components/reports/date-range";

/**
 * Period selector: preset chips plus an explicit from/to form.
 *
 * The presets are plain links, not a `<select>`, so the whole control works
 * with JavaScript still loading — the barn's signal is bad enough that a
 * report which needs hydration before it can change period is a report nobody
 * changes the period on. The custom form is a normal GET, for the same reason.
 */
export function DateRangePicker({ path, range }: { path: string; range: DateRange }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGE_PRESETS.map((preset) => {
          const active = range.preset === preset.key;
          return (
            <Link
              key={preset.key}
              href={`${path}?range=${preset.key}`}
              aria-current={active ? "true" : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {preset.label}
            </Link>
          );
        })}
      </div>

      <form method="get" action={path} className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="mb-1 block">From</span>
          <Input
            type="date"
            name="from"
            defaultValue={range.preset === "custom" ? toParam(range.from) : ""}
            className="w-40"
          />
        </label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="mb-1 block">To</span>
          <Input
            type="date"
            name="to"
            defaultValue={range.preset === "custom" ? toParam(range.to) : ""}
            className="w-40"
          />
        </label>
        <Button type="submit" variant="secondary">
          Apply custom range
        </Button>
      </form>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Showing {formatDate(range.from)} – {formatDate(range.to)} ({range.days} days).
      </p>
    </div>
  );
}
