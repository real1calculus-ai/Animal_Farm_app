import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { AnimalSelect } from "@/components/breeding/animal-select";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { formatDate, toDateInputValue } from "@/lib/format";
import {
  getEstrusWatchlist,
  listBreedingCandidates,
  listEstrusRecords,
  type EstrusRecordRow,
} from "@/lib/db/breeding";
import { recordEstrusObservation } from "@/app/breeding/actions";

/**
 * Heat detection log (§2.5).
 *
 * The list of observations is the easy half. The half that earns the screen is
 * the watchlist: a sow who has quietly stopped cycling shows up as an empty
 * column and a growing day count, and catching that early is the difference
 * between one barren sow and a season of empty farrowing crates.
 */
export default async function EstrusPage() {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const [females, records, watchlist] = await Promise.all([
    listBreedingCandidates(farmId, "FEMALE"),
    listEstrusRecords(farmId, 50),
    getEstrusWatchlist(farmId, settings),
  ]);

  const today = new Date();
  const notCycling = watchlist.filter((row) => row.notCycling);
  const neverObserved = watchlist.filter((row) => !row.pregnant && row.lastObservedAt === null);
  const dueThisWeek = watchlist.filter(
    (row) =>
      !row.pregnant &&
      row.predictedNextHeat !== null &&
      row.predictedNextHeat >= today &&
      row.predictedNextHeat <= new Date(today.getTime() + 7 * 86_400_000)
  );

  // Not-cycling first, then the longest-unseen: the top of this table is
  // always the animal most in need of a look.
  const sortedWatchlist = [...watchlist].sort((a, b) => {
    if (a.notCycling !== b.notCycling) return a.notCycling ? -1 : 1;
    return (b.daysSinceObserved ?? Number.MAX_SAFE_INTEGER) - (a.daysSinceObserved ?? Number.MAX_SAFE_INTEGER);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Heat detection log"
        description={`Estrus cycle on this farm is ${settings.estrusCycleDays} days — the next heat is predicted that far after the last observation.`}
        actions={
          <>
            <ButtonLink href="/breeding" variant="secondary">
              Breeding records
            </ButtonLink>
            <ButtonLink href="/breeding/match-finder">Match finder</ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Females tracked" value={String(watchlist.length)} hint="Active, of breeding age" />
        <StatTile
          label="Heat due in 7 days"
          value={String(dueThisWeek.length)}
          hint="Watch these twice daily"
        />
        <StatTile
          label="Possibly not cycling"
          value={String(notCycling.length)}
          hint={`Unseen for over ${Math.round(settings.estrusCycleDays * 1.5)} days`}
        />
        <StatTile
          label="Never observed"
          value={String(neverObserved.length)}
          hint="No heat recorded at all"
        />
      </div>

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Record an observation
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Standing heat is the one to catch — a sow that stands for the back-pressure test is
            ready to serve.
          </p>
        </div>

        <form action={recordEstrusObservation} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Breeding female" required>
              <AnimalSelect name="sowId" animals={females} placeholder="Select a female" required />
            </Field>

            <div className="space-y-4">
              <Field label="Observed on" htmlFor="observedAt" required>
                <Input
                  id="observedAt"
                  name="observedAt"
                  type="date"
                  required
                  max={toDateInputValue(today)}
                  defaultValue={toDateInputValue(today)}
                />
              </Field>

              <Field label="Duration (hours)" htmlFor="durationHours" hint="Standing heat usually lasts 24–72 hours">
                <Input
                  id="durationHours"
                  name="durationHours"
                  type="number"
                  min={0}
                  max={120}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Behavioural signs
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SignCheckbox name="signRestlessness" label="Restlessness" />
              <SignCheckbox name="signSwollenVulva" label="Swollen vulva" />
              <SignCheckbox name="signDischarge" label="Discharge" />
              <SignCheckbox name="signReceptive" label="Receptive / stands for pressure" />
            </div>
          </fieldset>

          <SignCheckbox name="wasBred" label="She was bred at this heat" />

          <Field label="Notes" htmlFor="estrus-notes">
            <Textarea id="estrus-notes" name="notes" rows={2} />
          </Field>

          <SubmitButton pendingLabel="Recording...">Record observation</SubmitButton>
        </form>
      </Card>

      <Card className="space-y-4 p-0">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Cycling status</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Every active breeding female, longest-unseen first. Pregnant sows are expected not to
            cycle and are not flagged.
          </p>
        </div>

        {sortedWatchlist.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="No breeding females yet"
              description="Females reach this list once they pass the farm's minimum breeding age."
            />
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Female</Th>
                <Th className="text-right">Parity</Th>
                <Th>Last observed heat</Th>
                <Th className="text-right">Days since</Th>
                <Th>Next heat predicted</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sortedWatchlist.map((row) => (
                <Tr
                  key={row.sowId}
                  className={row.notCycling ? "bg-red-50 dark:bg-red-950/30" : ""}
                >
                  <Td className="whitespace-nowrap font-medium">
                    <Link href={`/animals/${row.sowId}`} className="hover:underline">
                      {row.tagNumber}
                    </Link>
                    {row.name ? (
                      <span className="block text-xs font-normal text-zinc-500">{row.name}</span>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">{row.parity}</Td>
                  <Td className="whitespace-nowrap">
                    {row.lastObservedAt ? formatDate(row.lastObservedAt) : "Never recorded"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.daysSinceObserved === null ? "—" : row.daysSinceObserved}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {row.pregnant
                      ? "—"
                      : row.predictedNextHeat
                        ? formatDate(row.predictedNextHeat)
                        : "Unknown"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {row.pregnant ? (
                      <Badge variant="success">Carrying a litter</Badge>
                    ) : row.notCycling ? (
                      <Badge variant="danger">Not seen in heat — check her</Badge>
                    ) : row.lastObservedAt === null ? (
                      <Badge variant="warning">No heat recorded</Badge>
                    ) : (
                      <Badge>Cycling</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card className="space-y-4 p-0">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Recent observations
          </h2>
        </div>

        {records.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="No heat observations recorded"
              description="Log what you see in the shed — the prediction of the next heat is built from these."
            />
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Observed</Th>
                <Th>Female</Th>
                <Th>Signs</Th>
                <Th className="text-right">Duration</Th>
                <Th>Bred</Th>
                <Th>Recorded by</Th>
                <Th>Notes</Th>
              </Tr>
            </Thead>
            <Tbody>
              {records.map((record) => (
                <Tr key={record.id}>
                  <Td className="whitespace-nowrap">{formatDate(record.observedAt)}</Td>
                  <Td className="whitespace-nowrap font-medium">
                    <Link href={`/animals/${record.sow.id}`} className="hover:underline">
                      {record.sow.tagNumber}
                    </Link>
                  </Td>
                  <Td>
                    <SignList record={record} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {record.durationHours === null ? "—" : `${record.durationHours} h`}
                  </Td>
                  <Td>{record.wasBred ? <Badge variant="success">Bred</Badge> : "—"}</Td>
                  <Td className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {record.createdBy?.name ?? "—"}
                  </Td>
                  <Td className="text-zinc-600 dark:text-zinc-400">{record.notes ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SignCheckbox({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        name={name}
        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
      />
      {label}
    </label>
  );
}

function SignList({ record }: { record: EstrusRecordRow }) {
  const signs = [
    record.signRestlessness ? "Restless" : null,
    record.signSwollenVulva ? "Swollen vulva" : null,
    record.signDischarge ? "Discharge" : null,
    record.signReceptive ? "Receptive" : null,
  ].filter((sign): sign is string => sign !== null);

  if (signs.length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-500">None recorded</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {signs.map((sign) => (
        <Badge key={sign}>{sign}</Badge>
      ))}
    </span>
  );
}
