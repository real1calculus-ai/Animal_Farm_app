import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { ShowMoreTableBody } from "@/components/ui/show-more-table-body";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { FeedingRecordForm } from "@/components/feed/feeding-record-form";
import { BulkFeedingForm } from "@/components/feed/bulk-feeding-form";
import { firstParam } from "@/components/feed/search-params";
import { deleteFeedingRecord, recordBulkFeeding, recordFeeding } from "@/app/feed/records/actions";
import { ADMIN_ROLES, requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { addDays, formatCents, formatDate, formatKg, toDateInputValue } from "@/lib/format";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import {
  getFeedStockLevels,
  getPensWithHerd,
  listFeedingPrograms,
  listFeedingRecords,
} from "@/lib/db/feed";
import { summariseRequirement, type RationProgram } from "@/lib/feed/ration";
import { wastageKg } from "@/lib/feed/allocation";

/**
 * The daily feeding log.
 *
 * Bulk entry sits first on the page, not the single-record form. Twenty pens
 * through a one-at-a-time form does not get done, and a missing feeding record
 * is not a neutral gap — every FCR, cost-per-kg-of-gain and intake trend in
 * this module is computed from these rows, and all of them read better than
 * reality when the rows are absent.
 */
export default async function FeedingRecordsPage({ searchParams }: PageProps<"/feed/records">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const params = await searchParams;

  const savedCount = firstParam(params.recorded);
  const saved = firstParam(params.saved) !== null || savedCount !== null;
  const warning = firstParam(params.warn);
  const failed = firstParam(params.failed);

  const canManage = ADMIN_ROLES.includes(user.role);

  const [levels, pens, programs, records] = await Promise.all([
    getFeedStockLevels(farmId),
    getPensWithHerd(farmId),
    listFeedingPrograms(farmId, { activeOnly: true }),
    listFeedingRecords(farmId, { take: 60 }),
  ]);

  const rationPrograms: RationProgram[] = programs.map((program) => ({
    id: program.id,
    name: program.name,
    stage: program.stage,
    feedTypeId: program.feedTypeId,
    feedTypeName: program.feedType.name,
    dailyKgPerAnimal: program.dailyKgPerAnimal,
    ageDaysMin: program.ageDaysMin,
    ageDaysMax: program.ageDaysMax,
    pctOfBodyweight: program.pctOfBodyweight,
    costPerKgCents: program.feedType.costPerKgCents,
  }));

  const activeLevels = levels.filter((level) => level.isActive);

  const feedTypeOptions = activeLevels.map((level) => ({
    id: level.feedTypeId,
    name: level.name,
    classification: level.classification,
    usableKg: level.usableKg,
    batches: level.batches
      .filter((batch) => batch.remainingKg > 0)
      .map((batch) => ({
        id: batch.id,
        batchCode: batch.batchCode,
        remainingKg: batch.remainingKg,
        expiresOn: batch.expirationDate ? toDateInputValue(batch.expirationDate) : null,
        expired: batch.expired,
      })),
  }));

  /** One programme-derived ration per pen, shared by both forms. */
  const penRations = pens.map((pen) => {
    const requirement = summariseRequirement(rationPrograms, pen.animals);
    const top = requirement.byFeedType[0] ?? null;
    return {
      pen,
      feedTypeId: top?.feedTypeId ?? null,
      rationKg: top?.dailyKg ?? null,
      uncovered: requirement.uncovered.length,
    };
  });

  const pigOptions = pens
    .flatMap((pen) => pen.animals)
    .map((animal) => ({
      id: animal.id,
      tagNumber: animal.tagNumber,
      name: animal.name,
      stage: animal.stage,
      penName: animal.penName,
    }));

  const since = addDays(new Date(), -7);
  const lastWeek = records.filter((record) => record.fedAt >= since);
  const weekKg = lastWeek.reduce(
    (sum, record) => sum + (record.consumedKg ?? record.allocatedKg),
    0
  );
  const weekCostCents = lastWeek.reduce(
    (sum, record) =>
      sum + Math.round((record.consumedKg ?? record.allocatedKg) * (record.costPerKgCents ?? 0)),
    0
  );

  const recordRows = records.map((record) => {
    const waste = wastageKg(record.allocatedKg, record.consumedKg);
    return (
      <Tr key={record.id}>
        <Td className="whitespace-nowrap">{formatDate(record.fedAt)}</Td>
        <Td>
          {record.pen ? (
            <Link
              href={`/pens/${record.pen.id}`}
              className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
            >
              {record.pen.name}
            </Link>
          ) : record.pig ? (
            <Link
              href={`/animals/${record.pig.id}`}
              className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
            >
              {record.pig.tagNumber}
              {record.pig.name ? ` — ${record.pig.name}` : ""}
            </Link>
          ) : (
            "—"
          )}
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            {record.animalCount} {record.animalCount === 1 ? "animal" : "animals"}
          </span>
        </Td>
        <Td>
          {record.feedType.name}
          {record.feedBatch ? (
            <Link
              href={`/feed/batches/${record.feedBatch.id}`}
              className="block text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 dark:text-zinc-400 dark:decoration-zinc-700"
            >
              {record.feedBatch.batchCode}
            </Link>
          ) : null}
        </Td>
        <Td className="text-right tabular-nums">{formatKg(record.allocatedKg)}</Td>
        <Td className="text-right tabular-nums">
          {record.consumedKg === null ? (
            <span className="text-zinc-400 dark:text-zinc-500">—</span>
          ) : (
            formatKg(record.consumedKg)
          )}
          {waste !== null && waste > 0 ? (
            <Badge variant="warning" className="ml-2">
              {formatKg(waste)} left
            </Badge>
          ) : null}
        </Td>
        <Td className="text-right tabular-nums">
          {record.costPerKgCents === null
            ? "—"
            : formatCents(
                Math.round((record.consumedKg ?? record.allocatedKg) * record.costPerKgCents)
              )}
        </Td>
        <Td className="text-right">
          {canManage ? (
            <form action={deleteFeedingRecord}>
              <input type="hidden" name="id" value={record.id} />
              <SubmitButton variant="secondary" pendingLabel="…">
                Delete
              </SubmitButton>
            </form>
          ) : (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {record.recordedBy?.name ?? "—"}
            </span>
          )}
        </Td>
      </Tr>
    );
  });

  return (
    <div>
      <PageHeader
        title="Feeding log"
        description="What went in the trough, and what got eaten. Stock is drawn down oldest batch first."
      />

      <FeedSubnav active="/feed/records" role={user.role} />

      {saved ? (
        <Card className="mb-4 border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-300">
            {savedCount !== null
              ? `Recorded feeding for ${savedCount} ${savedCount === "1" ? "pen" : "pens"}.`
              : "Feeding recorded."}
          </p>
        </Card>
      ) : null}

      {failed ? (
        <Card className="mb-4 border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <p className="mb-1 text-sm font-medium text-red-900 dark:text-red-300">
            Some pens were skipped
          </p>
          <p className="text-sm text-red-800 dark:text-red-400">{failed}</p>
        </Card>
      ) : null}

      {warning ? (
        <Card className="mb-4 border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="mb-1 text-sm font-medium text-amber-900 dark:text-amber-300">
            Feed / stage mismatch
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-400">{warning}</p>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Fed in the last 7 days"
          value={formatKg(weekKg, 0)}
          hint={`${lastWeek.length} records`}
        />
        <StatTile label="Feed cost, last 7 days" value={formatCents(weekCostCents)} />
        <StatTile
          label="Pens with a programme"
          value={`${penRations.filter((row) => row.feedTypeId !== null).length} of ${pens.length}`}
          hint="Pre-filled in bulk entry below"
        />
      </div>

      <Card className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Feed all pens their programme ration
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Quantities come from the active feeding programmes for each pen&apos;s animals. Adjust any
          row before saving; pens without a programme need a feed picking by hand.
        </p>

        {pens.length === 0 ? (
          <EmptyState
            title="No pens set up"
            description="Bulk feeding records against pens. Add pens and assign animals to them first."
            action={
              <Link
                href="/pens"
                className="text-sm font-medium underline underline-offset-2 dark:text-zinc-200"
              >
                Go to pens
              </Link>
            }
          />
        ) : (
          <BulkFeedingForm
            action={recordBulkFeeding}
            pens={penRations.map((row) => ({
              penId: row.pen.penId,
              penName: row.pen.penName,
              animalCount: row.pen.animals.length,
              stageLabel: row.pen.dominantStage
                ? LIFE_STAGE_LABELS[row.pen.dominantStage]
                : "Empty",
              feedTypeId: row.feedTypeId,
              rationKg: row.rationKg,
              reason:
                row.pen.animals.length === 0
                  ? "No animals"
                  : row.feedTypeId === null
                    ? "No programme covers this pen"
                    : row.uncovered > 0
                      ? `${row.uncovered} animal(s) not covered by a programme`
                      : null,
            }))}
            feedTypes={activeLevels.map((level) => ({
              id: level.feedTypeId,
              name: level.name,
              usableKg: level.usableKg,
            }))}
          />
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Record one feeding
        </h2>
        {activeLevels.length === 0 ? (
          <EmptyState
            title="No feed types available"
            description="Add a feed type and record a delivery before logging feeding."
          />
        ) : (
          <FeedingRecordForm
            action={recordFeeding}
            feedTypes={feedTypeOptions}
            pens={penRations.map((row) => ({
              id: row.pen.penId,
              name: row.pen.penName,
              animalCount: row.pen.animals.length,
              stageCounts: Object.fromEntries(row.pen.stageCounts),
              suggestion:
                row.feedTypeId !== null && row.rationKg !== null
                  ? { feedTypeId: row.feedTypeId, kg: row.rationKg }
                  : null,
            }))}
            pigs={pigOptions}
          />
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Recent feeding
        </h2>
        {records.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Feeding records are what feed conversion, cost per kg of gain and the intake-drop alert are all computed from."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Fed to</Th>
                <Th>Feed</Th>
                <Th className="text-right">Allocated</Th>
                <Th className="text-right">Consumed</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">{canManage ? "Actions" : "By"}</Th>
              </Tr>
            </Thead>
            <ShowMoreTableBody rows={recordRows} colSpan={7} initialCount={10} />
          </Table>
        )}
      </Card>
    </div>
  );
}
