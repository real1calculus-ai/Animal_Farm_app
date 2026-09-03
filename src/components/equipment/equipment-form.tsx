import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { EQUIPMENT_STATUS_LABELS, optionsFrom } from "@/lib/labels";
import { toDateInputValue } from "@/lib/format";

export type EquipmentFormValues = {
  name: string;
  category: string;
  serialNumber: string | null;
  location: string | null;
  purchaseDate: Date | null;
  purchaseCostCents: number | null;
  expectedLifeMonths: number | null;
  status: string;
  notes: string | null;
};

export function EquipmentForm({
  action,
  values,
  categories,
  submitLabel,
  idPrefix = "equipment",
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: EquipmentFormValues;
  categories: string[];
  submitLabel: string;
  idPrefix?: string;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor={`${idPrefix}-name`} required>
        <Input id={`${idPrefix}-name`} name="name" defaultValue={values?.name} required placeholder="Feed mixer" />
      </Field>

      <Field
        label="Category"
        htmlFor={`${idPrefix}-category`}
        hint="Free text — existing categories are offered as suggestions."
        required
      >
        <Input
          id={`${idPrefix}-category`}
          name="category"
          list={`${idPrefix}-categories`}
          defaultValue={values?.category}
          required
          placeholder="Feeding equipment"
        />
        <datalist id={`${idPrefix}-categories`}>
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </Field>

      <Field label="Serial number" htmlFor={`${idPrefix}-serialNumber`}>
        <Input id={`${idPrefix}-serialNumber`} name="serialNumber" defaultValue={values?.serialNumber ?? ""} />
      </Field>

      <Field label="Location" htmlFor={`${idPrefix}-location`}>
        <Input id={`${idPrefix}-location`} name="location" defaultValue={values?.location ?? ""} />
      </Field>

      <Field
        label="Purchase date"
        htmlFor={`${idPrefix}-purchaseDate`}
        hint="With a cost, this posts an equipment expense to the ledger."
      >
        <Input
          id={`${idPrefix}-purchaseDate`}
          name="purchaseDate"
          type="date"
          defaultValue={toDateInputValue(values?.purchaseDate)}
        />
      </Field>

      <Field label="Purchase cost" htmlFor={`${idPrefix}-purchaseCostCents`}>
        <Input
          id={`${idPrefix}-purchaseCostCents`}
          name="purchaseCostCents"
          inputMode="decimal"
          defaultValue={values?.purchaseCostCents ? (values.purchaseCostCents / 100).toFixed(2) : ""}
          placeholder="0.00"
        />
      </Field>

      <Field
        label="Expected life (months)"
        htmlFor={`${idPrefix}-expectedLifeMonths`}
        hint="Drives straight-line depreciation and the replacement flag."
      >
        <Input
          id={`${idPrefix}-expectedLifeMonths`}
          name="expectedLifeMonths"
          type="number"
          min={1}
          step={1}
          defaultValue={values?.expectedLifeMonths ?? ""}
          placeholder="60"
        />
      </Field>

      <Field label="Status" htmlFor={`${idPrefix}-status`} required>
        <Select id={`${idPrefix}-status`} name="status" defaultValue={values?.status ?? "IN_SERVICE"} required>
          {optionsFrom(EQUIPMENT_STATUS_LABELS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
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
