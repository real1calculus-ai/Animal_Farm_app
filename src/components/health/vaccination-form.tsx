"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Label, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { recordVaccination } from "@/app/health/vaccinations/actions";

export type VaccinationFormPig = {
  id: string;
  tagNumber: string;
  name: string | null;
  penName: string | null;
};

export type VaccinationFormPen = { id: string; name: string; activeCount: number };

export type VaccinationFormProtocol = {
  id: string;
  name: string;
  vaccineName: string;
  boosterIntervalDays: number | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Recording a vaccination, for one animal or a whole pen.
 *
 * Whole-pen is the default scope because that is how the job is actually done:
 * one bottle, one lot number, one trip down the passage. Forcing forty
 * individual entries is how a farm ends up with no vaccination records at all,
 * and the lot number — the thing a recall depends on — is the first casualty.
 */
export function VaccinationForm({
  pigs,
  pens,
  protocolItems,
  defaultPigId,
  defaultProtocolItemId,
}: {
  pigs: VaccinationFormPig[];
  pens: VaccinationFormPen[];
  protocolItems: VaccinationFormProtocol[];
  defaultPigId?: string;
  defaultProtocolItemId?: string;
}) {
  const initialProtocol = protocolItems.find((item) => item.id === defaultProtocolItemId);

  const [scope, setScope] = useState<"ANIMAL" | "PEN">(defaultPigId ? "ANIMAL" : "PEN");
  const [protocolItemId, setProtocolItemId] = useState(defaultProtocolItemId ?? "");
  const [vaccineName, setVaccineName] = useState(initialProtocol?.vaccineName ?? "");
  const [nextDueDate, setNextDueDate] = useState(
    initialProtocol?.boosterIntervalDays
      ? addDaysIso(initialProtocol.boosterIntervalDays)
      : ""
  );
  const [query, setQuery] = useState("");

  function applyProtocol(value: string) {
    setProtocolItemId(value);
    const item = protocolItems.find((protocol) => protocol.id === value);
    if (!item) return;
    setVaccineName(item.vaccineName);
    setNextDueDate(item.boosterIntervalDays ? addDaysIso(item.boosterIntervalDays) : "");
  }

  const needle = query.trim().toLowerCase();
  const filteredPigs = needle
    ? pigs.filter((pig) =>
        [pig.tagNumber, pig.name ?? "", pig.penName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
    : pigs;

  return (
    <Card className="space-y-4">
      <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Record a vaccination
      </h2>

      <form action={recordVaccination} className="space-y-4">
        <input type="hidden" name="scope" value={scope} />

        <fieldset>
          <Label>Who is being vaccinated?</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="radio"
                name="scope-choice"
                checked={scope === "PEN"}
                onChange={() => setScope("PEN")}
                className="h-4 w-4"
              />
              A whole pen
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="radio"
                name="scope-choice"
                checked={scope === "ANIMAL"}
                onChange={() => setScope("ANIMAL")}
                className="h-4 w-4"
              />
              A single animal
            </label>
          </div>
        </fieldset>

        {scope === "PEN" ? (
          <Field
            label="Pen"
            htmlFor="penId"
            required
            hint="Every active animal in the pen gets a record with this vaccine, date and lot number."
          >
            <Select id="penId" name="penId" required defaultValue="">
              <option value="">Select a pen</option>
              {pens.map((pen) => (
                <option key={pen.id} value={pen.id}>
                  {pen.name} — {pen.activeCount} active
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="space-y-2">
            <Field label="Find an animal" htmlFor="vacc-search">
              <Input
                id="vacc-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tag number, name or pen"
              />
            </Field>
            <Field label="Animal" htmlFor="pigId" required>
              <Select id="pigId" name="pigId" required defaultValue={defaultPigId ?? ""}>
                <option value="">Select an animal</option>
                {filteredPigs.map((pig) => (
                  <option key={pig.id} value={pig.id}>
                    {pig.tagNumber}
                    {pig.name ? ` — ${pig.name}` : ""}
                    {pig.penName ? ` · ${pig.penName}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Protocol item"
            htmlFor="protocolItemId"
            hint="Links the dose to the standing schedule so compliance is tracked."
          >
            <Select
              id="protocolItemId"
              name="protocolItemId"
              value={protocolItemId}
              onChange={(event) => applyProtocol(event.target.value)}
            >
              <option value="">Not part of the protocol</option>
              {protocolItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.vaccineName})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Vaccine" htmlFor="vaccineName" required>
            <Input
              id="vaccineName"
              name="vaccineName"
              required
              value={vaccineName}
              onChange={(event) => setVaccineName(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date administered" htmlFor="administeredAt" required>
            <Input
              id="administeredAt"
              name="administeredAt"
              type="date"
              required
              max={today()}
              defaultValue={today()}
            />
          </Field>

          <Field label="Lot number" htmlFor="lotNumber" hint="Kept for recall traceability.">
            <Input id="lotNumber" name="lotNumber" />
          </Field>

          <Field label="Veterinarian" htmlFor="veterinarian">
            <Input id="veterinarian" name="veterinarian" />
          </Field>

          <Field label="Next dose due" htmlFor="nextDueDate">
            <Input
              id="nextDueDate"
              name="nextDueDate"
              type="date"
              value={nextDueDate}
              onChange={(event) => setNextDueDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cost" htmlFor="costCents" hint="Per animal when vaccinating a pen.">
            <Input id="costCents" name="costCents" inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Input id="notes" name="notes" />
          </Field>
        </div>

        <SubmitButton pendingLabel="Recording...">
          {scope === "PEN" ? "Record for the whole pen" : "Record vaccination"}
        </SubmitButton>
      </form>
    </Card>
  );
}
