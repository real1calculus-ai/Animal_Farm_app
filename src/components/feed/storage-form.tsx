import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export type StorageDefaults = {
  name?: string;
  capacityKg?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

export function StorageForm({
  action,
  defaults = {},
  submitLabel = "Add location",
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: StorageDefaults;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" required maxLength={120} defaultValue={defaults.name ?? ""} placeholder="e.g. Store room A, Silo 2" />
        </Field>
        <Field label="Capacity (kg)" htmlFor="capacityKg" hint="Leave blank if it isn't a fixed-size bin">
          <Input
            id="capacityKg"
            name="capacityKg"
            type="number"
            step="1"
            min="0"
            inputMode="decimal"
            defaultValue={defaults.capacityKg ?? ""}
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
        In use
      </label>

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
