import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { FEED_CLASSIFICATION_LABELS, optionsFrom } from "@/lib/labels";
import type { FeedClassification } from "@prisma/client";

export type FeedTypeDefaults = {
  name?: string;
  classification?: FeedClassification;
  description?: string | null;
  proteinPct?: number | null;
  fatPct?: number | null;
  fiberPct?: number | null;
  calciumPct?: number | null;
  phosphorusPct?: number | null;
  vitamins?: string | null;
  meKcalPerKg?: number | null;
  costPerKgCents?: number | null;
  supplierId?: string | null;
  storageRequirements?: string | null;
  reorderLevelKg?: number;
  isActive?: boolean;
};

/**
 * Create/edit form for a feed product. The nutritional profile is all optional
 * — a farm buying an unlabelled local mix genuinely does not have a protein
 * figure, and demanding one would just get zeros typed in, which is worse than
 * a blank because it reads as a real measurement downstream.
 */
export function FeedTypeForm({
  action,
  suppliers,
  defaults = {},
  submitLabel = "Save feed type",
  cancelHref = "/feed/types",
}: {
  action: (formData: FormData) => Promise<void>;
  suppliers: { id: string; name: string }[];
  defaults?: FeedTypeDefaults;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const num = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={defaults.name ?? ""}
            placeholder="e.g. Grower mash 16%"
          />
        </Field>

        <Field label="Classification" htmlFor="classification" required>
          <Select
            id="classification"
            name="classification"
            required
            defaultValue={defaults.classification ?? "GROWER"}
          >
            {optionsFrom(FEED_CLASSIFICATION_LABELS).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={2} defaultValue={defaults.description ?? ""} />
      </Field>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Nutritional profile
        </legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Protein %" htmlFor="proteinPct">
            <Input id="proteinPct" name="proteinPct" type="number" step="0.1" min="0" max="100" inputMode="decimal" defaultValue={num(defaults.proteinPct)} />
          </Field>
          <Field label="Fat %" htmlFor="fatPct">
            <Input id="fatPct" name="fatPct" type="number" step="0.1" min="0" max="100" inputMode="decimal" defaultValue={num(defaults.fatPct)} />
          </Field>
          <Field label="Fibre %" htmlFor="fiberPct">
            <Input id="fiberPct" name="fiberPct" type="number" step="0.1" min="0" max="100" inputMode="decimal" defaultValue={num(defaults.fiberPct)} />
          </Field>
          <Field label="Calcium %" htmlFor="calciumPct">
            <Input id="calciumPct" name="calciumPct" type="number" step="0.01" min="0" max="100" inputMode="decimal" defaultValue={num(defaults.calciumPct)} />
          </Field>
          <Field label="Phosphorus %" htmlFor="phosphorusPct">
            <Input id="phosphorusPct" name="phosphorusPct" type="number" step="0.01" min="0" max="100" inputMode="decimal" defaultValue={num(defaults.phosphorusPct)} />
          </Field>
          <Field label="Metabolisable energy" htmlFor="meKcalPerKg" hint="kcal per kg">
            <Input id="meKcalPerKg" name="meKcalPerKg" type="number" step="1" min="0" inputMode="decimal" defaultValue={num(defaults.meKcalPerKg)} />
          </Field>
        </div>
        <Field label="Vitamins & additives" htmlFor="vitamins">
          <Textarea id="vitamins" name="vitamins" rows={2} defaultValue={defaults.vitamins ?? ""} placeholder="e.g. A, D3, E, B-complex premix; lysine 0.9%" />
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default cost per kg" htmlFor="costPerKg" hint="Used when a delivery doesn't record its own price">
          <Input
            id="costPerKg"
            name="costPerKg"
            inputMode="decimal"
            defaultValue={
              defaults.costPerKgCents === null || defaults.costPerKgCents === undefined
                ? ""
                : (defaults.costPerKgCents / 100).toFixed(2)
            }
            placeholder="0.00"
          />
        </Field>

        <Field label="Supplier" htmlFor="supplierId">
          <Select id="supplierId" name="supplierId" defaultValue={defaults.supplierId ?? ""}>
            <option value="">— None —</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Reorder level (kg)"
          htmlFor="reorderLevelKg"
          hint="Stock below this raises a reorder alert on the inventory screen"
        >
          <Input
            id="reorderLevelKg"
            name="reorderLevelKg"
            type="number"
            step="1"
            min="0"
            inputMode="decimal"
            defaultValue={defaults.reorderLevelKg ?? 0}
          />
        </Field>

        <Field label="Storage requirements" htmlFor="storageRequirements">
          <Input
            id="storageRequirements"
            name="storageRequirements"
            defaultValue={defaults.storageRequirements ?? ""}
            placeholder="e.g. Dry, below 25°C, off the floor"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={defaults.isActive ?? true}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
        />
        Active — offered when recording deliveries and feeding
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
