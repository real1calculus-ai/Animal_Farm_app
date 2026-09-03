import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AnimalForm } from "@/components/animals/animal-form";
import { animalFormValues, toParentCandidate } from "@/components/animals/form-state";
import { createAnimal } from "@/app/animals/actions";
import { requireRole, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listParentCandidates, listPensWithOccupancy } from "@/lib/db/animals";

export default async function NewAnimalPage() {
  // VETERINARIAN is read-only in this module; the action re-checks the same list.
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const [candidates, pens] = await Promise.all([
    listParentCandidates(farmId),
    listPensWithOccupancy(farmId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add animal"
        description="Recording parents now is what makes the pedigree and inbreeding checks work later."
      />
      <Card>
        <AnimalForm
          mode="create"
          action={createAnimal}
          values={animalFormValues(null)}
          candidates={candidates.map(toParentCandidate)}
          pens={pens}
        />
      </Card>
    </div>
  );
}
