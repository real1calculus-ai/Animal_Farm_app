import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import {
  DueCountdown,
  PregnancyStatusBadge,
  dueRowClasses,
} from "@/components/breeding/status-badge";
import { dateParam, firstParam, statusParam } from "@/components/breeding/search-params";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { formatDate, formatPercent, toDateInputValue } from "@/lib/format";
import { BREEDING_METHOD_LABELS, PREGNANCY_STATUS_LABELS, optionsFrom } from "@/lib/labels";
import {
  getBreedingAttention,
  listBreedingCandidates,
  listBreedingRecords,
} from "@/lib/db/breeding";

/**
 * The breeding register — and the farrowing shed's working document.
 *
 * Rows are tinted by urgency rather than only carrying a badge: an overdue sow
 * has to be findable at a glance by someone holding a phone in one hand, which
 * is why the countdown column says "5 days OVERDUE" in words instead of showing
 * a date the reader has to subtract from today.
 */
export default async function BreedingRecordsPage({
  searchParams,
}: PageProps<"/breeding">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const params = await searchParams;
  const filters = {
    status: statusParam(params.status),
    damId: firstParam(params.damId),
    sireId: firstParam(params.sireId),
    from: dateParam(params.from),
    to: dateParam(params.to),
  };

  const [records, dams, sires, attention] = await Promise.all([
    listBreedingRecords(farmId, filters),
    listBreedingCandidates(farmId, "FEMALE"),
    listBreedingCandidates(farmId, "MALE"),
    getBreedingAttention(farmId, settings),
  ]);

  const hasFilters = Object.values(filters).some((value) => value !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Breeding records"
        description={`Matings, pregnancies and farrowing outcomes. Gestation on this farm is ${settings.gestationDays} days.`}
        actions={
          <>
            <ButtonLink href="/breeding/match-finder" variant="secondary">
              Match finder
            </ButtonLink>
            <ButtonLink href="/breeding/calendar" variant="secondary">
              Calendar
            </ButtonLink>
            <ButtonLink href="/breeding/estrus" variant="secondary">
              Heat log
            </ButtonLink>
            <ButtonLink href="/breeding/new">Record mating</ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Overdue farrowings"
          value={String(attention.overdue.length)}
          hint={`Past expected date + ${settings.gestationToleranceDays} days`}
        />
        <StatTile
          label="Due in 7 days"
          value={String(attention.dueThisWeek.length)}
          hint="Prepare farrowing pens"
        />
        <StatTile
          label="Awaiting confirmation"
          value={String(attention.unconfirmed.length)}
          hint={`Mated over ${settings.estrusCycleDays} days ago`}
        />
        <StatTile
          label="Gilts ready to breed"
          value={String(attention.readyGilts.length)}
          hint="At age and weight, never bred"
        />
      </div>

      <Card>
        <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Pregnancy status" htmlFor="status">
            <Select id="status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">All statuses</option>
              <option value="OPEN">Open (awaiting outcome)</option>
              {optionsFrom(PREGNANCY_STATUS_LABELS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Dam" htmlFor="damId">
            <Select id="damId" name="damId" defaultValue={filters.damId ?? ""}>
              <option value="">All dams</option>
              {dams.map((dam) => (
                <option key={dam.id} value={dam.id}>
                  {dam.tagNumber}
                  {dam.name ? ` — ${dam.name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sire" htmlFor="sireId">
            <Select id="sireId" name="sireId" defaultValue={filters.sireId ?? ""}>
              <option value="">All sires</option>
              {sires.map((sire) => (
                <option key={sire.id} value={sire.id}>
                  {sire.tagNumber}
                  {sire.name ? ` — ${sire.name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Bred from" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={toDateInputValue(filters.from)} />
          </Field>

          <Field label="Bred to" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={toDateInputValue(filters.to)} />
          </Field>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Apply filters
            </button>
            {hasFilters ? (
              <Link
                href="/breeding"
                className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Clear
              </Link>
            ) : null}
            <span className="ml-auto text-sm text-zinc-500 dark:text-zinc-400">
              {records.length} record{records.length === 1 ? "" : "s"}
            </span>
          </div>
        </form>
      </Card>

      {records.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No breeding records match these filters" : "No breeding records yet"}
          description={
            hasFilters
              ? "Try widening the date range or clearing the status filter."
              : "Record a mating to start tracking pregnancies, farrowings and litters."
          }
          action={<ButtonLink href="/breeding/new">Record mating</ButtonLink>}
        />
      ) : (
        <Card className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Dam</Th>
                <Th>Sire</Th>
                <Th>Bred</Th>
                <Th>Method</Th>
                <Th>Expected farrowing</Th>
                <Th>Days to go</Th>
                <Th>Status</Th>
                <Th>Litter outcome</Th>
                <Th className="sr-only">Open</Th>
              </Tr>
            </Thead>
            <Tbody>
              {records.map((record) => (
                <Tr
                  key={record.id}
                  className={dueRowClasses({
                    expectedFarrowingDate: record.expectedFarrowingDate,
                    status: record.pregnancyStatus,
                    toleranceDays: settings.gestationToleranceDays,
                  })}
                >
                  <Td className="whitespace-nowrap font-medium">
                    <Link href={`/animals/${record.dam.id}`} className="hover:underline">
                      {record.dam.tagNumber}
                    </Link>
                    {record.dam.name ? (
                      <span className="block text-xs font-normal text-zinc-500">
                        {record.dam.name}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Link href={`/animals/${record.sire.id}`} className="hover:underline">
                      {record.sire.tagNumber}
                    </Link>
                    {record.offspringInbreedingCoefficient !== null ? (
                      <span className="block text-xs text-zinc-500">
                        F {formatPercent(record.offspringInbreedingCoefficient)}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(record.breedingDate)}</Td>
                  <Td className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {BREEDING_METHOD_LABELS[record.method]}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(record.expectedFarrowingDate)}</Td>
                  <Td className="whitespace-nowrap">
                    <DueCountdown
                      expectedFarrowingDate={record.expectedFarrowingDate}
                      status={record.pregnancyStatus}
                      toleranceDays={settings.gestationToleranceDays}
                    />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <PregnancyStatusBadge status={record.pregnancyStatus} />
                  </Td>
                  <Td className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {record.litter ? (
                      <>
                        {record.litter.bornAlive} born alive
                        {record.litter.stillborn + record.litter.mummified > 0
                          ? `, ${record.litter.stillborn + record.litter.mummified} lost`
                          : ""}
                        {record.litter.weanedCount !== null ? (
                          <span className="block text-xs">
                            {record.litter.weanedCount} weaned{" "}
                            {formatDate(record.litter.weaningDate)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <Link
                      href={`/breeding/${record.id}`}
                      className="text-sm font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                    >
                      Open
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
