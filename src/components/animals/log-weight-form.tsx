"use client";

import { useActionState, useId } from "react";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionBanner } from "@/components/animals/action-banner";
import {
  EMPTY_ACTION_STATE,
  type AnimalActionState,
} from "@/components/animals/form-state";

/**
 * Records a weigh-in. The action writes the `WeightRecord` and the
 * denormalised `Animal.currentWeightKg` in one transaction — this form is the
 * only way the two are meant to change, so they cannot drift apart.
 */
export function LogWeightForm({
  animalId,
  action,
  defaultDate,
}: {
  animalId: string;
  action: (state: AnimalActionState, formData: FormData) => Promise<AnimalActionState>;
  /** yyyy-mm-dd — today, computed on the server so the barn phone's clock doesn't decide. */
  defaultDate: string;
}) {
  const formId = useId();
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="animalId" value={animalId} />
      <ActionBanner state={state} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Weight (kg)" htmlFor={`${formId}-weightKg`} required>
          <Input
            id={`${formId}-weightKg`}
            name="weightKg"
            type="number"
            step="0.1"
            min="0.1"
            inputMode="decimal"
            required
            placeholder="e.g. 84.5"
          />
        </Field>

        <Field label="Date" htmlFor={`${formId}-recordedAt`} required>
          <Input
            id={`${formId}-recordedAt`}
            name="recordedAt"
            type="date"
            required
            defaultValue={defaultDate}
          />
        </Field>

        <Field
          label="Body condition score"
          htmlFor={`${formId}-bodyConditionScore`}
          hint="Optional, 1–5."
        >
          <Input
            id={`${formId}-bodyConditionScore`}
            name="bodyConditionScore"
            type="number"
            min="1"
            max="5"
            step="1"
            inputMode="numeric"
          />
        </Field>

        <Field label="Notes" htmlFor={`${formId}-notes`}>
          <Textarea id={`${formId}-notes`} name="notes" rows={2} />
        </Field>
      </div>

      <div>
        <SubmitButton pendingLabel="Recording...">Record weight</SubmitButton>
      </div>
    </form>
  );
}
