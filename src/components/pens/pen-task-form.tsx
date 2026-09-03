import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { PEN_TASK_TYPE_LABELS, optionsFrom } from "@/lib/labels";
import { toDateInputValue } from "@/lib/format";

/**
 * Cleaning and disinfection are biosecurity records, not housekeeping notes —
 * §3.5 wants them kept for the same reason medication records are kept, so the
 * form asks for the next due date up front rather than hoping someone
 * remembers to schedule it later.
 */
export function PenTaskForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Task" htmlFor="taskType" required>
        <Select id="taskType" name="taskType" required>
          {optionsFrom(PEN_TASK_TYPE_LABELS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Date performed" htmlFor="performedAt" required>
        <Input
          id="performedAt"
          name="performedAt"
          type="date"
          defaultValue={toDateInputValue(new Date())}
          required
        />
      </Field>

      <Field label="Next due" htmlFor="nextDueAt" hint="Leave blank if this is a one-off.">
        <Input id="nextDueAt" name="nextDueAt" type="date" />
      </Field>

      <Field label="Cost" htmlFor="costCents" hint="Posts a housing expense to the ledger.">
        <Input id="costCents" name="costCents" inputMode="decimal" placeholder="0.00" />
      </Field>

      <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={2} placeholder="Pressure washed, lime applied" />
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Recording...">Record task</SubmitButton>
      </div>
    </form>
  );
}
