import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { BarChart } from "@/components/charts";
import { VaccinationStatusBadge } from "@/components/health/badges";
import { VaccinationForm } from "@/components/health/vaccination-form";
import { firstParam } from "@/components/health/search-params";
import { deleteVaccination } from "@/app/health/vaccinations/actions";
import { ADMIN_ROLES, HEALTH_ROLES, requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import type { LifeStage } from "@prisma/client";
import {
  getVaccinationObligations,
  listPenOptions,
  listAnimalOptions,
  listProtocolItems,
  listVaccinationRecords,
  splitSchedule,
  summariseCompliance,
  UPCOMING_HORIZON_DAYS,
  type VaccinationObligation,
} from "@/lib/db/health";

/**
 * Vaccination management: what has been given, what is owed, and how complete
 * the herd's cover actually is.
 *
 * "Owed" is derived, never stored — each active animal's life stage is
 * computed from its age, sex and parity and matched against the standing
 * protocol. A stored due-date list would be wrong the moment a gilt farrows
 * and becomes a sow, which is exactly when her schedule changes.
 */
export default async function VaccinationsPage({
  searchParams,
}: PageProps<"/health/vaccinations">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const params = await searchParams;

  const [records, obligations, protocolItems, animals, pens] = await Promise.all([
    listVaccinationRecords(farmId, { penId: firstParam(params.penId) }),
    getVaccinationObligations(farmId),
    listProtocolItems(farmId, { activeOnly: true }),
    listAnimalOptions(farmId),
    listPenOptions(farmId),
  ]);

  const schedule = splitSchedule(obligations);
  const compliance = summariseCompliance(obligations);
  const canRecord = HEALTH_ROLES.includes(user.role);
  const canManageProtocols = ADMIN_ROLES.includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vaccinations"
        description="Administered doses, what the protocol says is due, and coverage across the herd."
        actions={
          <>
            <ButtonLink href="/health" variant="secondary">
              Health records
            </ButtonLink>
            {canManageProtocols ? (
              <ButtonLink href="/health/protocols" variant="secondary">
                Edit protocol
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Overdue"
          value={String(schedule.overdue.length)}
          hint="Past the protocol's age window"
        />
        <StatTile label="Due now" value={String(schedule.due.length)} hint="Inside the window" />
        <StatTile
          label="Upcoming"
          value={String(schedule.upcoming.length)}
          hint={`Within ${UPCOMING_HORIZON_DAYS} days`}
        />
        <StatTile
          label="Herd compliance"
          value={formatPercent(compliance.overall.rate)}
          hint={`${compliance.overall.satisfied} of ${compliance.overall.required} doses owed`}
        />
      </div>

      {protocolItems.length === 0 ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
            No vaccination protocol is set up
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Nothing can be due, overdue or compliant until the farm&apos;s standing schedule exists.
            {canManageProtocols
              ? " Add the protocol items your vet has specified."
              : " Ask an administrator or manager to set it up."}
          </p>
          {canManageProtocols ? (
            <div className="mt-3">
              <ButtonLink href="/health/protocols">Set up the protocol</ButtonLink>
            </div>
          ) : null}
        </Card>
      ) : null}

      <ScheduleTable
        title="Overdue"
        description="Past the protocol's age window with no dose recorded. Vaccinate or record the dose that was given."
        rows={schedule.overdue}
        emptyMessage="Nothing overdue."
        canRecord={canRecord}
        tone="danger"
      />

      <ScheduleTable
        title="Due now"
        description="Inside the protocol's window today."
        rows={schedule.due}
        emptyMessage="Nothing due today."
        canRecord={canRecord}
        tone="warning"
      />

      <ScheduleTable
        title={`Upcoming (next ${UPCOMING_HORIZON_DAYS} days)`}
        description="Plan the batch — these come due shortly."
        rows={schedule.upcoming}
        emptyMessage="Nothing due in the next month."
        canRecord={canRecord}
        tone="default"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <BarChart
            title="Coverage by pen"
            description="Doses given as a share of doses owed. Owed means the window has opened — animals too young to be due are not counted against the pen."
            data={compliance.byPen.map((row) => ({
              label: row.label,
              value: row.rate,
              hint: `${row.satisfied}/${row.required}`,
            }))}
            max={1}
            formatValue={(value) => formatPercent(value, 0)}
            emptyMessage="No doses are owed yet."
          />
        </Card>
        <Card>
          <BarChart
            title="Coverage by age group"
            description="The same measure grouped by production stage, which is what the protocol targets."
            data={compliance.byStage.map((row) => ({
              label: LIFE_STAGE_LABELS[row.label as LifeStage] ?? row.label,
              value: row.rate,
              hint: `${row.satisfied}/${row.required}`,
            }))}
            max={1}
            formatValue={(value) => formatPercent(value, 0)}
            emptyMessage="No doses are owed yet."
          />
        </Card>
      </div>

      {canRecord ? (
        <VaccinationForm
          animals={animals.map((animal) => ({
            id: animal.id,
            tagNumber: animal.tagNumber,
            name: animal.name,
            penName: animal.penName,
          }))}
          pens={pens}
          protocolItems={protocolItems.map((item) => ({
            id: item.id,
            name: item.name,
            vaccineName: item.vaccineName,
            boosterIntervalDays: item.boosterIntervalDays,
          }))}
          defaultAnimalId={firstParam(params.animalId) ?? undefined}
          defaultProtocolItemId={firstParam(params.protocolItemId) ?? undefined}
        />
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Recording vaccinations is restricted to administrators, managers and veterinarians.
        </p>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Administered vaccinations
        </h2>
        {records.length === 0 ? (
          <EmptyState
            title="No vaccinations recorded yet"
            description="Record every dose, with its lot number — a recall traces back through that number and nothing else."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Animal</Th>
                <Th>Pen</Th>
                <Th>Vaccine</Th>
                <Th>Protocol</Th>
                <Th>Lot</Th>
                <Th>Vet</Th>
                <Th>Next due</Th>
                <Th className="text-right">Cost</Th>
                {canRecord ? <Th className="text-right">Actions</Th> : null}
              </Tr>
            </Thead>
            <Tbody>
              {records.map((record) => (
                <Tr key={record.id}>
                  <Td className="whitespace-nowrap">{formatDate(record.administeredAt)}</Td>
                  <Td className="whitespace-nowrap">
                    <Link
                      href={`/animals/${record.animal.id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {record.animal.tagNumber}
                    </Link>
                  </Td>
                  <Td>{record.animal.pen?.name ?? "—"}</Td>
                  <Td>{record.vaccineName}</Td>
                  <Td className="text-zinc-500 dark:text-zinc-400">
                    {record.protocolItem?.name ?? "Off protocol"}
                  </Td>
                  <Td className="font-mono text-xs">{record.lotNumber ?? "—"}</Td>
                  <Td>{record.veterinarian ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{formatDate(record.nextDueDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(record.costCents)}</Td>
                  {canRecord ? (
                    <Td className="text-right">
                      <form action={deleteVaccination}>
                        <input type="hidden" name="id" value={record.id} />
                        <SubmitButton variant="danger" pendingLabel="Removing...">
                          Remove
                        </SubmitButton>
                      </form>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ScheduleTable({
  title,
  description,
  rows,
  emptyMessage,
  canRecord,
  tone,
}: {
  title: string;
  description: string;
  rows: VaccinationObligation[];
  emptyMessage: string;
  canRecord: boolean;
  tone: "danger" | "warning" | "default";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
        : undefined;

  return (
    <Card className={rows.length > 0 ? toneClass : undefined}>
      <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {title} <span className="text-zinc-500 dark:text-zinc-400">({rows.length})</span>
      </h2>
      <p className="mt-0.5 mb-3 text-xs text-zinc-600 dark:text-zinc-400">{description}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{emptyMessage}</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Animal</Th>
              <Th>Pen</Th>
              <Th>Stage</Th>
              <Th>Protocol</Th>
              <Th>Vaccine</Th>
              <Th>Due</Th>
              <Th>Status</Th>
              {canRecord ? <Th className="text-right">Action</Th> : null}
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => (
              <Tr key={row.key}>
                <Td className="whitespace-nowrap">
                  <Link
                    href={`/animals/${row.animalId}`}
                    className="font-medium underline underline-offset-2"
                  >
                    {row.tagNumber}
                  </Link>
                </Td>
                <Td>{row.penName}</Td>
                <Td>{LIFE_STAGE_LABELS[row.lifeStage]}</Td>
                <Td>{row.protocolName}</Td>
                <Td>{row.vaccineName}</Td>
                <Td className="whitespace-nowrap">
                  {formatDate(row.dueDate)}
                  {row.isBooster && !row.everAdministered ? (
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      never given
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <VaccinationStatusBadge status={row.status} />
                </Td>
                {canRecord ? (
                  <Td className="text-right">
                    <Link
                      href={`/health/vaccinations?animalId=${row.animalId}&protocolItemId=${row.protocolItemId}`}
                      className="text-sm underline underline-offset-2"
                    >
                      Record dose
                    </Link>
                  </Td>
                ) : null}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}
