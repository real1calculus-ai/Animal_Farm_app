import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { requireUser, ADMIN_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { getBatchSummary, listBatches } from "@/lib/db/batches";
import { BATCH_STATUS_LABELS } from "@/lib/labels";
import { formatDate, formatKg, formatPercent } from "@/lib/format";

export default async function BatchesPage() {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const canManage = ADMIN_ROLES.includes(user.role);

  const [batches, summary] = await Promise.all([listBatches(farmId), getBatchSummary(farmId)]);

  return (
    <>
      <PageHeader
        title="Batches"
        description="Animals counted as a group — poultry, fish and snails."
        actions={canManage ? <ButtonLink href="/batches/new">New batch</ButtonLink> : undefined}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active batches" value={String(summary.activeBatches)} />
        <StatTile label="Animals in batches" value={summary.totalAnimals.toLocaleString()} />
        <StatTile
          label="Counts needing review"
          value={String(summary.driftingBatches)}
          hint={
            summary.driftingBatches > 0
              ? "Stored count disagrees with the event log"
              : "All counts match their logs"
          }
        />
      </div>

      {batches.length === 0 ? (
        <EmptyState
          title="No batches yet"
          description="A batch is a group stocked, fed and sold together. Nobody names 500 broilers — you track the flock, its mortality and what it eats."
          action={canManage ? <ButtonLink href="/batches/new">Create the first batch</ButtonLink> : undefined}
        />
      ) : (
        <Card className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Batch</Th>
                <Th>Species</Th>
                <Th>Pen</Th>
                <Th className="text-right">Alive</Th>
                <Th className="text-right">Losses</Th>
                <Th className="text-right">Age</Th>
                <Th className="text-right">Avg weight</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {batches.map((batch) => {
                const lost = batch.initialCount - batch.currentCount;
                const lossRate = batch.initialCount > 0 ? lost / batch.initialCount : null;
                return (
                  <Tr key={batch.id}>
                    <Td>
                      <Link href={`/batches/${batch.id}`} className="font-medium underline underline-offset-2">
                        {batch.name}
                      </Link>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {batch.batchCode} · stocked {formatDate(batch.startDate)}
                      </span>
                    </Td>
                    <Td>{batch.species.name}</Td>
                    <Td>{batch.pen?.name ?? "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {batch.currentCount.toLocaleString()}
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        of {batch.initialCount.toLocaleString()}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {lost > 0 ? (
                        <span className={lossRate !== null && lossRate > 0.1 ? "text-red-700 dark:text-red-400" : ""}>
                          {lost}
                          <span className="block text-xs">{formatPercent(lossRate, 1)}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{batch.ageDays} d</Td>
                    <Td className="text-right tabular-nums">{formatKg(batch.avgWeightKg, 2)}</Td>
                    <Td>
                      <Badge variant={batch.status === "ACTIVE" ? "success" : "default"}>
                        {BATCH_STATUS_LABELS[batch.status]}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
