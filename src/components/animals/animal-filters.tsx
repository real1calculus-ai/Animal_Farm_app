import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import {
  LIFE_STAGE_LABELS,
  PIG_STATUS_LABELS,
  SEX_LABELS,
  optionsFrom,
} from "@/lib/labels";
import type { PenOption } from "@/lib/db/animals";

const STATUS_OPTIONS = optionsFrom(PIG_STATUS_LABELS);
const SEX_OPTIONS = optionsFrom(SEX_LABELS);
const LIFE_STAGE_OPTIONS = optionsFrom(LIFE_STAGE_LABELS);

export type SpeciesOption = { id: string; name: string };

export type AnimalFilterValues = {
  status: string;
  speciesId: string;
  sex: string;
  breed: string;
  penId: string;
  lifeStage: string;
  q: string;
};

/**
 * A plain GET form rather than a client-side filter bar: the herd list is the
 * screen this app is opened on, usually on a phone with poor signal, and a
 * server-rendered query string means the result is shareable, bookmarkable and
 * survives a back button — with no JavaScript needed before the first filter
 * works.
 */
export function AnimalFilters({
  values,
  breeds,
  pens,
  species,
}: {
  values: AnimalFilterValues;
  breeds: string[];
  pens: PenOption[];
  species: SpeciesOption[];
}) {
  return (
    <form method="get" action="/animals" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Search" htmlFor="filter-q" className="lg:col-span-3">
          <Input
            id="filter-q"
            name="q"
            type="search"
            inputMode="search"
            defaultValue={values.q}
            placeholder="Tag number or name"
          />
        </Field>

        <Field label="Status" htmlFor="filter-status">
          <Select id="filter-status" name="status" defaultValue={values.status}>
            <option value="ALL">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {/* Only worth a control on a farm that keeps more than one thing. */}
        {species.length > 1 ? (
          <Field label="Species" htmlFor="filter-speciesId">
            <Select id="filter-speciesId" name="speciesId" defaultValue={values.speciesId}>
              <option value="">Any species</option>
              {species.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Sex" htmlFor="filter-sex">
          <Select id="filter-sex" name="sex" defaultValue={values.sex}>
            <option value="">Any</option>
            {SEX_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Life stage" htmlFor="filter-lifeStage">
          <Select id="filter-lifeStage" name="lifeStage" defaultValue={values.lifeStage}>
            <option value="">Any</option>
            {LIFE_STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Breed" htmlFor="filter-breed">
          <Select id="filter-breed" name="breed" defaultValue={values.breed}>
            <option value="">Any</option>
            {breeds.map((breed) => (
              <option key={breed} value={breed}>
                {breed}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Pen" htmlFor="filter-penId">
          <Select id="filter-penId" name="penId" defaultValue={values.penId}>
            <option value="">Any</option>
            <option value="NONE">No pen assigned</option>
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.name} ({pen.occupancy}/{pen.capacity})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">Apply filters</Button>
        <ButtonLink href="/animals" variant="secondary">
          Reset
        </ButtonLink>
      </div>
    </form>
  );
}
