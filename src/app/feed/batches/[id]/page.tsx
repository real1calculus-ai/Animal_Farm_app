import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { writeOffBatch } from "@/app/feed/actions";
import { ADMIN_ROLES, requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatKg } from "@/lib/format";
import { FEED_CLASSIFICATION_LABELS } from "@/lib/labels";
import { getBatchDetail } from "@/lib/db/feed";
import { isExpired } from "@/lib/feed/allocation";

/**
 * One batch, and everything that ate from it.
 *
 * This screen is the recall requirement (§3.3) made concrete. When a supplier
 * reports a contaminated lot, the question is "which animals are affected",
 * and it has to be answerable in a minute from a phone — not reconstructed
 * from delivery notes. The pens and animals below are that answer.
 */
export default async function FeedBatchDetailPage({ params }: PageProps<"/feed/batches/[id]">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const { id } = await params;

  const batch = await getBatchDetail(farmId, id);
  if (!batch) notFound();

  const canManage = ADMIN_ROLES.includes(user.role);
  const expired = isExpired(batch);
  const consumedKg = batch.quantityKg - batch.remainingKg;

  // The distinct pens and animals this lot reached — the recall list.
  const pens = new Map<string, { name: string; kg: number; lastFedAt: Date }>();
  const pigs = new Map<
    string,
    { tagNumber: string; name: string | null; status: string; kg: number; lastFedAt: Date }
  >();

  for (const record of batch.feedingRecords) {
    if (record.pen) {
      const row = pens.get(record.pen.id) ?? {
        name: record.pen.name,
        kg: 0,
        lastFedAt: record.fedAt,
      };
      row.kg += record.consumedKg ?? record.allocatedKg;
      if (record.fedAt > row.lastFedAt) row.lastFedAt = record.fedAt;
      pens.set(record.pen.id, row);
    }
    if (record.pig) {
      const row = pigs.get(record.pig.id) ?? {
        tagNumber: record.pig.tagNumber,
        name: record.pig.name,
        status: record.pig.status,
        kg: 0,
        lastFedAt: record.fedAt,
      };
      row.kg += record.consumedKg ?? record.allocatedKg;
      if (record.fedAt > row.lastFedAt) row.lastFedAt = record.fedAt;
      pigs.set(record.pig.id, row);
    }
  }

  return (
    <div>
      <PageHeader
        title={`Batch ${batch.batchCode}`}
        description={`${batch.feedType.name} · ${FEED_CLASSIFICATION_LABELS[batch.feedType.classification]}`}
        actions={
          canManage && batch.remainingKg > 0 ? (
            <form action={writeOffBatch}>
              <input type="hidden" name="id" value={batch.id} />
              <SubmitButton variant="secondary" pendingLabel="Writing off…">
                Write off remaining
              </SubmitButton>
            </form>
          ) : undefined
        }
      />

      <FeedSubnav active="/feed/batches" role={user.role} />

      {expired && batch.remainingKg > 0 ? (
        <Card className="mb-6 border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-900 dark:text-red-300">
            This batch expired on {formatDate(batch.expirationDate)} and still holds{" "}
            {formatKg(batch.remainingKg)}. It cannot be allocated to animals — write it off so the
            stock figures reflect what is actually feedable.
          </p>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Remaining"
          value={formatKg(batch.remainingKg)}
          hint={`of ${formatKg(batch.quantityKg, 0)} delivered`}
        />
        <StatTile label="Fed out" value={formatKg(consumedKg)} />
        <StatTile
          label="Delivery cost"
          value={formatCents(Math.round(batch.quantityKg * batch.costPerKgCents))}
          hint={`${formatCents(batch.costPerKgCents)}/kg`}
        />
        <StatTile
          label="Value remaining"
          value={formatCents(Math.round(batch.remainingKg * batch.costPerKgCents))}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delivery</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">Supplier</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              {batch.supplier ? (
                <Link
                  href={`/feed/suppliers/${batch.supplier.id}`}
                  className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                >
                  {batch.supplier.name}
                </Link>
              ) : (
                "—"
              )}
            </dd>

            <dt className="text-zinc-500 dark:text-zinc-400">Supplier lot</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              {batch.supplierLotNumber ?? "—"}
            </dd>

            <dt className="text-zinc-500 dark:text-zinc-400">Received</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{formatDate(batch.receivedDate)}</dd>

            <dt className="text-zinc-500 dark:text-zinc-400">Expires</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              {formatDate(batch.expirationDate)}
              {expired ? (
                <Badge variant="danger" className="ml-2">
                  Expired
                </Badge>
              ) : null}
            </dd>

            <dt className="text-zinc-500 dark:text-zinc-400">Stored in</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              {batch.storageLocation?.name ?? "Unassigned"}
            </dd>

            <dt className="text-zinc-500 dark:text-zinc-400">Received by</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{batch.receivedBy?.name ?? "—"}</dd>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Analysis & quality
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Nutritional analysis</dt>
              <dd className="whitespace-pre-line text-zinc-900 dark:text-zinc-100">
                {batch.nutritionalAnalysis ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Quality notes</dt>
              <dd className="whitespace-pre-line text-zinc-900 dark:text-zinc-100">
                {batch.qualityNotes ?? "None"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Who ate this batch
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          If this lot is recalled, these are the animals to check.
        </p>

        {pens.size === 0 && pigs.size === 0 ? (
          <EmptyState
            title="Nothing has been fed from this batch yet"
            description="It will appear here as soon as a feeding record draws from it."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {pens.size > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Pens ({pens.size})
                </h3>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Pen</Th>
                      <Th className="text-right">Fed</Th>
                      <Th>Last fed</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {[...pens.entries()].map(([penId, row]) => (
                      <Tr key={penId}>
                        <Td>
                          <Link
                            href={`/pens/${penId}`}
                            className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                          >
                            {row.name}
                          </Link>
                        </Td>
                        <Td className="text-right tabular-nums">{formatKg(row.kg)}</Td>
                        <Td>{formatDate(row.lastFedAt)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            ) : null}

            {pigs.size > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Individual animals ({pigs.size})
                </h3>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Animal</Th>
                      <Th className="text-right">Fed</Th>
                      <Th>Last fed</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {[...pigs.entries()].map(([pigId, row]) => (
                      <Tr key={pigId}>
                        <Td>
                          <Link
                            href={`/animals/${pigId}`}
                            className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                          >
                            {row.tagNumber}
                            {row.name ? ` — ${row.name}` : ""}
                          </Link>
                          {row.status !== "ACTIVE" ? (
                            <Badge className="ml-2">{row.status}</Badge>
                          ) : null}
                        </Td>
                        <Td className="text-right tabular-nums">{formatKg(row.kg)}</Td>
                        <Td>{formatDate(row.lastFedAt)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Feeding records from this batch ({batch.feedingRecords.length})
        </h2>
        {batch.feedingRecords.length === 0 ? (
          <EmptyState title="No feeding recorded yet" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Fed to</Th>
                <Th className="text-right">Animals</Th>
                <Th className="text-right">Allocated</Th>
                <Th className="text-right">Consumed</Th>
                <Th>Recorded by</Th>
              </Tr>
            </Thead>
            <Tbody>
              {batch.feedingRecords.map((record) => (
                <Tr key={record.id}>
                  <Td>{formatDate(record.fedAt)}</Td>
                  <Td>
                    {record.pen?.name ??
                      (record.pig
                        ? `${record.pig.tagNumber}${record.pig.name ? ` — ${record.pig.name}` : ""}`
                        : "—")}
                  </Td>
                  <Td className="text-right tabular-nums">{record.animalCount}</Td>
                  <Td className="text-right tabular-nums">{formatKg(record.allocatedKg)}</Td>
                  <Td className="text-right tabular-nums">
                    {record.consumedKg === null ? "—" : formatKg(record.consumedKg)}
                  </Td>
                  <Td>{record.recordedBy?.name ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
