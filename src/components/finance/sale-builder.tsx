"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatKg, toCents } from "@/lib/format";

/**
 * Line-item builder for an animal sale.
 *
 * The sale total is never typed by a human — it is the sum of the line
 * amounts, and each line amount is weight × price per kg. Asking for a total
 * as well would create two sources of truth that disagree the first time
 * someone edits a weight and forgets to recompute, so the total here is
 * display-only and the server recomputes it from the same inputs before
 * writing anything.
 *
 * Rows carry a stable client-side id rather than an array index, so the field
 * names stay attached to their row when an earlier row is removed. The server
 * action reads the `rowId` list and then pulls `item-<rowId>-*` for each,
 * which lets it use the normal `requireCents`/`requireFloat` validators
 * per-field instead of hand-parsing parallel arrays.
 */

export type SellableAnimal = {
  id: string;
  tagNumber: string;
  name: string | null;
  breed: string;
  currentWeightKg: number | null;
  penName: string | null;
  /** Set when the animal is inside a medication withdrawal period. */
  blockedReason: string | null;
};

type Row = { rowId: string; animalId: string; weightKg: string; pricePerKg: string };

let nextRowId = 0;
function makeRow(): Row {
  nextRowId += 1;
  return { rowId: `r${nextRowId}`, animalId: "", weightKg: "", pricePerKg: "" };
}

/** Line amount in minor units. Mirrors the server: round once, at the end. */
function lineAmountCents(row: Row): number {
  const weight = Number.parseFloat(row.weightKg);
  const priceCents = toCents(row.pricePerKg);
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0;
  return Math.round(weight * priceCents);
}

export function SaleBuilder({ animals }: { animals: SellableAnimal[] }) {
  const [rows, setRows] = useState<Row[]>([makeRow()]);

  const sellable = useMemo(() => animals.filter((a) => a.blockedReason === null), [animals]);
  const blocked = useMemo(() => animals.filter((a) => a.blockedReason !== null), [animals]);

  const chosen = new Set(rows.map((row) => row.animalId).filter(Boolean));
  const totalCents = rows.reduce((sum, row) => sum + lineAmountCents(row), 0);
  const usableRows = rows.filter((row) => row.animalId && lineAmountCents(row) > 0);

  function update(rowId: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((current) => [...current, makeRow()]);
  }

  function removeRow(rowId: string) {
    setRows((current) =>
      current.length === 1 ? [makeRow()] : current.filter((row) => row.rowId !== rowId)
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const animal = sellable.find((a) => a.id === row.animalId) ?? null;
          const amount = lineAmountCents(row);

          return (
            <div
              key={row.rowId}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <input type="hidden" name="rowId" value={row.rowId} />

              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Animal {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(row.rowId)}
                  className="text-xs font-medium text-red-600 underline hover:text-red-700 dark:text-red-400"
                >
                  Remove
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Animal" htmlFor={`animal-${row.rowId}`} required className="sm:col-span-3">
                  <Select
                    id={`animal-${row.rowId}`}
                    name={`item-${row.rowId}-animalId`}
                    value={row.animalId}
                    required
                    onChange={(event) => {
                      const animalId = event.target.value;
                      const picked = sellable.find((a) => a.id === animalId);
                      // Pre-fill the last recorded weight; it is almost always
                      // the right starting point and saves typing in a barn.
                      update(row.rowId, {
                        animalId,
                        weightKg:
                          row.weightKg ||
                          (picked?.currentWeightKg ? String(picked.currentWeightKg) : ""),
                      });
                    }}
                  >
                    <option value="">Select an animal…</option>
                    {sellable.map((option) => (
                      <option
                        key={option.id}
                        value={option.id}
                        disabled={chosen.has(option.id) && option.id !== row.animalId}
                      >
                        {option.tagNumber}
                        {option.name ? ` — ${option.name}` : ""} ({option.breed}
                        {option.penName ? `, ${option.penName}` : ""})
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Weight (kg)"
                  htmlFor={`weight-${row.rowId}`}
                  required
                  hint={
                    animal?.currentWeightKg
                      ? `Last recorded ${formatKg(animal.currentWeightKg)}`
                      : undefined
                  }
                >
                  <Input
                    id={`weight-${row.rowId}`}
                    name={`item-${row.rowId}-weightKg`}
                    type="number"
                    step="0.1"
                    min="0.1"
                    inputMode="decimal"
                    required
                    value={row.weightKg}
                    onChange={(event) => update(row.rowId, { weightKg: event.target.value })}
                  />
                </Field>

                <Field label="Price per kg" htmlFor={`price-${row.rowId}`} required>
                  <Input
                    id={`price-${row.rowId}`}
                    name={`item-${row.rowId}-pricePerKg`}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    required
                    value={row.pricePerKg}
                    onChange={(event) => update(row.rowId, { pricePerKg: event.target.value })}
                  />
                </Field>

                <Field label="Carcass grade" htmlFor={`grade-${row.rowId}`}>
                  <Input
                    id={`grade-${row.rowId}`}
                    name={`item-${row.rowId}-carcassGrade`}
                    type="text"
                    placeholder="Optional"
                  />
                </Field>
              </div>

              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                Line amount:{" "}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatCents(amount)}
                </span>
              </p>
            </div>
          );
        })}
      </div>

      <div>
        <Button type="button" variant="secondary" onClick={addRow}>
          Add another animal
        </Button>
      </div>

      {blocked.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <Badge variant="warning">Withdrawal period</Badge>
            {blocked.length} animal{blocked.length === 1 ? "" : "s"} cannot be sold yet
          </p>
          <ul className="flex flex-col gap-1 text-xs text-amber-900 dark:text-amber-200">
            {blocked.map((animal) => (
              <li key={animal.id}>{animal.blockedReason}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            These are held out of the list above. The same check runs again when the
            sale is saved, so a stale page cannot slip one through.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Total ({usableRows.length} animal{usableRows.length === 1 ? "" : "s"})
          </p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatCents(totalCents)}
          </p>
        </div>
        <SubmitButton pendingLabel="Recording sale…" disabled={usableRows.length === 0}>
          Record sale
        </SubmitButton>
      </div>
    </div>
  );
}
