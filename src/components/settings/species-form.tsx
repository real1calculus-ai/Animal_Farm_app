"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import {
  EMPTY_SPECIES_STATE,
  type SpeciesActionState,
} from "@/components/settings/species-form-state";
import { TRACKING_MODE_LABELS, SPECIES_PURPOSE_LABELS } from "@/lib/labels";
import type { TrackingMode, SpeciesPurpose } from "@prisma/client";

export type SpeciesRow = {
  id: string;
  name: string;
  isActive: boolean;
  trackingMode: TrackingMode;
  purpose: SpeciesPurpose;
  gestationDays: number | null;
  /** Records already attached, which is what makes a species undeletable. */
  recordCount: number;
};

/**
 * Checkboxes rather than a multi-select: on a phone this is the screen a farmer
 * uses once, and a list of eleven tick boxes with their real biology next to
 * them is readable in a way a scrolling multi-select is not.
 */
export function SpeciesForm({
  species,
  action,
}: {
  species: SpeciesRow[];
  action: (state: SpeciesActionState, formData: FormData) => Promise<SpeciesActionState>;
}) {
  const [state, formAction] = useActionState(action, EMPTY_SPECIES_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
        >
          {state.success}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {species.map((entry) => (
          <li key={entry.id}>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              htmlFor={`species-${entry.id}`}
            >
              <input
                id={`species-${entry.id}`}
                type="checkbox"
                name="speciesId"
                value={entry.id}
                defaultChecked={entry.isActive}
                className="mt-1 h-4 w-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {entry.name}
                  </span>
                  {entry.purpose === "WORKING" ? (
                    <Badge>{SPECIES_PURPOSE_LABELS[entry.purpose]}</Badge>
                  ) : null}
                  {entry.recordCount > 0 ? (
                    <Badge>
                      {entry.recordCount} record{entry.recordCount === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {TRACKING_MODE_LABELS[entry.trackingMode]}
                  {entry.gestationDays
                    ? ` · ${entry.gestationDays} day gestation`
                    : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div>
        <SubmitButton>Save species</SubmitButton>
      </div>
    </form>
  );
}
