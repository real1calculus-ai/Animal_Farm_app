"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatKg, toDateInputValue } from "@/lib/format";
import { consumptionExceedsTolerance, CONSUMPTION_TOLERANCE } from "@/lib/feed/allocation";
import { stageMismatchWarning } from "@/lib/feed/stage-match";
import type { FeedClassification } from "@prisma/client";

export type FeedTypeOption = {
  id: string;
  name: string;
  classification: FeedClassification;
  usableKg: number;
  batches: {
    id: string;
    batchCode: string;
    remainingKg: number;
    /** Pre-formatted for display — the form never does date maths. */
    expiresOn: string | null;
    expired: boolean;
  }[];
};

export type PenOption = {
  id: string;
  name: string;
  animalCount: number;
  /** Life-stage tally, for the §8.4 stage-match warning. */
  stageCounts: Record<string, number>;
  /** Programme ration for this pen, when one applies. */
  suggestion: { feedTypeId: string; kg: number } | null;
};

export type PigOption = {
  id: string;
  tagNumber: string;
  name: string | null;
  stage: string;
  penName: string | null;
};

/**
 * The daily feeding form.
 *
 * Every check the server enforces is mirrored here as a live warning, because
 * the server's version arrives as an error page after the tap — and a worker
 * standing in a barn with one hand free will not retype the form. The server
 * still enforces all of it; this is about not wasting the entry.
 */
export function FeedingRecordForm({
  action,
  feedTypes,
  pens,
  pigs,
}: {
  action: (formData: FormData) => Promise<void>;
  feedTypes: FeedTypeOption[];
  pens: PenOption[];
  pigs: PigOption[];
}) {
  const today = toDateInputValue(new Date());

  const [target, setTarget] = useState<"PEN" | "PIG">("PEN");
  const [penId, setPenId] = useState(pens[0]?.id ?? "");
  const [pigId, setPigId] = useState(pigs[0]?.id ?? "");
  const [feedTypeId, setFeedTypeId] = useState(
    pens[0]?.suggestion?.feedTypeId ?? feedTypes[0]?.id ?? ""
  );
  const [allocatedKg, setAllocatedKg] = useState(
    pens[0]?.suggestion ? String(pens[0].suggestion.kg) : ""
  );
  const [consumedKg, setConsumedKg] = useState("");
  const [animalCount, setAnimalCount] = useState(String(pens[0]?.animalCount ?? 1));
  const [feedBatchId, setFeedBatchId] = useState("");

  const pen = pens.find((p) => p.id === penId) ?? null;
  const pig = pigs.find((p) => p.id === pigId) ?? null;
  const feedType = feedTypes.find((f) => f.id === feedTypeId) ?? null;

  const allocated = Number.parseFloat(allocatedKg);
  const consumed = consumedKg.trim() === "" ? null : Number.parseFloat(consumedKg);

  const overTolerance =
    Number.isFinite(allocated) &&
    consumed !== null &&
    Number.isFinite(consumed) &&
    consumptionExceedsTolerance(allocated, consumed);

  const shortStock =
    feedType !== null && Number.isFinite(allocated) && allocated > feedType.usableKg;

  const stageWarning =
    feedType === null
      ? null
      : target === "PEN"
        ? pen
          ? stageMismatchWarning(feedType.classification, pen.stageCounts)
          : null
        : pig
          ? stageMismatchWarning(feedType.classification, { [pig.stage]: 1 })
          : null;

  function onPenChange(id: string) {
    setPenId(id);
    const next = pens.find((p) => p.id === id);
    if (!next) return;
    setAnimalCount(String(next.animalCount));
    if (next.suggestion) {
      setFeedTypeId(next.suggestion.feedTypeId);
      setAllocatedKg(String(next.suggestion.kg));
    }
  }

  const usableBatches = feedType?.batches.filter((b) => !b.expired && b.remainingKg > 0) ?? [];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="target" value={target} />

      <div className="flex gap-2" role="group" aria-label="Feeding target">
        {(["PEN", "PIG"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTarget(option)}
            aria-pressed={target === option}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              target === option
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {option === "PEN" ? "A pen" : "One animal"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {target === "PEN" ? (
          <Field label="Pen" htmlFor="penId" required>
            <Select
              id="penId"
              name="penId"
              required
              value={penId}
              onChange={(event) => onPenChange(event.target.value)}
            >
              <option value="" disabled>
                Select a pen…
              </option>
              {pens.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.animalCount} animals)
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Animal" htmlFor="pigId" required>
            <Select
              id="pigId"
              name="pigId"
              required
              value={pigId}
              onChange={(event) => setPigId(event.target.value)}
            >
              <option value="" disabled>
                Select an animal…
              </option>
              {pigs.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.tagNumber}
                  {option.name ? ` — ${option.name}` : ""}
                  {option.penName ? ` (${option.penName})` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Date fed" htmlFor="fedAt" required>
          <Input id="fedAt" name="fedAt" type="date" required max={today} defaultValue={today} />
        </Field>

        <Field label="Feed type" htmlFor="feedTypeId" required>
          <Select
            id="feedTypeId"
            name="feedTypeId"
            required
            value={feedTypeId}
            onChange={(event) => {
              setFeedTypeId(event.target.value);
              setFeedBatchId("");
            }}
          >
            <option value="" disabled>
              Select a feed…
            </option>
            {feedTypes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {formatKg(option.usableKg, 0)} usable
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Batch"
          htmlFor="feedBatchId"
          hint="Leave on automatic unless you fed from a specific bag — oldest in-date batch is used first."
        >
          <Select
            id="feedBatchId"
            name="feedBatchId"
            value={feedBatchId}
            onChange={(event) => setFeedBatchId(event.target.value)}
          >
            <option value="">Automatic (oldest first)</option>
            {usableBatches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batchCode} — {formatKg(batch.remainingKg, 0)}
                {batch.expiresOn ? ` (exp ${batch.expiresOn})` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Allocated (kg)" htmlFor="allocatedKg" required hint="What was put out">
          <Input
            id="allocatedKg"
            name="allocatedKg"
            type="number"
            step="0.1"
            min="0.1"
            inputMode="decimal"
            required
            value={allocatedKg}
            onChange={(event) => setAllocatedKg(event.target.value)}
          />
        </Field>

        <Field
          label="Consumed (kg)"
          htmlFor="consumedKg"
          hint="Leave blank if the trough was cleared"
        >
          <Input
            id="consumedKg"
            name="consumedKg"
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={consumedKg}
            onChange={(event) => setConsumedKg(event.target.value)}
          />
        </Field>

        {target === "PEN" ? (
          <Field
            label="Animals fed"
            htmlFor="animalCount"
            hint="Recorded as at today, so cost per animal stays put when pigs move"
          >
            <Input
              id="animalCount"
              name="animalCount"
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              value={animalCount}
              onChange={(event) => setAnimalCount(event.target.value)}
            />
          </Field>
        ) : null}
      </div>

      <Field label="Notes" htmlFor="notes" hint="Refusal, spillage, wet feed, anything odd">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>

      {overTolerance ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          Consumption is more than {Math.round(CONSUMPTION_TOLERANCE * 100)}% above the allocated
          amount. An animal cannot eat feed that was never put out — check the figures before
          saving.
        </p>
      ) : null}

      {shortStock ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          Only {formatKg(feedType?.usableKg ?? 0)} of in-date stock is available. Record a delivery
          first, or reduce the quantity.
        </p>
      ) : null}

      {stageWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          {stageWarning} You can still save this — it is a note, not a block.
        </p>
      ) : null}

      <SubmitButton pendingLabel="Recording…" disabled={overTolerance || shortStock}>
        Record feeding
      </SubmitButton>
    </form>
  );
}
