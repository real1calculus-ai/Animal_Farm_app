import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AnimalForm } from "@/components/animals/animal-form";
import { animalFormValues, toParentCandidate } from "@/components/animals/form-state";
import { updateAnimal } from "@/app/animals/actions";
import { requireRole, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  descendantIdsOf,
  getAnimal,
  listParentCandidates,
  listPensWithOccupancy,
} from "@/lib/db/animals";
import { listSpecies } from "@/lib/db/species";
import { loadPedigreeIndex } from "@/lib/breeding/pedigree";

export default async function EditAnimalPage({ params }: PageProps<"/animals/[id]/edit">) {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);
  const { id } = await params;

  const animal = await getAnimal(farmId, id);
  if (!animal) notFound();

  // activeOnly: false — a species the farm has since stopped keeping must still
  // resolve to a name here, or editing one of its animals shows a dash.
  const [candidates, pens, index, species] = await Promise.all([
    listParentCandidates(farmId),
    listPensWithOccupancy(farmId),
    loadPedigreeIndex(farmId),
    listSpecies(farmId, { activeOnly: false }),
  ]);

  // Keep the animal and everything descended from it out of its own parent
  // pickers. `validateParentage` refuses these anyway, but a picker that can't
  // offer the mistake is better than an error that explains it.
  const excludeIds = [id, ...descendantIdsOf(index, id)];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Edit ${animal.tagNumber}${animal.name ? ` — ${animal.name}` : ""}`}
        description="Changing a parent or a birth date recalculates generation and inbreeding for this animal and every descendant."
      />
      <Card>
        <AnimalForm
          mode="edit"
          action={updateAnimal}
          values={animalFormValues(animal)}
          candidates={candidates.map(toParentCandidate)}
          pens={pens}
          species={species}
          excludeIds={excludeIds}
        />
      </Card>
    </div>
  );
}
