import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { PenForm } from "@/components/pens/pen-form";
import { createPen } from "@/app/pens/actions";
import { requireUser, ADMIN_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listPenOccupancy, getPenSummary } from "@/lib/db/pens";
import { HOUSING_TYPE_LABELS } from "@/lib/labels";
import { formatDate, formatPercent } from "@/lib/format";

export default async function PensPage() {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const canManage = ADMIN_ROLES.includes(user.role);

  const [pens, summary] = await Promise.all([
    listPenOccupancy(farmId, { includeInactive: canManage }),
    getPenSummary(farmId),
  ]);

  return (
    <>
      <PageHeader
        title="Pens"
        description="Occupancy, capacity and the cleaning record for each pen."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Pens" value={String(summary.penCount)} />
        <StatTile
          label="Occupancy"
          value={`${summary.totalOccupancy} / ${summary.totalCapacity}`}
          hint={summary.utilisation === null ? undefined : `${formatPercent(summary.utilisation, 0)} full`}
        />
        <StatTile
          label="Over capacity"
          value={String(summary.overCapacityCount)}
          hint={summary.overCapacityCount > 0 ? "Move animals out" : "All within capacity"}
        />
        <StatTile
          label="Cleaning overdue"
          value={String(summary.biosecurityOverdueCount)}
          hint="Cleaning or disinfection past due"
        />
      </div>

      {pens.length === 0 ? (
        <EmptyState
          title="No pens yet"
          description="Animals can be recorded without a pen, but occupancy, capacity limits and the biosecurity cleaning record all depend on having them set up."
        />
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Pen</Th>
                <Th>Type</Th>
                <Th className="text-right">Occupancy</Th>
                <Th>Last cleaned</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pens.map((pen) => (
                <Tr key={pen.id}>
                  <Td>
                    <Link href={`/pens/${pen.id}`} className="font-medium underline underline-offset-2">
                      {pen.name}
                    </Link>
                    {pen.location ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">{pen.location}</span>
                    ) : null}
                  </Td>
                  <Td>{HOUSING_TYPE_LABELS[pen.housingType]}</Td>
                  <Td className="text-right tabular-nums">
                    {pen.occupancy} / {pen.capacity}
                  </Td>
                  <Td>{pen.lastCleanedAt ? formatDate(pen.lastCleanedAt) : "Never"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {pen.isOverCapacity ? (
                        <Badge variant="danger">Over by {pen.overCapacityBy}</Badge>
                      ) : null}
                      {pen.neverCleaned ? (
                        <Badge variant="warning">Never cleaned</Badge>
                      ) : pen.biosecurityOverdue ? (
                        <Badge variant="warning">Cleaning overdue</Badge>
                      ) : null}
                      {!pen.isActive ? <Badge>Retired</Badge> : null}
                      {pen.isActive && !pen.isOverCapacity && !pen.biosecurityOverdue && !pen.neverCleaned ? (
                        <Badge variant="success">OK</Badge>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {canManage ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-medium text-zinc-900 dark:text-zinc-100">
              Add a pen
            </summary>
            <div className="mt-4">
              <PenForm action={createPen} submitLabel="Create pen" idPrefix="new-pen" />
            </div>
          </details>
        </Card>
      ) : null}
    </>
  );
}
