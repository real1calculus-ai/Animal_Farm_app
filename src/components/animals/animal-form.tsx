"use client";

import { useActionState, useId, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ParentSelect } from "@/components/animals/parent-select";
import {
  EMPTY_ACTION_STATE,
  type AnimalActionState,
  type AnimalFormValues,
  type ParentCandidate,
} from "@/components/animals/form-state";
import {
  ACQUISITION_TYPE_LABELS,
  COMMON_BREEDS,
  EXIT_REASON_LABELS,
  PIG_STATUS_LABELS,
  SEX_LABELS,
  optionsFrom,
} from "@/lib/labels";

export type SpeciesChoice = {
  id: string;
  name: string;
};

export type PenChoice = {
  id: string;
  name: string;
  housingType: string;
  capacity: number;
  occupancy: number;
};

const SEX_OPTIONS = optionsFrom(SEX_LABELS);
const STATUS_OPTIONS = optionsFrom(PIG_STATUS_LABELS);
const ACQUISITION_OPTIONS = optionsFrom(ACQUISITION_TYPE_LABELS);
const EXIT_REASON_OPTIONS = optionsFrom(EXIT_REASON_LABELS);

/**
 * One form for both create and edit. Sex and date of birth are held in local
 * state because the parent pickers depend on them: choosing a birth date has
 * to narrow the eligible dams and sires immediately, or the first the user
 * hears of an impossible pairing is a rejected save.
 */
export function AnimalForm({
  mode,
  action,
  values,
  candidates,
  pens,
  /** Species this farm records individually, from listIndividualSpecies(). */
  species,
  /** The animal itself plus its descendants — never offerable as its parents. */
  excludeIds = [],
}: {
  mode: "create" | "edit";
  action: (state: AnimalActionState, formData: FormData) => Promise<AnimalActionState>;
  values: AnimalFormValues;
  candidates: ParentCandidate[];
  pens: PenChoice[];
  species: SpeciesChoice[];
  excludeIds?: string[];
}) {
  const formId = useId();
  const breedListId = `${formId}-breeds`;

  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);

  const [dateOfBirth, setDateOfBirth] = useState(values.dateOfBirth);
  const [motherId, setMotherId] = useState(values.motherId);
  const [fatherId, setFatherId] = useState(values.fatherId);
  const [status, setStatus] = useState(values.status);

  const hasExited = status !== "ACTIVE" && status !== "RETIRED";

  // Species is fixed once an animal exists — updateAnimal deliberately does not
  // write it, so an editable control here would accept a change and discard it.
  const speciesName = species.find((entry) => entry.id === values.speciesId)?.name ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Identity
        </h2>

        {mode === "edit" ? (
          <Field label="Species" htmlFor={`${formId}-species`} hint="Fixed once an animal is recorded. Enter a new animal to correct it.">
            <p
              id={`${formId}-species`}
              className="text-sm text-zinc-700 dark:text-zinc-300"
            >
              {speciesName ?? "—"}
            </p>
          </Field>
        ) : species.length > 1 ? (
          <Field
            label="Species"
            htmlFor={`${formId}-speciesId`}
            required
            hint="Sets the gestation length, breeding ages and wording used for this animal everywhere else."
          >
            <Select
              id={`${formId}-speciesId`}
              name="speciesId"
              required
              defaultValue={values.speciesId}
            >
              <option value="">Choose a species…</option>
              {species.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : species.length === 1 ? (
          <>
            <input type="hidden" name="speciesId" value={species[0].id} />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Recording a {species[0].name.toLowerCase()} — the only species this farm keeps
              individually.
            </p>
          </>
        ) : null}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Tag number"
            htmlFor={`${formId}-tagNumber`}
            required
            hint="Ear tag or visible identifier. Must be unique on this farm."
          >
            <Input
              id={`${formId}-tagNumber`}
              name="tagNumber"
              required
              defaultValue={values.tagNumber}
              placeholder="e.g. 042"
            />
          </Field>

          <Field label="Name" htmlFor={`${formId}-name`}>
            <Input
              id={`${formId}-name`}
              name="name"
              defaultValue={values.name}
              placeholder="Optional"
            />
          </Field>

          <Field
            label="Breed"
            htmlFor={`${formId}-breed`}
            required
            hint="Suggestions offered, but type anything the farm actually keeps."
          >
            <Input
              id={`${formId}-breed`}
              name="breed"
              required
              list={breedListId}
              defaultValue={values.breed}
              placeholder="e.g. Large White"
            />
            <datalist id={breedListId}>
              {COMMON_BREEDS.map((breed) => (
                <option key={breed} value={breed} />
              ))}
            </datalist>
          </Field>

          <Field label="Sex" htmlFor={`${formId}-sex`} required>
            <Select id={`${formId}-sex`} name="sex" required defaultValue={values.sex}>
              {SEX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date of birth" htmlFor={`${formId}-dateOfBirth`} required>
            <Input
              id={`${formId}-dateOfBirth`}
              name="dateOfBirth"
              type="date"
              required
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
            />
          </Field>

          <Field label="Status" htmlFor={`${formId}-status`} required>
            <Select
              id={`${formId}-status`}
              name="status"
              required
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Pedigree
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Generation and inbreeding coefficient are recalculated automatically whenever a parent
            changes — for this animal and every descendant it has.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ParentSelect
            name="motherId"
            label="Dam (mother)"
            sex="FEMALE"
            candidates={candidates}
            value={motherId}
            onChange={setMotherId}
            childDateOfBirth={dateOfBirth}
            excludeIds={excludeIds}
          />

          <ParentSelect
            name="fatherId"
            label="Sire (father)"
            sex="MALE"
            candidates={candidates}
            value={fatherId}
            onChange={setFatherId}
            childDateOfBirth={dateOfBirth}
            excludeIds={excludeIds}
          />
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Housing &amp; physical traits
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Pen"
            htmlFor={`${formId}-penId`}
            hint={
              mode === "edit"
                ? "Correcting the pen here does not write a movement record — use “Move pen” on the animal's page for an actual move."
                : undefined
            }
          >
            <Select id={`${formId}-penId`} name="penId" defaultValue={values.penId}>
              <option value="">No pen assigned</option>
              {pens.map((pen) => (
                <option key={pen.id} value={pen.id}>
                  {pen.name} ({pen.occupancy}/{pen.capacity})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Markings" htmlFor={`${formId}-markings`}>
            <Input
              id={`${formId}-markings`}
              name="markings"
              defaultValue={values.markings}
              placeholder="e.g. white blaze, black left ear"
            />
          </Field>

          <Field label="Current weight (kg)" htmlFor={`${formId}-currentWeightKg`}>
            <Input
              id={`${formId}-currentWeightKg`}
              name="currentWeightKg"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              defaultValue={values.currentWeightKg}
            />
          </Field>

          <Field label="Birth weight (kg)" htmlFor={`${formId}-birthWeightKg`}>
            <Input
              id={`${formId}-birthWeightKg`}
              name="birthWeightKg"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={values.birthWeightKg}
            />
          </Field>

          <Field
            label="Body condition score"
            htmlFor={`${formId}-bodyConditionScore`}
            hint="1 (emaciated) to 5 (obese)."
          >
            <Input
              id={`${formId}-bodyConditionScore`}
              name="bodyConditionScore"
              type="number"
              min="1"
              max="5"
              step="1"
              inputMode="numeric"
              defaultValue={values.bodyConditionScore}
            />
          </Field>

          <Field label="Congenital defects" htmlFor={`${formId}-congenitalDefects`}>
            <Input
              id={`${formId}-congenitalDefects`}
              name="congenitalDefects"
              defaultValue={values.congenitalDefects}
              placeholder="None recorded"
            />
          </Field>

          <Field
            label="Phenotype notes"
            htmlFor={`${formId}-phenotypeNotes`}
            className="sm:col-span-2"
            hint="Conformation, temperament, teat count — what the breeding match finder reads."
          >
            <Textarea
              id={`${formId}-phenotypeNotes`}
              name="phenotypeNotes"
              rows={3}
              defaultValue={values.phenotypeNotes}
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Acquisition
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Acquisition type" htmlFor={`${formId}-acquisitionType`} required>
            <Select
              id={`${formId}-acquisitionType`}
              name="acquisitionType"
              required
              defaultValue={values.acquisitionType}
            >
              {ACQUISITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date acquired" htmlFor={`${formId}-dateAcquired`} required>
            <Input
              id={`${formId}-dateAcquired`}
              name="dateAcquired"
              type="date"
              required
              defaultValue={values.dateAcquired}
            />
          </Field>

          <Field
            label="Acquisition cost (₦)"
            htmlFor={`${formId}-acquisitionCost`}
            hint="Leave blank for animals born on the farm."
          >
            <Input
              id={`${formId}-acquisitionCost`}
              name="acquisitionCost"
              type="text"
              inputMode="decimal"
              defaultValue={values.acquisitionCost}
              placeholder="0.00"
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Exit
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {hasExited
              ? "This animal's status says it has left the herd — record when and why."
              : "Only needed once the animal leaves the herd."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Exit date" htmlFor={`${formId}-dateExit`}>
            <Input
              id={`${formId}-dateExit`}
              name="dateExit"
              type="date"
              defaultValue={values.dateExit}
            />
          </Field>

          <Field label="Reason for exit" htmlFor={`${formId}-exitReason`}>
            <Select id={`${formId}-exitReason`} name="exitReason" defaultValue={values.exitReason}>
              <option value="">Not recorded</option>
              {EXIT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Exit notes" htmlFor={`${formId}-exitNotes`}>
            <Input id={`${formId}-exitNotes`} name="exitNotes" defaultValue={values.exitNotes} />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={mode === "create" ? "Creating..." : "Saving..."}>
          {mode === "create" ? "Create animal" : "Save changes"}
        </SubmitButton>
        <ButtonLink
          href={values.id ? `/animals/${values.id}` : "/animals"}
          variant="secondary"
        >
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
