import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { BatchEventForm } from "@/components/batches/event-form";
import { BatchProductionForm } from "@/components/batches/production-form";
import {
  recordBatchEvent,
  recordBatchProduction,
  reconcileBatchCount,
} from "@/app/batches/actions";
import { requireUser, ADMIN_ROLES, WRITE_ROLES, canSeeFinancials } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { getBatch } from "@/lib/db/batches";
import {
  BATCH_EVENT_TYPE_LABELS,
  BATCH_PRODUCTION_TYPE_LABELS,
  BATCH_STATUS_LABELS,
} from "@/lib/labels";
import { formatCents, formatDate, formatKg, formatPercent } from "@/lib/format";

export default async function BatchDetailPage({ params }: PageProps<"/batches/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);

  const batch = await getBatch(farmId, id);
  if (!batch) notFound();

  const canRecord = WRITE_ROLES.includes(user.role);
  const canManage = ADMIN_ROLES.includes(user.role);
  const showMoney = canSeeFinancials(user.role);

  const recordEvent = recordBatchEvent.bind(null, id);
  const recordProduction = recordBatchProduction.bind(null, id);
  const reconcileCount = reconcileBatchCount.bind(null, id);

  const { metrics } = batch;
  const laying = metrics.layRate !== null;

  return (
    <>
      <PageHeader
        title={batch.name}
        description={`${batch.species.name} · ${batch.batchCode} · stocked ${formatDate(batch.startDate)}${
          batch.pen ? ` · ${batch.pen.name}` : ""
        }`}
        actions={
          <Link href="/batches" className="text-sm underline underline-offset-2">
            All batches
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant={batch.status === "ACTIVE" ? "success" : "default"}>
          {BATCH_STATUS_LABELS[batch.status]}
        </Badge>
        <Badge>{batch.ageDays} days old</Badge>
        <Badge>{batch.daysOnFarm} days on farm</Badge>
      </div>

      {/*
        Drift means a write once landed half-applied. Surfaced rather than
        silently corrected: the cached count is what every screen reads, and
        quietly rebuilding it would erase the only evidence anything went wrong.
      */}
      {!metrics.reconciliation.agrees ? (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>The stored count and the event log disagree.</strong> The batch record says{" "}
            {metrics.reconciliation.stored}, the log adds up to {metrics.reconciliation.derived} — a
            difference of {Math.abs(metrics.reconciliation.drift)}. The log is the authority.
          </p>
          {canManage ? (
            <form action={reconcileCount} className="mt-3">
              <Button type="submit" variant="secondary">
                Rebuild the count from the log
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Alive"
          value={batch.currentCount.toLocaleString()}
          hint={`of ${batch.initialCount.toLocaleString()} stocked`}
        />
        <StatTile
          label="Mortality"
          value={formatPercent(metrics.mortality.mortalityRate, 1)}
          hint={`${metrics.mortality.died} died, ${metrics.mortality.culled} culled${
            metrics.mortality.firstWeekDeaths > 0
              ? ` · ${metrics.mortality.firstWeekDeaths} in week one`
              : ""
          }`}
        />
        <StatTile
          label="Average weight"
          value={formatKg(batch.avgWeightKg, 2)}
          hint={batch.avgWeightKg === null ? "Record a weight sample" : "From the latest sample"}
        />
        <StatTile
          label={laying ? "Lay rate" : "Feed conversion"}
          value={
            laying
              ? formatPercent(metrics.layRate, 1)
              : metrics.fcr === null
                ? "—"
                : metrics.fcr.toFixed(2)
          }
          hint={laying ? "Eggs per bird per day" : "kg feed per kg gain"}
        />
      </div>

      {showMoney ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatTile label="Feed used" value={formatKg(metrics.feedKg, 0)} />
          <StatTile label="Feed cost" value={formatCents(metrics.feedCostCents)} />
          <StatTile
            label="Cost per kg gain"
            value={metrics.costPerKgCents === null ? "—" : formatCents(metrics.costPerKgCents)}
            hint={`${formatKg(metrics.gainKg, 0)} of gain`}
          />
        </div>
      ) : null}

      {/*
        Feed eaten by animals that later died is still charged against the
        batch, which is why heavy losses show a worse conversion than the
        survivors alone would suggest. That is the honest number.
      */}
      {metrics.mortality.firstWeekDeaths > 0 &&
      metrics.mortality.died > 0 &&
      metrics.mortality.firstWeekDeaths / metrics.mortality.died > 0.5 ? (
        <Card className="mb-6">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Most of this batch&apos;s losses ({metrics.mortality.firstWeekDeaths} of{" "}
            {metrics.mortality.died}) happened in the first week. Early mortality usually points at
            the stock or the brooding conditions rather than at anything later.
          </p>
        </Card>
      ) : null}

      {canRecord && batch.status === "ACTIVE" ? (
        <>
          <h2 className="mb-3 text-lg font-medium">Record an event</h2>
          <Card className="mb-6">
            <BatchEventForm action={recordEvent} currentCount={batch.currentCount} />
          </Card>

          <h2 className="mb-3 text-lg font-medium">Record production</h2>
          <Card className="mb-6">
            <BatchProductionForm action={recordProduction} />
          </Card>
        </>
      ) : null}

      <h2 className="mb-3 text-lg font-medium">Event log</h2>
      {batch.events.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="Nothing recorded yet" />
        </div>
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Event</Th>
                <Th className="text-right">Count</Th>
                <Th className="text-right">Weight</Th>
                <Th>Reason</Th>
                <Th>By</Th>
              </Tr>
            </Thead>
            <Tbody>
              {batch.events.map((event) => (
                <Tr key={event.id}>
                  <Td className="whitespace-nowrap">{formatDate(event.occurredAt)}</Td>
                  <Td>
                    <Badge
                      variant={
                        event.eventType === "MORTALITY"
                          ? "danger"
                          : event.eventType === "CULL"
                            ? "warning"
                            : "default"
                      }
                    >
                      {BATCH_EVENT_TYPE_LABELS[event.eventType]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{event.quantity || "—"}</Td>
                  <Td className="text-right tabular-nums">{formatKg(event.weightKg, 3)}</Td>
                  <Td className="text-zinc-600 dark:text-zinc-400">{event.reason ?? "—"}</Td>
                  <Td className="text-zinc-500 dark:text-zinc-400">{event.createdBy?.name ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {batch.production.length > 0 ? (
        <>
          <h2 className="mb-3 text-lg font-medium">Production</h2>
          <Card className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Product</Th>
                  <Th className="text-right">Collected</Th>
                  <Th className="text-right">Unsellable</Th>
                  <Th className="text-right">Per bird</Th>
                </Tr>
              </Thead>
              <Tbody>
                {batch.production.map((record) => (
                  <Tr key={record.id}>
                    <Td className="whitespace-nowrap">{formatDate(record.collectedAt)}</Td>
                    <Td>{BATCH_PRODUCTION_TYPE_LABELS[record.productionType]}</Td>
                    <Td className="text-right tabular-nums">{record.quantity.toLocaleString()}</Td>
                    <Td className="text-right tabular-nums">
                      {record.rejectedQuantity > 0 ? record.rejectedQuantity.toLocaleString() : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {batch.currentCount > 0
                        ? (record.quantity / batch.currentCount).toFixed(2)
                        : "—"}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </>
      ) : null}
    </>
  );
}
