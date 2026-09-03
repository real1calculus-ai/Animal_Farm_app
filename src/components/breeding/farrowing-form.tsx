"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { SEX_LABELS, optionsFrom } from "@/lib/labels";
import { recordFarrowing } from "@/app/breeding/actions";

/** Nobody farrows more than this; the cap stops a typo generating 900 rows. */
const MAX_PIGLETS = 30;

type PigletRow = {
  tagNumber: string;
  sex: "MALE" | "FEMALE";
  birthWeightKg: string;
  markings: string;
};

/**
 * Farrowing entry: the litter *and* one animal per live piglet, in one form.
 *
 * The number born alive drives the piglet rows directly, because those two
 * numbers must agree — a litter recorded as 11 born alive with 9 registered
 * piglets leaves two animals that exist in the barn and not in the pedigree.
 * Tag numbers are pre-filled from a farm-wide scheme and every one of them is
 * editable, since plenty of farms number their animals from a book instead.
 */
export function FarrowingForm({
  breedingRecordId,
  suggestedTags,
  tagPrefix,
  defaultFarrowingDate,
  expectedPigletCount,
}: {
  breedingRecordId: string;
  suggestedTags: string[];
  tagPrefix: string;
  defaultFarrowingDate: string;
  expectedPigletCount: number | null;
}) {
  const [bornAlive, setBornAlive] = useState(0);
  const [piglets, setPiglets] = useState<PigletRow[]>([]);

  function suggestTag(index: number): string {
    return suggestedTags[index] ?? `${tagPrefix}${index + 1}`;
  }

  function resize(next: number): void {
    const count = Math.max(0, Math.min(MAX_PIGLETS, Number.isFinite(next) ? next : 0));
    setBornAlive(count);
    setPiglets((current) => {
      if (count <= current.length) return current.slice(0, count);
      const grown = [...current];
      for (let i = current.length; i < count; i++) {
        grown.push({ tagNumber: suggestTag(i), sex: "FEMALE", birthWeightKg: "", markings: "" });
      }
      return grown;
    });
  }

  function update(index: number, patch: Partial<PigletRow>): void {
    setPiglets((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  return (
    <form action={recordFarrowing} className="space-y-6">
      <input type="hidden" name="breedingRecordId" value={breedingRecordId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Farrowing date" htmlFor="farrowingDate" required>
          <Input
            id="farrowingDate"
            name="farrowingDate"
            type="date"
            required
            defaultValue={defaultFarrowingDate}
          />
        </Field>

        <Field label="Farrowing duration (minutes)" htmlFor="farrowingDurationMinutes">
          <Input
            id="farrowingDurationMinutes"
            name="farrowingDurationMinutes"
            type="number"
            min={0}
            max={2000}
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Born alive"
          htmlFor="bornAlive"
          required
          hint={
            expectedPigletCount !== null
              ? `${expectedPigletCount} expected at confirmation`
              : "One animal record is created per live piglet"
          }
        >
          <Input
            id="bornAlive"
            name="bornAlive"
            type="number"
            min={0}
            max={MAX_PIGLETS}
            inputMode="numeric"
            required
            value={bornAlive}
            onChange={(event) => resize(event.target.valueAsNumber)}
          />
        </Field>

        <Field label="Stillborn" htmlFor="stillborn">
          <Input id="stillborn" name="stillborn" type="number" min={0} defaultValue={0} inputMode="numeric" />
        </Field>

        <Field label="Mummified" htmlFor="mummified">
          <Input id="mummified" name="mummified" type="number" min={0} defaultValue={0} inputMode="numeric" />
        </Field>
      </div>

      <Card className="space-y-3 bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            Piglets ({piglets.length})
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Registered as animals immediately — that is what keeps the pedigree continuous.
          </p>
        </div>

        {piglets.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enter the number born alive above and a row will appear for each piglet.
          </p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th className="w-8">#</Th>
                <Th>Tag number</Th>
                <Th>Sex</Th>
                <Th>Birth weight (kg)</Th>
                <Th>Markings</Th>
              </Tr>
            </Thead>
            <Tbody>
              {piglets.map((piglet, index) => (
                <Tr key={index}>
                  <Td className="text-zinc-400">{index + 1}</Td>
                  <Td>
                    <Label htmlFor={`piglet-tag-${index}`} className="sr-only">
                      Tag number for piglet {index + 1}
                    </Label>
                    <Input
                      id={`piglet-tag-${index}`}
                      name="pigletTag"
                      required
                      value={piglet.tagNumber}
                      onChange={(event) => update(index, { tagNumber: event.target.value })}
                    />
                  </Td>
                  <Td>
                    <Label htmlFor={`piglet-sex-${index}`} className="sr-only">
                      Sex of piglet {index + 1}
                    </Label>
                    <Select
                      id={`piglet-sex-${index}`}
                      name="pigletSex"
                      value={piglet.sex}
                      onChange={(event) =>
                        update(index, { sex: event.target.value as PigletRow["sex"] })
                      }
                    >
                      {optionsFrom(SEX_LABELS).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Label htmlFor={`piglet-weight-${index}`} className="sr-only">
                      Birth weight of piglet {index + 1}
                    </Label>
                    <Input
                      id={`piglet-weight-${index}`}
                      name="pigletWeight"
                      type="number"
                      step="0.01"
                      min={0}
                      max={5}
                      inputMode="decimal"
                      value={piglet.birthWeightKg}
                      onChange={(event) => update(index, { birthWeightKg: event.target.value })}
                    />
                  </Td>
                  <Td>
                    <Label htmlFor={`piglet-markings-${index}`} className="sr-only">
                      Markings of piglet {index + 1}
                    </Label>
                    <Input
                      id={`piglet-markings-${index}`}
                      name="pigletMarkings"
                      value={piglet.markings}
                      onChange={(event) => update(index, { markings: event.target.value })}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Complications" htmlFor="complications" hint="Dystocia, retained placenta, …">
          <Textarea id="complications" name="complications" rows={2} />
        </Field>
        <Field label="Post-farrowing check" htmlFor="postFarrowingCheckNotes">
          <Textarea id="postFarrowingCheckNotes" name="postFarrowingCheckNotes" rows={2} />
        </Field>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="vetInterventionRequired"
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          Veterinary intervention required
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="colostrumIntakeObserved"
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          Colostrum intake observed
        </label>
      </div>

      <Field label="Notes" htmlFor="litter-notes">
        <Textarea id="litter-notes" name="notes" rows={2} />
      </Field>

      <SubmitButton pendingLabel="Registering litter...">
        Record farrowing and register {piglets.length} piglet{piglets.length === 1 ? "" : "s"}
      </SubmitButton>
    </form>
  );
}
