import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FarrowingForm } from "@/components/breeding/farrowing-form";
import { DueCountdown, PregnancyStatusBadge } from "@/components/breeding/status-badge";
import { BAND_LABELS } from "@/components/breeding/match-card";
import { requireUser, HEALTH_ROLES, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import {
  addDays,
  daysBetween,
  formatAge,
  formatDate,
  formatKg,
  formatPercent,
  toDateInputValue,
} from "@/lib/format";
import { inbreedingBand, inbreedingBandVariant } from "@/lib/breeding/inbreeding";
import {
  BREEDING_METHOD_LABELS,
  CONFIRMATION_METHOD_LABELS,
  PREGNANCY_STATUS_LABELS,
  SEX_LABELS,
  optionsFrom,
} from "@/lib/labels";
import {
  getBreedingRecord,
  getSowProductivity,
  offspringTagPrefix,
  suggestOffspringTags,
} from "@/lib/db/breeding";
import {
  recordWeaning,
  updateBreedingNotes,
  updatePregnancyStatus,
} from "@/app/breeding/actions";

/**
 * One mating, from service to weaning.
 *
 * The page is ordered the way the event actually unfolds — the pairing, then
 * confirmation, then farrowing, then weaning — so the next thing that needs
 * doing is always the next thing on screen.
 */
export default async function BreedingRecordPage({ params }: PageProps<"/breeding/[id]">) {
  const { id } = await params;

  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const record = await getBreedingRecord(farmId, id);
  if (!record) notFound();

  const productivity = await getSowProductivity(farmId, record.dam.id);
  const canRecordBreeding = WRITE_ROLES.includes(user.role);
  const canUpdatePregnancy = HEALTH_ROLES.includes(user.role);

  const litter = record.litter;
  const today = new Date();
  const suggestedTags = litter
    ? []
    : await suggestOffspringTags(farmId, record.dam.tagNumber, today, 30);

  const f = record.offspringInbreedingCoefficient;
  const band =
    f === null
      ? null
      : inbreedingBand(f, settings.warnInbreedingCoefficient, settings.maxInbreedingCoefficient);

  const gestationDay = daysBetween(record.breedingDate, litter?.farrowingDate ?? today);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${record.dam.tagNumber} × ${record.sire.tagNumber}`}
        description={`Mated ${formatDate(record.breedingDate)} · ${BREEDING_METHOD_LABELS[record.method]}`}
        actions={
          <>
            <ButtonLink href="/breeding" variant="secondary">
              All records
            </ButtonLink>
            <ButtonLink href={`/breeding/match-finder?damId=${record.dam.id}`} variant="secondary">
              Matches for this dam
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Status"
          value={PREGNANCY_STATUS_LABELS[record.pregnancyStatus]}
          hint={
            record.confirmationDate
              ? `Confirmed ${formatDate(record.confirmationDate)}`
              : "Not yet confirmed"
          }
        />
        <StatTile
          label={litter ? "Gestation length" : "Day of gestation"}
          value={`${gestationDay} d`}
          hint={`Farm gestation ${settings.gestationDays} days`}
        />
        <StatTile
          label="Expected farrowing"
          value={formatDate(record.expectedFarrowingDate)}
          hint={`± ${settings.gestationToleranceDays} days`}
        />
        <StatTile
          label="Offspring F"
          value={f === null ? "—" : formatPercent(f, 2)}
          hint={band ? BAND_LABELS[band] : "Not recorded at mating"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">The mating</h2>
            <div className="flex items-center gap-2">
              <PregnancyStatusBadge status={record.pregnancyStatus} />
              {band ? (
                <Badge variant={inbreedingBandVariant(band)}>{BAND_LABELS[band]}</Badge>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Detail label="Dam">
              <Link href={`/animals/${record.dam.id}`} className="underline">
                {record.dam.tagNumber}
                {record.dam.name ? ` — ${record.dam.name}` : ""}
              </Link>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {record.dam.breed} · {formatAge(record.dam.dateOfBirth)} ·{" "}
                {formatKg(record.dam.currentWeightKg)} · parity {productivity.parity}
              </span>
            </Detail>

            <Detail label="Sire">
              <Link href={`/animals/${record.sire.id}`} className="underline">
                {record.sire.tagNumber}
                {record.sire.name ? ` — ${record.sire.name}` : ""}
              </Link>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {record.sire.breed} · {formatAge(record.sire.dateOfBirth)} ·{" "}
                {formatKg(record.sire.currentWeightKg)}
              </span>
            </Detail>

            <Detail label="Breeding date">{formatDate(record.breedingDate)}</Detail>
            <Detail label="Method">{BREEDING_METHOD_LABELS[record.method]}</Detail>
            <Detail label="Expected farrowing">
              {formatDate(record.expectedFarrowingDate)}{" "}
              <span className="ml-1">
                <DueCountdown
                  expectedFarrowingDate={record.expectedFarrowingDate}
                  status={record.pregnancyStatus}
                  toleranceDays={settings.gestationToleranceDays}
                />
              </span>
            </Detail>
            <Detail label="Expected weaning">
              {litter
                ? formatDate(litter.weaningDate ?? addDays(litter.farrowingDate, settings.weaningAgeDays))
                : formatDate(
                    addDays(record.expectedFarrowingDate, settings.weaningAgeDays)
                  )}
            </Detail>
            <Detail label="Confirmation">
              {record.confirmationMethod
                ? `${CONFIRMATION_METHOD_LABELS[record.confirmationMethod]} on ${formatDate(record.confirmationDate)}`
                : "Not confirmed"}
            </Detail>
            <Detail label="Expected offspring">
              {record.expectedOffspringCount === null ? "—" : String(record.expectedOffspringCount)}
            </Detail>
            <Detail label="Abnormalities noted">{record.abnormalitiesNoted ?? "—"}</Detail>
            <Detail label="Recorded by">
              {record.createdBy?.name ?? "—"}
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {formatDate(record.createdAt)}
              </span>
            </Detail>
          </dl>

          {record.overrideReason ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <p className="font-semibold">Recorded over a warning</p>
              <p className="mt-1 whitespace-pre-line">{record.overrideReason}</p>
            </div>
          ) : null}

          {canRecordBreeding ? (
            <form action={updateBreedingNotes} className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <input type="hidden" name="breedingRecordId" value={record.id} />
              <Field label="Notes" htmlFor="notes">
                <Textarea id="notes" name="notes" rows={2} defaultValue={record.notes ?? ""} />
              </Field>
              <SubmitButton variant="secondary" pendingLabel="Saving...">
                Save notes
              </SubmitButton>
            </form>
          ) : record.notes ? (
            <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
              {record.notes}
            </p>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Sow productivity
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Lifetime figures for {record.dam.tagNumber}.
          </p>
          <dl className="space-y-2 text-sm">
            <Metric label="Parity (litters farrowed)" value={String(productivity.parity)} />
            <Metric label="Lifetime animals born" value={String(productivity.lifetimeAnimalsBorn)} />
            <Metric label="Lifetime born alive" value={String(productivity.lifetimeBornAlive)} />
            <Metric label="Lifetime animals weaned" value={String(productivity.lifetimeAnimalsWeaned)} />
            <Metric
              label="Pigs born per litter"
              value={productivity.pigsBornPerLitter?.toFixed(1) ?? "—"}
            />
            <Metric
              label="Pigs weaned per litter"
              value={productivity.pigsWeanedPerLitter?.toFixed(1) ?? "—"}
            />
            <Metric
              label="Farrowing interval"
              value={
                productivity.farrowingIntervalDays === null
                  ? "—"
                  : `${productivity.farrowingIntervalDays.toFixed(0)} days`
              }
            />
            <Metric
              label="Pre-weaning mortality"
              value={
                productivity.preWeaningMortality === null
                  ? "—"
                  : formatPercent(productivity.preWeaningMortality, 0)
              }
            />
          </dl>
        </Card>
      </div>

      {/* --- Pregnancy status ------------------------------------------- */}
      {!litter ? (
        <Card className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Pregnancy status
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Confirmation is clinical work: administrators, managers and the vet may change it.
            </p>
          </div>

          {canUpdatePregnancy ? (
            <form action={updatePregnancyStatus} className="space-y-4">
              <input type="hidden" name="breedingRecordId" value={record.id} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Status" htmlFor="pregnancyStatus" required>
                  <Select
                    id="pregnancyStatus"
                    name="pregnancyStatus"
                    required
                    defaultValue={record.pregnancyStatus}
                  >
                    {optionsFrom(PREGNANCY_STATUS_LABELS)
                      .filter((option) => option.value !== "FARROWED")
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </Select>
                </Field>

                <Field label="Confirmation method" htmlFor="confirmationMethod">
                  <Select
                    id="confirmationMethod"
                    name="confirmationMethod"
                    defaultValue={record.confirmationMethod ?? ""}
                  >
                    <option value="">Not confirmed</option>
                    {optionsFrom(CONFIRMATION_METHOD_LABELS).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Confirmation date" htmlFor="confirmationDate">
                  <Input
                    id="confirmationDate"
                    name="confirmationDate"
                    type="date"
                    max={toDateInputValue(today)}
                    defaultValue={toDateInputValue(record.confirmationDate)}
                  />
                </Field>

                <Field label="Expected offspring count" htmlFor="expectedOffspringCount">
                  <Input
                    id="expectedOffspringCount"
                    name="expectedOffspringCount"
                    type="number"
                    min={0}
                    max={40}
                    inputMode="numeric"
                    defaultValue={record.expectedOffspringCount ?? ""}
                  />
                </Field>
              </div>

              <Field label="Abnormalities noted" htmlFor="abnormalitiesNoted">
                <Textarea
                  id="abnormalitiesNoted"
                  name="abnormalitiesNoted"
                  rows={2}
                  defaultValue={record.abnormalitiesNoted ?? ""}
                />
              </Field>

              <SubmitButton pendingLabel="Updating...">Update pregnancy status</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your role cannot change pregnancy status. Ask a manager or the veterinarian.
            </p>
          )}
        </Card>
      ) : null}

      {/* --- Farrowing --------------------------------------------------- */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {litter ? "Litter" : "Record the farrowing"}
          </h2>
          {litter ? (
            <Badge variant="success">
              Farrowed {formatDate(litter.farrowingDate)} · {litter.offspring.length} offspring
              registered
            </Badge>
          ) : null}
        </div>

        {litter ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <Detail label="Born alive">{litter.bornAlive}</Detail>
              <Detail label="Stillborn">{litter.stillborn}</Detail>
              <Detail label="Mummified">{litter.mummified}</Detail>
              <Detail label="Duration">
                {litter.farrowingDurationMinutes === null
                  ? "—"
                  : `${litter.farrowingDurationMinutes} min`}
              </Detail>
              <Detail label="Vet intervention">
                {litter.vetInterventionRequired ? "Required" : "Not required"}
              </Detail>
              <Detail label="Colostrum observed">
                {litter.colostrumIntakeObserved ? "Yes" : "Not observed"}
              </Detail>
              <Detail label="Weaned">
                {litter.weaningDate
                  ? `${litter.weanedCount ?? 0} on ${formatDate(litter.weaningDate)}`
                  : `Due ${formatDate(addDays(litter.farrowingDate, settings.weaningAgeDays))}`}
              </Detail>
              <Detail label="Complications">{litter.complications ?? "None recorded"}</Detail>
            </dl>

            {litter.postFarrowingCheckNotes ? (
              <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
                {litter.postFarrowingCheckNotes}
              </p>
            ) : null}

            <div>
              <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">
                Offspring ({litter.offspring.length})
              </h3>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Tag</Th>
                    <Th>Sex</Th>
                    <Th>Birth weight</Th>
                    <Th>Markings</Th>
                    <Th className="text-right">Generation</Th>
                    <Th className="text-right">F</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {litter.offspring.map((offspring) => (
                    <Tr key={offspring.id}>
                      <Td className="whitespace-nowrap font-medium">
                        <Link href={`/animals/${offspring.id}`} className="hover:underline">
                          {offspring.tagNumber}
                        </Link>
                      </Td>
                      <Td>{SEX_LABELS[offspring.sex]}</Td>
                      <Td>{formatKg(offspring.birthWeightKg, 2)}</Td>
                      <Td className="text-zinc-600 dark:text-zinc-400">{offspring.markings ?? "—"}</Td>
                      <Td className="text-right tabular-nums">{offspring.generation}</Td>
                      <Td className="text-right tabular-nums">
                        {formatPercent(offspring.inbreedingCoefficient, 2)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            {canRecordBreeding && !litter.weaningDate ? (
              <form
                action={recordWeaning}
                className="grid grid-cols-1 items-end gap-4 border-t border-zinc-200 pt-4 sm:grid-cols-3 dark:border-zinc-800"
              >
                <input type="hidden" name="litterId" value={litter.id} />
                <Field label="Weaning date" htmlFor="weaningDate" required>
                  <Input
                    id="weaningDate"
                    name="weaningDate"
                    type="date"
                    required
                    max={toDateInputValue(today)}
                    defaultValue={toDateInputValue(
                      addDays(litter.farrowingDate, settings.weaningAgeDays) > today
                        ? today
                        : addDays(litter.farrowingDate, settings.weaningAgeDays)
                    )}
                  />
                </Field>
                <Field
                  label="Offspring weaned"
                  htmlFor="weanedCount"
                  required
                  hint={`Up to the ${litter.bornAlive} born alive`}
                >
                  <Input
                    id="weanedCount"
                    name="weanedCount"
                    type="number"
                    min={0}
                    max={litter.bornAlive}
                    inputMode="numeric"
                    required
                    defaultValue={litter.offspring.length}
                  />
                </Field>
                <SubmitButton pendingLabel="Saving...">Record weaning</SubmitButton>
              </form>
            ) : null}
          </div>
        ) : canRecordBreeding ? (
          <FarrowingForm
            breedingRecordId={record.id}
            suggestedTags={suggestedTags}
            tagPrefix={offspringTagPrefix(record.dam.tagNumber, today)}
            defaultFarrowingDate={toDateInputValue(today)}
            expectedOffspringCount={record.expectedOffspringCount}
          />
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Your role cannot record farrowings.
          </p>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 pb-1 last:border-0 dark:border-zinc-800">
      <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}
