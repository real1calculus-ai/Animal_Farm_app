import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createBatch } from "@/app/batches/actions";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listBatchSpecies } from "@/lib/db/batches";
import { listPenOptions } from "@/lib/db/pens";
import { toDateInputValue } from "@/lib/format";

export default async function NewBatchPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const [species, pens] = await Promise.all([listBatchSpecies(farmId), listPenOptions(farmId)]);

  if (species.length === 0) {
    return (
      <>
        <PageHeader title="New batch" />
        <EmptyState
          title="No batch-tracked species are set up"
          description="Batches are for animals counted as a group — poultry, fish, snails. Enable one in Settings first."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New batch"
        description="A group stocked, fed and sold together — a house of birds, a pond, a snail pen."
      />

      <Card>
        <form action={createBatch} className="grid gap-4 sm:grid-cols-2">
          <Field label="Species" htmlFor="speciesId" required>
            <Select id="speciesId" name="speciesId" required>
              {species.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Name" htmlFor="name" hint="How you refer to it day to day." required>
            <Input id="name" name="name" placeholder="Broiler house 2 — Sept intake" required />
          </Field>

          <Field label="Batch code" htmlFor="batchCode" hint="Unique on this farm." required>
            <Input id="batchCode" name="batchCode" placeholder="BRO-2609" required />
          </Field>

          <Field label="Pen or pond" htmlFor="penId">
            <Select id="penId" name="penId" defaultValue="">
              <option value="">Not assigned</option>
              {pens.map((pen) => (
                <option key={pen.id} value={pen.id}>
                  {pen.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date stocked" htmlFor="startDate" required>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={toDateInputValue(new Date())}
              required
            />
          </Field>

          <Field label="How many" htmlFor="initialCount" required>
            <Input id="initialCount" name="initialCount" type="number" min={1} required />
          </Field>

          <Field
            label="Age on arrival (days)"
            htmlFor="startAgeDays"
            hint="Day-olds are 0. Point-of-lay pullets are around 112."
          >
            <Input id="startAgeDays" name="startAgeDays" type="number" min={0} defaultValue={0} />
          </Field>

          <Field label="Average weight on arrival (kg)" htmlFor="avgWeightKg">
            <Input id="avgWeightKg" name="avgWeightKg" type="number" step="0.001" min="0" />
          </Field>

          <Field label="Source" htmlFor="source" hint="Hatchery, supplier or own stock.">
            <Input id="source" name="source" />
          </Field>

          <Field
            label="Cost of stock"
            htmlFor="acquisitionCostCents"
            hint="Posts an expense to the ledger."
          >
            <Input id="acquisitionCostCents" name="acquisitionCostCents" inputMode="decimal" placeholder="0.00" />
          </Field>

          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" rows={2} />
          </Field>

          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Creating...">Create batch</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
