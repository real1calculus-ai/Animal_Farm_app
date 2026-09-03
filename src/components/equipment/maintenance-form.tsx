import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { MAINTENANCE_TYPE_LABELS, optionsFrom } from "@/lib/labels";
import { toDateInputValue } from "@/lib/format";

export function MaintenanceForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Type" htmlFor="maintenanceType" required>
        <Select id="maintenanceType" name="maintenanceType" required>
          {optionsFrom(MAINTENANCE_TYPE_LABELS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Date" htmlFor="performedAt" required>
        <Input
          id="performedAt"
          name="performedAt"
          type="date"
          defaultValue={toDateInputValue(new Date())}
          required
        />
      </Field>

      <Field label="Cost" htmlFor="costCents" hint="Enter 0 if there was no cost." required>
        <Input id="costCents" name="costCents" inputMode="decimal" defaultValue="0.00" required />
      </Field>

      <Field
        label="Next due"
        htmlFor="nextDueAt"
        hint="Sets the reminder. Leave blank for a one-off repair."
      >
        <Input id="nextDueAt" name="nextDueAt" type="date" />
      </Field>

      <Field label="What was done" htmlFor="description" className="sm:col-span-2" required>
        <Textarea id="description" name="description" rows={2} required />
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Recording...">Record maintenance</SubmitButton>
      </div>
    </form>
  );
}
