import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AnimalFilters } from "@/components/animals/animal-filters";
import { AnimalTable } from "@/components/animals/animal-table";
import { requireUser, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { getAnimalFilterOptions, listAnimals, type AnimalFilters as Filters } from "@/lib/db/animals";
import { PIG_STATUS_LABELS, LIFE_STAGE_LABELS, SEX_LABELS } from "@/lib/labels";
import type { LifeStage, AnimalStatus, Sex } from "@prisma/client";

/** Reads one query-string value, ignoring the repeated-param array form. */
function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Query-string values are attacker-controlled, so an unknown one is dropped
 * rather than passed to Prisma. `Object.hasOwn` and not `in`: `in` also matches
 * inherited keys, which would let `?status=toString` through as a status.
 */
function asEnum<T extends string>(value: string, allowed: Record<T, string>): T | undefined {
  return Object.hasOwn(allowed, value) ? (value as T) : undefined;
}

export default async function AnimalsPage({ searchParams }: PageProps<"/animals">) {
  // Read-only for VETERINARIAN; only write roles get the "Add animal" button.
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const canEdit = WRITE_ROLES.includes(user.role);

  const params = await searchParams;

  // Defaults to ACTIVE. A herd list that opens on years of dead stock is a
  // list nobody can use to do the morning round.
  const statusParam = single(params.status) || "ACTIVE";
  const speciesParam = single(params.speciesId);
  const sexParam = single(params.sex);
  const lifeStageParam = single(params.lifeStage);
  const breed = single(params.breed);
  const penId = single(params.penId);
  const q = single(params.q);

  const filters: Filters = {
    status: statusParam === "ALL" ? "ALL" : asEnum<AnimalStatus>(statusParam, PIG_STATUS_LABELS),
    // Needs no allowlist, unlike the enums above: it is an equality match on an
    // id inside a where clause that already carries farmId, so an invented
    // value returns nothing rather than reaching another farm's animals.
    speciesId: speciesParam || undefined,
    sex: asEnum<Sex>(sexParam, SEX_LABELS),
    lifeStage: asEnum<LifeStage>(lifeStageParam, LIFE_STAGE_LABELS),
    breed: breed || undefined,
    penId: penId || undefined,
    search: q || undefined,
  };

  const [animals, options] = await Promise.all([
    listAnimals(farmId, filters),
    getAnimalFilterOptions(farmId),
  ]);

  const isFiltered =
    statusParam !== "ACTIVE" ||
    Boolean(speciesParam || sexParam || lifeStageParam || breed || penId || q);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Animals"
        description={`${animals.length} animal${animals.length === 1 ? "" : "s"} matching these filters`}
        actions={canEdit ? <ButtonLink href="/animals/new">+ Add animal</ButtonLink> : null}
      />

      <Card>
        <AnimalFilters
          values={{
            status: statusParam,
            speciesId: speciesParam,
            sex: sexParam,
            breed,
            penId,
            lifeStage: lifeStageParam,
            q,
          }}
          breeds={options.breeds}
          pens={options.pens}
          species={options.species}
        />
      </Card>

      {animals.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No animals match those filters" : "No animals recorded yet"}
          description={
            isFiltered
              ? "Try widening the search — the list defaults to active animals only, so anything sold, culled or deceased is hidden until you change the status filter."
              : "The herd list is built from individual animal records. Add the first one to start tracking weights, pedigree and health."
          }
          action={
            canEdit ? <ButtonLink href="/animals/new">+ Add animal</ButtonLink> : undefined
          }
        />
      ) : (
        <AnimalTable animals={animals} />
      )}
    </div>
  );
}
