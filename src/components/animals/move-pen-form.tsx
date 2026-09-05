"use client";

import { useActionState, useId } from "react";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionBanner } from "@/components/animals/action-banner";
import {
  EMPTY_ACTION_STATE,
  type AnimalActionState,
} from "@/components/animals/form-state";
import type { PenChoice } from "@/components/animals/animal-form";

/**
 * Moves an animal between pens, writing a `PenMovement` and the animal's new
 * pen in one transaction. Pens already at capacity are marked here and refused
 * server-side — silently overfilling a pen is a welfare problem that only
 * surfaces weeks later as tail-biting and stunted growth.
 */
export function MovePenForm({
  animalId,
  currentPenId,
  action,
  pens,
  defaultDate,
}: {
  animalId: string;
  currentPenId: string | null;
  action: (state: AnimalActionState, formData: FormData) => Promise<AnimalActionState>;
  pens: PenChoice[];
  defaultDate: string;
}) {
  const formId = useId();
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="animalId" value={animalId} />
      <ActionBanner state={state} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Move to pen" htmlFor={`${formId}-toPenId`}>
          <Select id={`${formId}-toPenId`} name="toPenId" defaultValue="">
            <option value="">No pen (remove from housing)</option>
            {pens.map((pen) => {
              const isCurrent = pen.id === currentPenId;
              const full = pen.occupancy >= pen.capacity && !isCurrent;
              return (
                <option key={pen.id} value={pen.id} disabled={isCurrent}>
                  {pen.name} ({pen.occupancy}/{pen.capacity})
                  {isCurrent ? " — current pen" : ""}
                  {full ? " — FULL" : ""}
                </option>
              );
            })}
          </Select>
        </Field>

        <Field label="Date" htmlFor={`${formId}-movedAt`} required>
          <Input
            id={`${formId}-movedAt`}
            name="movedAt"
            type="date"
            required
            defaultValue={defaultDate}
          />
        </Field>

        <Field label="Reason" htmlFor={`${formId}-reason`} className="sm:col-span-2">
          <Input
            id={`${formId}-reason`}
            name="reason"
            placeholder="e.g. weaned into nursery, isolation for lameness"
          />
        </Field>
      </div>

      <div>
        <SubmitButton pendingLabel="Moving...">Record pen move</SubmitButton>
      </div>
    </form>
  );
}
