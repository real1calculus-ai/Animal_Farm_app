import type { Medication } from "@prisma/client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input, Label, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { formatCents, formatDate } from "@/lib/format";
import { MEDICATION_ROUTE_LABELS, optionsFrom } from "@/lib/labels";
import {
  medicationClearanceDate,
  medicationCourseEndDate,
} from "@/lib/health/withdrawal";
import {
  addMedication,
  completeMedication,
  deleteMedication,
  updateMedication,
} from "@/app/health/actions";

const ROUTE_OPTIONS = optionsFrom(MEDICATION_ROUTE_LABELS);

function dateValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/**
 * Medications attached to one health record.
 *
 * Each row shows its own clearance date rather than only the withdrawal day
 * count, because "14 days" requires the reader to know when the course ended
 * and then do the arithmetic — which is exactly the step that gets skipped.
 * Editing rows is a vet/management action; recording and completing a course
 * is not, so those two controls stay available to a worker.
 */
export function MedicationManager({
  medications,
  healthRecordId,
  canEdit,
  now = new Date(),
}: {
  medications: Medication[];
  healthRecordId: string;
  canEdit: boolean;
  now?: Date;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Medications</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          A withdrawal period runs from the end of the course. Until it expires the animal cannot be
          sold or slaughtered.
        </p>
      </div>

      {medications.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No medication recorded against this event.
        </p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Drug</Th>
              <Th>Dosage / route</Th>
              <Th>Course</Th>
              <Th>Withdrawal</Th>
              <Th>Clear from</Th>
              <Th className="text-right">Cost</Th>
              <Th className="text-right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {medications.map((medication) => {
              const courseEnd = medicationCourseEndDate(medication);
              const clearance = medicationClearanceDate(medication);
              const blocking = medication.withdrawalDays > 0 && clearance > now;
              return (
                <Tr key={medication.id}>
                  <Td>
                    <span className="font-medium">{medication.drugName}</span>
                    {medication.isAntibiotic ? (
                      <Badge variant="warning" className="ml-2">
                        Antibiotic
                      </Badge>
                    ) : null}
                    {medication.notes ? (
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                        {medication.notes}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {medication.dosage ?? "—"}
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {MEDICATION_ROUTE_LABELS[medication.route]}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(medication.startDate)}
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {medication.completedDate
                        ? `completed ${formatDate(medication.completedDate)}`
                        : medication.durationDays
                          ? `${medication.durationDays} days — ends ${formatDate(courseEnd)}`
                          : "single dose"}
                    </span>
                  </Td>
                  <Td className="tabular-nums">
                    {medication.withdrawalDays > 0 ? `${medication.withdrawalDays} d` : "None"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {medication.withdrawalDays > 0 ? (
                      <span
                        className={
                          blocking
                            ? "font-semibold text-red-700 dark:text-red-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }
                      >
                        {formatDate(clearance)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{formatCents(medication.costCents)}</Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2">
                      {!medication.completedDate ? (
                        <form action={completeMedication}>
                          <input type="hidden" name="id" value={medication.id} />
                          <SubmitButton variant="secondary" pendingLabel="Saving...">
                            Course complete
                          </SubmitButton>
                        </form>
                      ) : null}
                      {canEdit ? (
                        <form action={deleteMedication}>
                          <input type="hidden" name="id" value={medication.id} />
                          <SubmitButton variant="danger" pendingLabel="Removing...">
                            Remove
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      {canEdit && medications.length > 0 ? (
        <div className="space-y-2">
          {medications.map((medication) => (
            <details
              key={medication.id}
              className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-300">
                Edit {medication.drugName}
              </summary>
              <form action={updateMedication} className="mt-3 space-y-4">
                <input type="hidden" name="id" value={medication.id} />
                <MedicationFields
                  idPrefix={`edit-${medication.id}`}
                  defaults={{
                    drugName: medication.drugName,
                    dosage: medication.dosage ?? "",
                    route: medication.route,
                    startDate: dateValue(medication.startDate),
                    durationDays: medication.durationDays?.toString() ?? "",
                    completedDate: dateValue(medication.completedDate),
                    withdrawalDays: String(medication.withdrawalDays),
                    isAntibiotic: medication.isAntibiotic,
                    costMajor: (medication.costCents / 100).toFixed(2),
                    notes: medication.notes ?? "",
                  }}
                />
                <SubmitButton pendingLabel="Saving...">Save medication</SubmitButton>
              </form>
            </details>
          ))}
        </div>
      ) : null}

      <details className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Add a medication
        </summary>
        <form action={addMedication} className="mt-3 space-y-4">
          <input type="hidden" name="healthRecordId" value={healthRecordId} />
          <MedicationFields idPrefix="add" />
          <SubmitButton pendingLabel="Saving...">Add medication</SubmitButton>
        </form>
      </details>
    </Card>
  );
}

type MedicationDefaults = {
  drugName: string;
  dosage: string;
  route: string;
  startDate: string;
  durationDays: string;
  completedDate: string;
  withdrawalDays: string;
  isAntibiotic: boolean;
  costMajor: string;
  notes: string;
};

function MedicationFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: MedicationDefaults;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Drug name" htmlFor={`${idPrefix}-drugName`} required>
          <Input
            id={`${idPrefix}-drugName`}
            name="drugName"
            required
            defaultValue={defaults?.drugName ?? ""}
          />
        </Field>
        <Field label="Dosage" htmlFor={`${idPrefix}-dosage`}>
          <Input id={`${idPrefix}-dosage`} name="dosage" defaultValue={defaults?.dosage ?? ""} />
        </Field>
        <Field label="Route" htmlFor={`${idPrefix}-route`} required>
          <Select
            id={`${idPrefix}-route`}
            name="route"
            required
            defaultValue={defaults?.route ?? "INJECTION"}
          >
            {ROUTE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Start date" htmlFor={`${idPrefix}-startDate`} required>
          <Input
            id={`${idPrefix}-startDate`}
            name="startDate"
            type="date"
            required
            defaultValue={defaults?.startDate ?? new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Duration (days)" htmlFor={`${idPrefix}-durationDays`}>
          <Input
            id={`${idPrefix}-durationDays`}
            name="durationDays"
            type="number"
            min={1}
            defaultValue={defaults?.durationDays ?? ""}
          />
        </Field>
        <Field label="Completed on" htmlFor={`${idPrefix}-completedDate`}>
          <Input
            id={`${idPrefix}-completedDate`}
            name="completedDate"
            type="date"
            defaultValue={defaults?.completedDate ?? ""}
          />
        </Field>
        <Field
          label="Withdrawal (days)"
          htmlFor={`${idPrefix}-withdrawalDays`}
          hint="0 if none."
        >
          <Input
            id={`${idPrefix}-withdrawalDays`}
            name="withdrawalDays"
            type="number"
            min={0}
            defaultValue={defaults?.withdrawalDays ?? "0"}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Cost" htmlFor={`${idPrefix}-costCents`}>
          <Input
            id={`${idPrefix}-costCents`}
            name="costCents"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={defaults?.costMajor ?? ""}
          />
        </Field>
        <Field label="Notes" htmlFor={`${idPrefix}-notes`}>
          <Input id={`${idPrefix}-notes`} name="notes" defaultValue={defaults?.notes ?? ""} />
        </Field>
        <div>
          <Label htmlFor={`${idPrefix}-isAntibiotic`}>Antibiotic</Label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              id={`${idPrefix}-isAntibiotic`}
              type="checkbox"
              name="isAntibiotic"
              defaultChecked={defaults?.isAntibiotic ?? false}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
            />
            Counts towards antibiotic usage
          </label>
        </div>
      </div>
    </>
  );
}
