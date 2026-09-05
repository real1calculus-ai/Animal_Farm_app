import { Field } from "@/components/ui/field";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { LIFE_STAGE_LABELS, optionsFrom } from "@/lib/labels";

const STAGE_OPTIONS = optionsFrom(LIFE_STAGE_LABELS);

export type ProtocolDefaults = {
  name: string;
  vaccineName: string;
  targetStage: string;
  ageDaysMin: string;
  ageDaysMax: string;
  boosterIntervalDays: string;
  notes: string;
  isActive: boolean;
};

/**
 * Shared field set for creating and editing a protocol item.
 *
 * Age window and booster interval are alternatives, not both: a primary dose
 * is owed at an age ("first shot at 21–28 days"), a booster is owed at an
 * interval since the last one ("annually"). The Server Action enforces that at
 * least one is present, since a row with neither would be a rule that can
 * never come due.
 */
export function ProtocolFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: ProtocolDefaults;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor={`${idPrefix}-name`} required>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            required
            placeholder="e.g. Offspring primary course"
            defaultValue={defaults?.name ?? ""}
          />
        </Field>
        <Field label="Vaccine" htmlFor={`${idPrefix}-vaccineName`} required>
          <Input
            id={`${idPrefix}-vaccineName`}
            name="vaccineName"
            required
            defaultValue={defaults?.vaccineName ?? ""}
          />
        </Field>
        <Field label="Target life stage" htmlFor={`${idPrefix}-targetStage`} required>
          <Select
            id={`${idPrefix}-targetStage`}
            name="targetStage"
            required
            defaultValue={defaults?.targetStage ?? "YOUNG"}
          >
            {STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Earliest age (days)"
          htmlFor={`${idPrefix}-ageDaysMin`}
          hint="For a primary dose."
        >
          <Input
            id={`${idPrefix}-ageDaysMin`}
            name="ageDaysMin"
            type="number"
            min={0}
            defaultValue={defaults?.ageDaysMin ?? ""}
          />
        </Field>
        <Field
          label="Latest age (days)"
          htmlFor={`${idPrefix}-ageDaysMax`}
          hint="After this the dose counts as overdue."
        >
          <Input
            id={`${idPrefix}-ageDaysMax`}
            name="ageDaysMax"
            type="number"
            min={0}
            defaultValue={defaults?.ageDaysMax ?? ""}
          />
        </Field>
        <Field
          label="Booster interval (days)"
          htmlFor={`${idPrefix}-boosterIntervalDays`}
          hint="For a repeating dose, e.g. 365 for annual."
        >
          <Input
            id={`${idPrefix}-boosterIntervalDays`}
            name="boosterIntervalDays"
            type="number"
            min={1}
            defaultValue={defaults?.boosterIntervalDays ?? ""}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor={`${idPrefix}-notes`}>
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
        />
      </Field>

      <div>
        <Label htmlFor={`${idPrefix}-isActive`}>Active</Label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            id={`${idPrefix}-isActive`}
            type="checkbox"
            name="isActive"
            value="on"
            defaultChecked={defaults?.isActive ?? true}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          Generates due dates for matching animals
        </label>
      </div>
    </>
  );
}
