import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";

export type SupplierDefaults = {
  name?: string;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export function SupplierForm({
  action,
  defaults = {},
  submitLabel = "Save supplier",
  cancelHref = "/feed/suppliers",
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: SupplierDefaults;
  submitLabel?: string;
  cancelHref?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" required maxLength={120} defaultValue={defaults.name ?? ""} />
        </Field>
        <Field label="Contact person" htmlFor="contact">
          <Input id="contact" name="contact" defaultValue={defaults.contact ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={defaults.phone ?? ""} />
        </Field>
        <Field label="Address" htmlFor="address">
          <Input id="address" name="address" defaultValue={defaults.address ?? ""} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes ?? ""} placeholder="Delivery days, credit terms, quality history…" />
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
