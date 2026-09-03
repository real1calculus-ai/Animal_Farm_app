import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { HOUSING_TYPE_LABELS, optionsFrom } from "@/lib/labels";

export type PenFormValues = {
  name: string;
  housingType: string;
  capacity: number;
  location: string | null;
  notes: string | null;
};

/**
 * Shared by the create and edit paths. The `action` is passed in rather than
 * imported so the same markup serves both without a mode flag.
 */
export function PenForm({
  action,
  values,
  submitLabel,
  idPrefix = "pen",
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: PenFormValues;
  submitLabel: string;
  idPrefix?: string;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Pen name" htmlFor={`${idPrefix}-name`} required>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={values?.name}
          required
          placeholder="Farrowing 2"
        />
      </Field>

      <Field label="Housing type" htmlFor={`${idPrefix}-housingType`} required>
        <Select id={`${idPrefix}-housingType`} name="housingType" defaultValue={values?.housingType} required>
          {optionsFrom(HOUSING_TYPE_LABELS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Capacity"
        htmlFor={`${idPrefix}-capacity`}
        hint="Animals this pen can hold. Moves that would exceed it are refused."
        required
      >
        <Input
          id={`${idPrefix}-capacity`}
          name="capacity"
          type="number"
          min={0}
          step={1}
          defaultValue={values?.capacity}
          required
        />
      </Field>

      <Field label="Location" htmlFor={`${idPrefix}-location`}>
        <Input
          id={`${idPrefix}-location`}
          name="location"
          defaultValue={values?.location ?? ""}
          placeholder="North block"
        />
      </Field>

      <Field label="Notes" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
        <Textarea id={`${idPrefix}-notes`} name="notes" rows={2} defaultValue={values?.notes ?? ""} />
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Saving...">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
