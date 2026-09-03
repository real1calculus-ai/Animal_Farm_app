import { Select } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PERIOD_PRESETS, PERIOD_PRESET_LABELS, type Period } from "@/lib/finance/period";
import { toDateInputValue } from "@/lib/format";

/**
 * A plain GET form, not a client component. The chosen period lives in the URL
 * so a report can be bookmarked, shared with an accountant, or reloaded after
 * a mutation without losing the range someone just set up.
 */
export function PeriodPicker({ period, action }: { period: Period; action: string }) {
  return (
    <form action={action} method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Period</span>
        <Select name="period" defaultValue={period.preset} className="w-auto">
          {PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {PERIOD_PRESET_LABELS[preset]}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">From</span>
        <Input type="date" name="from" defaultValue={toDateInputValue(period.start)} className="w-auto" />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">To</span>
        <Input type="date" name="to" defaultValue={toDateInputValue(period.end)} className="w-auto" />
      </label>

      <Button type="submit" variant="secondary">
        Apply
      </Button>

      <span className="text-sm text-zinc-500 dark:text-zinc-400">Showing {period.label}</span>
    </form>
  );
}
