"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import {
  EXIT_REASON_LABELS,
  HEALTH_CATEGORY_LABELS,
  HEALTH_OUTCOME_LABELS,
  HEALTH_RECORD_TYPE_LABELS,
  MEDICATION_ROUTE_LABELS,
  SEVERITY_LABELS,
  optionsFrom,
} from "@/lib/labels";
import { CONDITIONS, findCondition } from "@/lib/health/conditions";

export type AnimalChoice = {
  id: string;
  tagNumber: string;
  name: string | null;
  /** ISO yyyy-mm-dd — bounds the record date so §8.3 is visible before submit. */
  dateOfBirth: string;
  penName: string | null;
};

export type HealthRecordInitial = {
  id?: string;
  animalId: string;
  recordedAt: string;
  recordType: string;
  category: string;
  severity: string;
  diagnosis: string;
  treatment: string;
  vetNotes: string;
  costMajor: string;
  outcome: string;
  resolvedAt: string;
};

type MedicationRow = { key: number; isAntibiotic: boolean; withdrawalDays: string };

const RECORD_TYPE_OPTIONS = optionsFrom(HEALTH_RECORD_TYPE_LABELS);
const CATEGORY_OPTIONS = optionsFrom(HEALTH_CATEGORY_LABELS);
const SEVERITY_OPTIONS = optionsFrom(SEVERITY_LABELS);
const OUTCOME_OPTIONS = optionsFrom(HEALTH_OUTCOME_LABELS);
const ROUTE_OPTIONS = optionsFrom(MEDICATION_ROUTE_LABELS);
/** A death recorded here is a death or a welfare cull — never a sale. */
const DEATH_EXIT_REASONS = (["DIED", "CULLED"] as const).map((value) => ({
  value,
  label: EXIT_REASON_LABELS[value],
}));

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The health-event entry form.
 *
 * The condition picker is the quick-entry path from §3.2: choosing a condition
 * fills category, severity, record type and a first-line treatment, and lists
 * the signs to check. It also writes the *canonical* diagnosis string, which is
 * what lets the outbreak detector cluster cases at all — six spellings of
 * "scours" never reach a threshold of three.
 *
 * Medications are repeatable rows posting parallel `med-*` arrays, which the
 * Server Action zips back together by index. `isAntibiotic` posts through a
 * hidden field rather than the checkbox itself: an unchecked checkbox posts
 * nothing, which would shift every later row's flag by one.
 */
export function HealthRecordForm({
  action,
  animals,
  mode,
  initial,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  animals: AnimalChoice[];
  mode: "create" | "edit";
  initial?: HealthRecordInitial;
  cancelHref: string;
}) {
  const [animalId, setAnimalId] = useState(initial?.animalId ?? "");
  const [query, setQuery] = useState("");
  const [conditionKey, setConditionKey] = useState("");
  const [recordType, setRecordType] = useState(initial?.recordType ?? "ILLNESS");
  const [category, setCategory] = useState(initial?.category ?? "RESPIRATORY");
  const [severity, setSeverity] = useState(initial?.severity ?? "MILD");
  const [diagnosis, setDiagnosis] = useState(initial?.diagnosis ?? "");
  const [treatment, setTreatment] = useState(initial?.treatment ?? "");
  const [outcome, setOutcome] = useState(initial?.outcome ?? "ONGOING");
  const [markDeceased, setMarkDeceased] = useState(true);
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const selectedAnimal = animals.find((animal) => animal.id === animalId) ?? null;
  const condition = useMemo(() => findCondition(diagnosis), [diagnosis]);

  const needle = query.trim().toLowerCase();
  const filteredAnimals = needle
    ? animals.filter((animal) =>
        [animal.tagNumber, animal.name ?? "", animal.penName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
    : animals;
  const selectionHidden =
    selectedAnimal !== null && !filteredAnimals.some((animal) => animal.id === animalId);

  function applyCondition(value: string) {
    setConditionKey(value);
    const picked = CONDITIONS.find((item) => item.diagnosis === value);
    if (!picked) return;
    setDiagnosis(picked.diagnosis);
    setCategory(picked.category);
    setSeverity(picked.typicalSeverity);
    setRecordType(picked.recordType);
    setTreatment(picked.treatments.join("; "));
  }

  function addMedicationRow() {
    setMedications((rows) => [
      ...rows,
      { key: nextKey, isAntibiotic: condition?.antibioticLikely ?? false, withdrawalDays: "0" },
    ]);
    setNextKey((key) => key + 1);
  }

  return (
    <form action={action} className="space-y-6">
      {mode === "edit" && initial?.id ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}

      <Card className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">The animal</h2>

        {mode === "create" ? (
          <div className="space-y-2">
            <Field label="Find an animal" htmlFor="animal-search">
              <Input
                id="animal-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tag number, name or pen"
              />
            </Field>
            <Field label="Animal" htmlFor="animalId" required>
              <Select
                id="animalId"
                name="animalId"
                required
                value={animalId}
                onChange={(event) => setAnimalId(event.target.value)}
              >
                <option value="">Select an animal</option>
                {selectionHidden && selectedAnimal ? (
                  <option value={selectedAnimal.id}>
                    {selectedAnimal.tagNumber}
                    {selectedAnimal.name ? ` — ${selectedAnimal.name}` : ""} (current selection)
                  </option>
                ) : null}
                {filteredAnimals.map((animal) => (
                  <option key={animal.id} value={animal.id}>
                    {animal.tagNumber}
                    {animal.name ? ` — ${animal.name}` : ""}
                    {animal.penName ? ` · ${animal.penName}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {selectedAnimal ? (
              <>
                Animal{" "}
                <Link
                  href={`/animals/${selectedAnimal.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  {selectedAnimal.tagNumber}
                </Link>
                . The animal on a record cannot be changed — record the event against the right
                animal instead.
              </>
            ) : (
              "The animal on a record cannot be changed."
            )}
          </p>
        )}

        <Field
          label="Date of the event"
          htmlFor="recordedAt"
          required
          hint={
            selectedAnimal
              ? `Cannot be in the future, or before ${selectedAnimal.tagNumber} was born on ${selectedAnimal.dateOfBirth}.`
              : "Cannot be in the future, or before the animal was born."
          }
        >
          <Input
            id="recordedAt"
            name="recordedAt"
            type="date"
            required
            min={selectedAnimal?.dateOfBirth}
            max={today()}
            defaultValue={initial?.recordedAt ?? today()}
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">What was found</h2>

        <Field
          label="Common condition"
          htmlFor="conditionKey"
          hint="Fills in the category, severity and a first-line treatment. Leave blank to type your own."
        >
          <Select
            id="conditionKey"
            value={conditionKey}
            onChange={(event) => applyCondition(event.target.value)}
          >
            <option value="">Choose a condition…</option>
            {CATEGORY_OPTIONS.map((group) => {
              const items = CONDITIONS.filter((item) => item.category === group.value);
              if (items.length === 0) return null;
              return (
                <optgroup key={group.value} label={group.label}>
                  {items.map((item) => (
                    <option key={item.diagnosis} value={item.diagnosis}>
                      {item.diagnosis}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </Field>

        {condition && condition.signs.length > 0 ? (
          <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
            <span className="font-medium">Signs to check: </span>
            {condition.signs.join(" · ")}
            {condition.contagious ? (
              <span className="mt-1 block font-medium text-amber-700 dark:text-amber-400">
                Contagious — consider isolating this animal and its pen mates.
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Record type" htmlFor="recordType" required>
            <Select
              id="recordType"
              name="recordType"
              required
              value={recordType}
              onChange={(event) => setRecordType(event.target.value)}
            >
              {RECORD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category" htmlFor="category" required>
            <Select
              id="category"
              name="category"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Severity" htmlFor="severity" required>
            <Select
              id="severity"
              name="severity"
              required
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Diagnosis"
          htmlFor="diagnosis"
          required
          hint="Recognised conditions are saved under their standard name so outbreak detection can group them."
        >
          <Input
            id="diagnosis"
            name="diagnosis"
            required
            list="condition-suggestions"
            value={diagnosis}
            onChange={(event) => setDiagnosis(event.target.value)}
            placeholder="e.g. Scours (diarrhoea)"
          />
        </Field>
        <datalist id="condition-suggestions">
          {CONDITIONS.map((item) => (
            <option key={item.diagnosis} value={item.diagnosis} />
          ))}
        </datalist>

        <Field label="Treatment applied" htmlFor="treatment">
          <Textarea
            id="treatment"
            name="treatment"
            rows={3}
            value={treatment}
            onChange={(event) => setTreatment(event.target.value)}
          />
        </Field>

        <Field label="Veterinary notes" htmlFor="vetNotes">
          <Textarea
            id="vetNotes"
            name="vetNotes"
            rows={2}
            defaultValue={initial?.vetNotes ?? ""}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Treatment cost" htmlFor="costCents" hint="Excluding medications below.">
            <Input
              id="costCents"
              name="costCents"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={initial?.costMajor ?? ""}
            />
          </Field>

          <Field label="Outcome" htmlFor="outcome" required>
            <Select
              id="outcome"
              name="outcome"
              required
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              {OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {outcome !== "ONGOING" ? (
            <Field label="Resolved on" htmlFor="resolvedAt" hint="Defaults to the event date.">
              <Input
                id="resolvedAt"
                name="resolvedAt"
                type="date"
                max={today()}
                defaultValue={initial?.resolvedAt ?? ""}
              />
            </Field>
          ) : null}
        </div>
      </Card>

      {outcome === "DEATH" && mode === "create" ? (
        <Card className="space-y-4 border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <h2 className="text-sm font-medium text-red-900 dark:text-red-200">This animal died</h2>
          <p className="text-sm text-red-800 dark:text-red-300">
            An animal left active after it has died corrupts every headcount, the morbidity rate and
            the breeding lists. Marking it deceased here happens in the same transaction as the
            record, so the two can never disagree.
          </p>

          <label className="flex items-start gap-2 text-sm text-red-900 dark:text-red-200">
            <input
              type="checkbox"
              name="markDeceased"
              checked={markDeceased}
              onChange={(event) => setMarkDeceased(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-red-400"
            />
            <span>Also set this animal&apos;s status to Deceased, with the event date as its exit date.</span>
          </label>

          {markDeceased ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Exit reason" htmlFor="exitReason" required>
                <Select id="exitReason" name="exitReason" required defaultValue="DIED">
                  {DEATH_EXIT_REASONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Exit notes" htmlFor="exitNotes" hint="Defaults to the diagnosis.">
                <Input id="exitNotes" name="exitNotes" />
              </Field>
            </div>
          ) : null}
        </Card>
      ) : null}

      {mode === "create" ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Medications</h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Withdrawal days are a food-safety control: the animal cannot be sold or slaughtered
                until the course has ended plus this many days.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={addMedicationRow}>
              Add medication
            </Button>
          </div>

          {medications.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No medication recorded. Add one for every drug actually administered.
            </p>
          ) : null}

          {medications.map((row, index) => (
            <fieldset
              key={row.key}
              className="space-y-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <legend className="px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Medication {index + 1}
              </legend>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Drug name" htmlFor={`med-drug-${row.key}`} required>
                  <Input id={`med-drug-${row.key}`} name="med-drugName" required />
                </Field>
                <Field label="Dosage" htmlFor={`med-dosage-${row.key}`}>
                  <Input id={`med-dosage-${row.key}`} name="med-dosage" placeholder="e.g. 5 ml" />
                </Field>
                <Field label="Route" htmlFor={`med-route-${row.key}`}>
                  <Select id={`med-route-${row.key}`} name="med-route" defaultValue="INJECTION">
                    {ROUTE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Field label="Start date" htmlFor={`med-start-${row.key}`} required>
                  <Input
                    id={`med-start-${row.key}`}
                    name="med-startDate"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </Field>
                <Field label="Duration (days)" htmlFor={`med-duration-${row.key}`}>
                  <Input
                    id={`med-duration-${row.key}`}
                    name="med-durationDays"
                    type="number"
                    min={1}
                    inputMode="numeric"
                  />
                </Field>
                <Field
                  label="Completed on"
                  htmlFor={`med-completed-${row.key}`}
                  hint="Leave blank while the course is running."
                >
                  <Input
                    id={`med-completed-${row.key}`}
                    name="med-completedDate"
                    type="date"
                  />
                </Field>
                <Field
                  label="Withdrawal (days)"
                  htmlFor={`med-withdrawal-${row.key}`}
                  required
                  hint="0 if none."
                >
                  <Input
                    id={`med-withdrawal-${row.key}`}
                    name="med-withdrawalDays"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={row.withdrawalDays}
                    onChange={(event) =>
                      setMedications((rows) =>
                        rows.map((item) =>
                          item.key === row.key
                            ? { ...item, withdrawalDays: event.target.value }
                            : item
                        )
                      )
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Medication cost" htmlFor={`med-cost-${row.key}`}>
                  <Input
                    id={`med-cost-${row.key}`}
                    name="med-costCents"
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Notes" htmlFor={`med-notes-${row.key}`}>
                  <Input id={`med-notes-${row.key}`} name="med-notes" />
                </Field>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <Label htmlFor={`med-antibiotic-${row.key}`}>Antibiotic</Label>
                    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        id={`med-antibiotic-${row.key}`}
                        type="checkbox"
                        checked={row.isAntibiotic}
                        onChange={(event) =>
                          setMedications((rows) =>
                            rows.map((item) =>
                              item.key === row.key
                                ? { ...item, isAntibiotic: event.target.checked }
                                : item
                            )
                          )
                        }
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                      />
                      Counts towards antibiotic usage
                    </label>
                    <input
                      type="hidden"
                      name="med-isAntibiotic"
                      value={row.isAntibiotic ? "true" : "false"}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setMedications((rows) => rows.filter((item) => item.key !== row.key))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>

              {Number(row.withdrawalDays) > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This animal will be blocked from sale and slaughter until{" "}
                  {row.withdrawalDays} days after the course ends.
                </p>
              ) : null}
            </fieldset>
          ))}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving record...">
          {mode === "create" ? "Save health record" : "Save changes"}
        </SubmitButton>
        <Link
          href={cancelHref}
          className="text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
