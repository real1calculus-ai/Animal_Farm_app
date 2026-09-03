import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { LIFE_STAGE_LABELS, optionsFrom } from "@/lib/labels";
import type { LifeStage } from "@prisma/client";

export type ProgramDefaults = {
  name?: string;
  stage?: LifeStage;
  feedTypeId?: string;
  dailyKgPerAnimal?: number;
  ageDaysMin?: number | null;
  ageDaysMax?: number | null;
  pctOfBodyweight?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

/**
 * A standing ration. The percentage-of-bodyweight rule is offered as an
 * alternative to the flat daily figure and, when set, wins — that is how sows
 * and finishers are actually fed, and the schema comment on
 * `FeedingProgram.pctOfBodyweight` says the same.
 */
export function ProgramForm({
  action,
  id,
  feedTypes,
  defaults = {},
  submitLabel = "Save programme",
  cancelHref = "/feed/programs",
}: {
  action: (formData: FormData) => Promise<void>;
  /** Present on edit — travels with the post so the action knows what to update. */
  id?: string;
  feedTypes: { id: string; name: string }[];
  defaults?: ProgramDefaults;
  submitLabel?: string;
  cancelHref?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Programme name" htmlFor="name" required>
          <Input id="name" name="name" required maxLength={120} defaultValue={defaults.name ?? ""} placeholder="e.g. Weaner ration 4-10 wk" />
        </Field>

        <Field label="Target stage" htmlFor="stage" required>
          <Select id="stage" name="stage" required defaultValue={defaults.stage ?? "WEANER"}>
            {optionsFrom(LIFE_STAGE_LABELS).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Feed type" htmlFor="feedTypeId" required>
          <Select id="feedTypeId" name="feedTypeId" required defaultValue={defaults.feedTypeId ?? ""}>
            <option value="" disabled>
              Select a feed…
            </option>
            {feedTypes.map((feedType) => (
              <option key={feedType.id} value={feedType.id}>
                {feedType.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Daily kg per animal" htmlFor="dailyKgPerAnimal" required>
          <Input
            id="dailyKgPerAnimal"
            name="dailyKgPerAnimal"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            defaultValue={defaults.dailyKgPerAnimal ?? ""}
          />
        </Field>

        <Field label="Age from (days)" htmlFor="ageDaysMin">
          <Input id="ageDaysMin" name="ageDaysMin" type="number" step="1" min="0" defaultValue={defaults.ageDaysMin ?? ""} />
        </Field>

        <Field label="Age to (days)" htmlFor="ageDaysMax">
          <Input id="ageDaysMax" name="ageDaysMax" type="number" step="1" min="0" defaultValue={defaults.ageDaysMax ?? ""} />
        </Field>

        <Field
          label="% of bodyweight per day"
          htmlFor="pctOfBodyweight"
          hint="Optional. When set this is used instead of the flat daily figure — e.g. 4 for 4%."
        >
          <Input
            id="pctOfBodyweight"
            name="pctOfBodyweight"
            type="number"
            step="0.1"
            min="0"
            max="100"
            inputMode="decimal"
            defaultValue={
              defaults.pctOfBodyweight === null || defaults.pctOfBodyweight === undefined
                ? ""
                : defaults.pctOfBodyweight * 100
            }
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaults.notes ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={defaults.isActive ?? true}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
        />
        Active
      </label>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
