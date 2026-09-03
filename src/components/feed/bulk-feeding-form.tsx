"use client";

import { useMemo, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatKg, toDateInputValue } from "@/lib/format";

export type BulkPenRow = {
  penId: string;
  penName: string;
  animalCount: number;
  stageLabel: string;
  /** From the matching feeding programme, when there is one. */
  feedTypeId: string | null;
  /** The whole pen's ration for the day, already summed over its animals. */
  rationKg: number | null;
  /** Why there is no ration, when there isn't one. */
  reason: string | null;
};

export type BulkFeedType = {
  id: string;
  name: string;
  usableKg: number;
};

/**
 * "Feed every pen its programme ration", one submit.
 *
 * This is the screen that decides whether the feed module gets used at all.
 * Twenty pens through the single-record form is twenty page loads in a barn on
 * a phone, and what actually happens then is that nobody logs anything — which
 * is worse than a rough figure, because every FCR and cost-per-kg downstream
 * is computed from these rows and silently reads better than reality when they
 * are missing.
 *
 * Pens with a programme are pre-ticked with their ration already worked out.
 * The running total per feed type sits under the table so a shortfall is
 * visible before the submit rather than as an error afterwards.
 */
export function BulkFeedingForm({
  action,
  pens,
  feedTypes,
}: {
  action: (formData: FormData) => Promise<void>;
  pens: BulkPenRow[];
  feedTypes: BulkFeedType[];
}) {
  const today = toDateInputValue(new Date());

  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      pens.map((pen) => [pen.penId, pen.feedTypeId !== null && pen.animalCount > 0])
    )
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pens.map((pen) => [
        pen.penId,
        pen.rationKg !== null ? pen.rationKg.toFixed(1) : "",
      ])
    )
  );
  const [feedChoice, setFeedChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(pens.map((pen) => [pen.penId, pen.feedTypeId ?? ""]))
  );

  const totals = useMemo(() => {
    const byFeedType = new Map<string, number>();
    for (const pen of pens) {
      if (!selected[pen.penId]) continue;
      const feedTypeId = feedChoice[pen.penId];
      const kg = Number.parseFloat(quantities[pen.penId] ?? "");
      if (!feedTypeId || !Number.isFinite(kg) || kg <= 0) continue;
      byFeedType.set(feedTypeId, (byFeedType.get(feedTypeId) ?? 0) + kg);
    }
    return [...byFeedType.entries()].map(([id, kg]) => {
      const feedType = feedTypes.find((f) => f.id === id);
      return {
        id,
        name: feedType?.name ?? "Unknown feed",
        kg,
        usableKg: feedType?.usableKg ?? 0,
        short: kg > (feedType?.usableKg ?? 0),
      };
    });
  }, [pens, selected, feedChoice, quantities, feedTypes]);

  const selectedCount = pens.filter((pen) => selected[pen.penId]).length;
  const anyShort = totals.some((total) => total.short);

  function toggleAll(next: boolean) {
    setSelected(Object.fromEntries(pens.map((pen) => [pen.penId, next && pen.animalCount > 0])));
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date fed" htmlFor="bulk-fedAt" required>
          <Input id="bulk-fedAt" name="fedAt" type="date" required max={today} defaultValue={today} />
        </Field>
        <Field label="Notes (applied to every pen)" htmlFor="bulk-notes">
          <Textarea id="bulk-notes" name="notes" rows={1} placeholder="e.g. Morning feed" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {selectedCount} of {pens.length} pens selected
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Clear
          </button>
        </div>
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th className="w-10">
              <span className="sr-only">Include</span>
            </Th>
            <Th>Pen</Th>
            <Th>Feed</Th>
            <Th className="text-right">Total kg</Th>
          </Tr>
        </Thead>
        <Tbody>
          {pens.map((pen) => {
            const isOn = Boolean(selected[pen.penId]);
            return (
              <Tr key={pen.penId} className={isOn ? "" : "opacity-60"}>
                <Td>
                  <input
                    type="checkbox"
                    name="penId"
                    value={pen.penId}
                    checked={isOn}
                    disabled={pen.animalCount === 0}
                    onChange={(event) =>
                      setSelected((prev) => ({ ...prev, [pen.penId]: event.target.checked }))
                    }
                    aria-label={`Record feeding for ${pen.penName}`}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                  />
                </Td>
                <Td>
                  <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                    {pen.penName}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {pen.animalCount} {pen.animalCount === 1 ? "animal" : "animals"} · {pen.stageLabel}
                  </span>
                  {pen.reason ? (
                    <Badge variant="warning" className="mt-1">
                      {pen.reason}
                    </Badge>
                  ) : null}
                  {/* Sent for every checked pen; the action reads it by pen id. */}
                  <input type="hidden" name={`count-${pen.penId}`} value={pen.animalCount} />
                </Td>
                <Td>
                  <Select
                    name={`feedType-${pen.penId}`}
                    value={feedChoice[pen.penId] ?? ""}
                    onChange={(event) =>
                      setFeedChoice((prev) => ({ ...prev, [pen.penId]: event.target.value }))
                    }
                    aria-label={`Feed type for ${pen.penName}`}
                    className="min-w-40"
                  >
                    <option value="">— Select —</option>
                    {feedTypes.map((feedType) => (
                      <option key={feedType.id} value={feedType.id}>
                        {feedType.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td className="text-right">
                  <Input
                    name={`kg-${pen.penId}`}
                    type="number"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    value={quantities[pen.penId] ?? ""}
                    onChange={(event) =>
                      setQuantities((prev) => ({ ...prev, [pen.penId]: event.target.value }))
                    }
                    aria-label={`Kilograms for ${pen.penName}`}
                    className="w-24 text-right"
                  />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      {totals.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            This will draw
          </p>
          <ul className="space-y-1 text-sm">
            {totals.map((total) => (
              <li key={total.id} className="flex items-baseline justify-between gap-3">
                <span className="text-zinc-700 dark:text-zinc-300">{total.name}</span>
                <span
                  className={`tabular-nums ${
                    total.short
                      ? "font-medium text-red-700 dark:text-red-400"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {formatKg(total.kg)} of {formatKg(total.usableKg)} usable
                </span>
              </li>
            ))}
          </ul>
          {anyShort ? (
            <p className="mt-2 text-xs text-red-700 dark:text-red-400">
              At least one feed is short. Pens that cannot be filled are skipped and reported —
              the rest are still recorded.
            </p>
          ) : null}
        </div>
      ) : null}

      <SubmitButton pendingLabel="Recording…" disabled={selectedCount === 0}>
        Record {selectedCount} {selectedCount === 1 ? "pen" : "pens"}
      </SubmitButton>
    </form>
  );
}
