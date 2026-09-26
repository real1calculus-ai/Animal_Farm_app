import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { BATCH_PRODUCTION_TYPE_LABELS } from "@/lib/labels";
import { toDateInputValue } from "@/lib/format";

export function BatchProductionForm({
  action,
  defaultType = "EGGS",
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultType?: keyof typeof BATCH_PRODUCTION_TYPE_LABELS;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Product" htmlFor="productionType" required>
        <Select id="productionType" name="productionType" defaultValue={defaultType} required>
          {Object.entries(BATCH_PRODUCTION_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Date collected" htmlFor="collectedAt" required>
        <Input
          id="collectedAt"
          name="collectedAt"
          type="date"
          defaultValue={toDateInputValue(new Date())}
          required
        />
      </Field>

      <Field label="Total collected" htmlFor="quantity" required>
        <Input id="quantity" name="quantity" type="number" step="0.01" min="0" required />
      </Field>

      <Field
        label="Unsellable"
        htmlFor="rejectedQuantity"
        hint="Cracked or dirty. Lay rate counts everything; revenue only counts the rest."
      >
        <Input id="rejectedQuantity" name="rejectedQuantity" type="number" step="0.01" min="0" defaultValue="0" />
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Recording...">Record collection</SubmitButton>
      </div>
    </form>
  );
}
