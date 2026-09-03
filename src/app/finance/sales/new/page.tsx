import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { SaleBuilder, type SellableAnimal } from "@/components/finance/sale-builder";
import { FINANCE_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listSellableAnimals } from "@/lib/db/finance";
import { checkPigsSaleEligibility } from "@/lib/health/withdrawal";
import { ANIMAL_SALE_TYPE_LABELS, optionsFrom } from "@/lib/labels";
import { toDateInputValue } from "@/lib/format";
import { createAnimalSale } from "@/app/finance/sales/actions";

export const metadata = { title: "Record a sale" };

export default async function NewSalePage() {
  const user = await requireRole(FINANCE_ROLES);
  const farmId = await getActiveFarmId(user);

  const animals = await listSellableAnimals(farmId);

  // Non-throwing check, used only to grey animals out of the picker. The
  // enforcement point is `assertPigsMayBeSold` inside the server action —
  // this page could be minutes stale by the time the form is submitted.
  const eligibility = await checkPigsSaleEligibility(
    animals.map((animal) => animal.id),
    farmId
  );
  const blockedById = new Map(
    eligibility.filter((row) => !row.allowed).map((row) => [row.pigId, row.reason])
  );

  const sellable: SellableAnimal[] = animals.map((animal) => ({
    id: animal.id,
    tagNumber: animal.tagNumber,
    name: animal.name,
    breed: animal.breed,
    currentWeightKg: animal.currentWeightKg,
    penName: animal.pen?.name ?? null,
    blockedReason: blockedById.get(animal.id) ?? null,
  }));

  const today = toDateInputValue(new Date());

  return (
    <>
      <PageHeader
        title="Record a sale"
        description="Buyer, date and the animals sold. The total is calculated from the line items."
        actions={
          <ButtonLink href="/finance/sales" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />

      {animals.length === 0 ? (
        <EmptyState
          title="No animals available to sell"
          description="Every animal on the farm has already exited, or none have been recorded yet."
          action={<ButtonLink href="/animals">Go to animals</ButtonLink>}
        />
      ) : (
        <form action={createAnimalSale} className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sale details</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sale date" htmlFor="soldAt" required>
                <Input
                  id="soldAt"
                  name="soldAt"
                  type="date"
                  required
                  defaultValue={today}
                  max={today}
                />
              </Field>

              <Field
                label="Sale type"
                htmlFor="saleType"
                required
                hint="Decides which revenue category the income is booked to."
              >
                <Select id="saleType" name="saleType" required defaultValue="FINISHED_PIG">
                  {optionsFrom(ANIMAL_SALE_TYPE_LABELS).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Buyer name" htmlFor="buyerName" required>
                <Input id="buyerName" name="buyerName" type="text" required maxLength={200} />
              </Field>

              <Field label="Buyer contact" htmlFor="buyerContact" hint="Phone or email.">
                <Input id="buyerContact" name="buyerContact" type="text" maxLength={200} />
              </Field>

              <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
                <Textarea id="notes" name="notes" rows={2} />
              </Field>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Animals</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Each line is weight × price per kg. Selling an animal here marks it
                sold and records the income against the farm.
              </p>
            </div>
            <SaleBuilder animals={sellable} />
          </Card>
        </form>
      )}
    </>
  );
}
