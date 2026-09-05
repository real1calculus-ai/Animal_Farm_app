import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { PenForm } from "@/components/pens/pen-form";
import { PenTaskForm } from "@/components/pens/pen-task-form";
import { recordPenTask, updatePen } from "@/app/pens/actions";
import { requireUser, ADMIN_ROLES, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  getPen,
  getPenOccupants,
  getPenMovementHistory,
  listPenTasks,
  listPenOccupancy,
} from "@/lib/db/pens";
import { HOUSING_TYPE_LABELS, PEN_TASK_TYPE_LABELS, SEX_LABELS } from "@/lib/labels";
import { formatAge, formatCents, formatDate, formatKg } from "@/lib/format";

export default async function PenDetailPage({ params }: PageProps<"/pens/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);

  const pen = await getPen(farmId, id);
  if (!pen) notFound();

  const canManage = ADMIN_ROLES.includes(user.role);
  const canRecord = WRITE_ROLES.includes(user.role);

  const [occupants, tasks, movements, occupancyRows] = await Promise.all([
    getPenOccupants(farmId, id),
    listPenTasks(id, 25),
    getPenMovementHistory(id, 25),
    listPenOccupancy(farmId, { includeInactive: true }),
  ]);

  const row = occupancyRows.find((candidate) => candidate.id === id);

  // Bound the action's first argument at the server, so the pen id is never
  // something the browser gets to choose on submit.
  const recordTask = recordPenTask.bind(null, id);
  const savePen = updatePen.bind(null, id);

  return (
    <>
      <PageHeader
        title={pen.name}
        description={`${HOUSING_TYPE_LABELS[pen.housingType]}${pen.location ? ` · ${pen.location}` : ""}`}
        actions={<Link href="/pens" className="text-sm underline underline-offset-2">All pens</Link>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Occupancy"
          value={`${occupants.length} / ${pen.capacity}`}
          hint={
            row?.isOverCapacity
              ? `Over capacity by ${row.overCapacityBy}`
              : `${Math.max(0, pen.capacity - occupants.length)} space(s) free`
          }
        />
        <StatTile
          label="Last cleaned"
          value={row?.lastCleanedAt ? formatDate(row.lastCleanedAt) : "Never"}
          hint={row?.nextBiosecurityDueAt ? `Next due ${formatDate(row.nextBiosecurityDueAt)}` : undefined}
        />
        <StatTile label="Tasks recorded" value={String(tasks.length)} />
      </div>

      {row?.neverCleaned || row?.biosecurityOverdue ? (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {row.neverCleaned
              ? "No cleaning or disinfection has ever been recorded for this pen."
              : `Cleaning was due on ${formatDate(row.nextBiosecurityDueAt)} and has not been recorded.`}{" "}
            Cleaning records are part of the farm&apos;s biosecurity trail — they are what you need after a
            disease event, not before one.
          </p>
        </Card>
      ) : null}

      {pen.notes ? (
        <Card className="mb-6">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{pen.notes}</p>
        </Card>
      ) : null}

      <h2 className="mb-3 text-lg font-medium">Current occupants</h2>
      {occupants.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="This pen is empty" description="Animals are moved in from their own record." />
        </div>
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Tag</Th>
                <Th>Breed</Th>
                <Th>Sex</Th>
                <Th>Age</Th>
                <Th className="text-right">Weight</Th>
              </Tr>
            </Thead>
            <Tbody>
              {occupants.map((animal) => (
                <Tr key={animal.id}>
                  <Td>
                    <Link href={`/animals/${animal.id}`} className="font-medium underline underline-offset-2">
                      {animal.tagNumber}
                    </Link>
                    {animal.name ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">{animal.name}</span>
                    ) : null}
                  </Td>
                  <Td>{animal.breed}</Td>
                  <Td>{SEX_LABELS[animal.sex]}</Td>
                  <Td>{formatAge(animal.dateOfBirth)}</Td>
                  <Td className="text-right tabular-nums">{formatKg(animal.currentWeightKg)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-medium">Cleaning &amp; maintenance</h2>
      {canRecord ? (
        <Card className="mb-4">
          <PenTaskForm action={recordTask} />
        </Card>
      ) : null}

      {tasks.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="No tasks recorded" />
        </div>
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Task</Th>
                <Th>Performed</Th>
                <Th>Next due</Th>
                <Th className="text-right">Cost</Th>
                <Th>By</Th>
                <Th>Notes</Th>
              </Tr>
            </Thead>
            <Tbody>
              {tasks.map((task) => (
                <Tr key={task.id}>
                  <Td>
                    <Badge>{PEN_TASK_TYPE_LABELS[task.taskType]}</Badge>
                  </Td>
                  <Td>{formatDate(task.performedAt)}</Td>
                  <Td>{task.nextDueAt ? formatDate(task.nextDueAt) : "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {task.costCents ? formatCents(task.costCents) : "—"}
                  </Td>
                  <Td>{task.performedBy?.name ?? "—"}</Td>
                  <Td className="text-zinc-500 dark:text-zinc-400">{task.notes ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-medium">Movement history</h2>
      {movements.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="No movements recorded for this pen" />
        </div>
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Reason</Th>
              </Tr>
            </Thead>
            <Tbody>
              {movements.map((movement) => (
                <Tr key={movement.id}>
                  <Td>{formatDate(movement.movedAt)}</Td>
                  <Td>{movement.fromPenName ?? "—"}</Td>
                  <Td>{movement.toPenName ?? "—"}</Td>
                  <Td className="text-zinc-500 dark:text-zinc-400">{movement.reason ?? "—"}</Td>
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
              Edit this pen
            </summary>
            <div className="mt-4">
              <PenForm
                action={savePen}
                submitLabel="Save changes"
                idPrefix="edit-pen"
                values={{
                  name: pen.name,
                  housingType: pen.housingType,
                  capacity: pen.capacity,
                  location: pen.location,
                  notes: pen.notes,
                }}
              />
            </div>
          </details>
        </Card>
      ) : null}
    </>
  );
}
