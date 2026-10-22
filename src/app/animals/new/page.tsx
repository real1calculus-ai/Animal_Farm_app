import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AnimalForm } from "@/components/animals/animal-form";
import { animalFormValues, toParentCandidate } from "@/components/animals/form-state";
import { createAnimal } from "@/app/animals/actions";
import { requireRole, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listParentCandidates, listPensWithOccupancy } from "@/lib/db/animals";
import { listIndividualSpecies } from "@/lib/db/species";

export default async function NewAnimalPage() {
  // VETERINARIAN is read-only in this module; the action re-checks the same list.
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);

  const [candidates, pens, species] = await Promise.all([
    listParentCandidates(farmId),
    listPensWithOccupancy(farmId),
    listIndividualSpecies(farmId),
  ]);

  // Without a species there is nothing to create — speciesId is required on
  // Animal. Say so here rather than letting the form submit into a refusal.
  if (species.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Add animal" />
        <EmptyState
          title="No species set up yet"
          description="An animal record has to say what it is. Choose the species this farm keeps and the form will be ready."
          action={<ButtonLink href="/settings/species">Choose species</ButtonLink>}
        />
      </div>
    );
  }

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
          species={species}
        />
      </Card>
    </div>
  );
}
