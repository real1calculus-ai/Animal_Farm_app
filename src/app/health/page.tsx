import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import {
  CategoryBadge,
  OutcomeBadge,
  SeverityBadge,
  severityRowClasses,
} from "@/components/health/badges";
import {
  categoryParam,
  dateParam,
  firstParam,
  outcomeParam,
  recordTypeParam,
  severityParam,
} from "@/components/health/search-params";
import { resolveHealthRecord } from "@/app/health/actions";
import { ADMIN_ROLES, requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatPercent, toDateInputValue } from "@/lib/format";
import {
  HEALTH_CATEGORY_LABELS,
  HEALTH_OUTCOME_LABELS,
  HEALTH_RECORD_TYPE_LABELS,
  SEVERITY_LABELS,
  optionsFrom,
} from "@/lib/labels";
import {
  getAnimalsInWithdrawal,
  getMorbidity,
  getOngoingTreatments,
  listHealthRecords,
  listPenOptions,
  listPigOptions,
} from "@/lib/db/health";

/**
 * The health register.
 *
 * Two lists sit above the log on purpose. "Under treatment" and "inside a
 * withdrawal period" are the only two things on this screen that are about
 * *right now* — everything below is history. A withdrawal breach in particular
 * is a food-safety event, and it has to be visible before somebody loads a
 * lorry rather than at the moment the sale is refused.
 */
export default async function HealthPage({ searchParams }: PageProps<"/health">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const params = await searchParams;

  const filters = {
    category: categoryParam(params.category),
    severity: severityParam(params.severity),
    outcome: outcomeParam(params.outcome),
    recordType: recordTypeParam(params.recordType),
    penId: firstParam(params.penId),
    pigId: firstParam(params.pigId),
    from: dateParam(params.from),
    to: dateParam(params.to),
    search: firstParam(params.q),
  };

  const [records, ongoing, withdrawal, morbidity, pens, pigs] = await Promise.all([
    listHealthRecords(farmId, filters),
    getOngoingTreatments(farmId),
    getAnimalsInWithdrawal(farmId),
    getMorbidity(farmId),
    listPenOptions(farmId),
    listPigOptions(farmId, { includeInactive: true }),
  ]);

  const hasFilters = Object.values(filters).some((value) => value !== null);
  const canManageProtocols = ADMIN_ROLES.includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health records"
        description="Illness, injury, treatment and examination history for the herd."
        actions={
          <>
            <ButtonLink href="/health/monitoring" variant="secondary">
              Disease monitoring
            </ButtonLink>
            <ButtonLink href="/health/vaccinations" variant="secondary">
              Vaccinations
            </ButtonLink>
            {canManageProtocols ? (
              <ButtonLink href="/health/protocols" variant="secondary">
                Protocols
              </ButtonLink>
            ) : null}
            <ButtonLink href="/health/new">Record health event</ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Under treatment"
          value={String(ongoing.length)}
          hint="Records with an ongoing outcome"
        />
        <StatTile
          label="In withdrawal"
          value={String(withdrawal.length)}
          hint="Cannot be sold or slaughtered"
        />
        <StatTile
          label="Morbidity rate"
          value={formatPercent(morbidity.rate)}
          hint={`${morbidity.sickCount} of ${morbidity.herdCount} active animals`}
        />
        <StatTile
          label="Records shown"
          value={String(records.length)}
          hint={hasFilters ? "Filtered" : "Most recent first"}
        />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Currently under treatment
        </h2>
        {ongoing.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            No animal has an ongoing condition. Every recorded case has been resolved.
          </p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Animal</Th>
                <Th>Pen</Th>
                <Th>Diagnosis</Th>
                <Th>Severity</Th>
                <Th className="text-right">Days ongoing</Th>
                <Th className="text-right">Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {ongoing.map((row) => (
                <Tr key={row.recordId} className={severityRowClasses(row.severity, "ONGOING")}>
                  <Td>
                    <Link
                      href={`/animals/${row.pigId}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {row.tagNumber}
                    </Link>
                    {row.pigName ? (
                      <span className="text-zinc-500 dark:text-zinc-400"> · {row.pigName}</span>
                    ) : null}
                  </Td>
                  <Td>{row.penName ?? "—"}</Td>
                  <Td>
                    <Link href={`/health/${row.recordId}`} className="underline underline-offset-2">
                      {row.diagnosis}
                    </Link>
                  </Td>
                  <Td>
                    <SeverityBadge severity={row.severity} />
                  </Td>
                  <Td className="text-right tabular-nums">{row.daysOngoing}</Td>
                  <Td className="text-right">
                    <form action={resolveHealthRecord}>
                      <input type="hidden" name="id" value={row.recordId} />
                      <SubmitButton variant="secondary" pendingLabel="Saving...">
                        Mark recovered
                      </SubmitButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card
        className={
          withdrawal.length > 0
            ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
            : undefined
        }
      >
        <h2 className="mb-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Within a medication withdrawal period
        </h2>
        <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
          These animals must not be sold or slaughtered until their clearance date. The sale screen
          enforces this, but it should never get that far.
        </p>
        {withdrawal.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            No animal is inside a withdrawal period.
          </p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Animal</Th>
                <Th>Pen</Th>
                <Th>Medications</Th>
                <Th>Clear from</Th>
                <Th className="text-right">Days left</Th>
              </Tr>
            </Thead>
            <Tbody>
              {withdrawal.map((row) => (
                <Tr key={row.pigId}>
                  <Td>
                    <Link
                      href={`/animals/${row.pigId}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {row.tagNumber}
                    </Link>
                  </Td>
                  <Td>{row.penName ?? "—"}</Td>
                  <Td>
                    {[...new Set(row.status.blockingMedications.map((m) => m.drugName))].join(", ")}
                  </Td>
                  <Td className="font-medium">{formatDate(row.status.clearanceDate)}</Td>
                  <Td className="text-right tabular-nums font-semibold text-red-700 dark:text-red-400">
                    {row.status.daysRemaining}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search diagnosis" htmlFor="q">
            <Input id="q" name="q" type="search" defaultValue={filters.search ?? ""} placeholder="e.g. scours" />
          </Field>

          <Field label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue={filters.category ?? ""}>
              <option value="">All categories</option>
              {optionsFrom(HEALTH_CATEGORY_LABELS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Severity" htmlFor="severity">
            <Select id="severity" name="severity" defaultValue={filters.severity ?? ""}>
              <option value="">All severities</option>
              {optionsFrom(SEVERITY_LABELS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Outcome" htmlFor="outcome">
            <Select id="outcome" name="outcome" defaultValue={filters.outcome ?? ""}>
              <option value="">All outcomes</option>
              {optionsFrom(HEALTH_OUTCOME_LABELS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Record type" htmlFor="recordType">
            <Select id="recordType" name="recordType" defaultValue={filters.recordType ?? ""}>
              <option value="">All types</option>
              {optionsFrom(HEALTH_RECORD_TYPE_LABELS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Pen" htmlFor="penId">
            <Select id="penId" name="penId" defaultValue={filters.penId ?? ""}>
              <option value="">All pens</option>
              {pens.map((pen) => (
                <option key={pen.id} value={pen.id}>
                  {pen.name} ({pen.activeCount})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Animal" htmlFor="pigId">
            <Select id="pigId" name="pigId" defaultValue={filters.pigId ?? ""}>
              <option value="">All animals</option>
              {pigs.map((pig) => (
                <option key={pig.id} value={pig.id}>
                  {pig.tagNumber}
                  {pig.name ? ` — ${pig.name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="From" htmlFor="from">
              <Input id="from" name="from" type="date" defaultValue={toDateInputValue(filters.from)} />
            </Field>
            <Field label="To" htmlFor="to">
              <Input id="to" name="to" type="date" defaultValue={toDateInputValue(filters.to)} />
            </Field>
          </div>

          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
            <SubmitButton pendingLabel="Filtering...">Apply filters</SubmitButton>
            {hasFilters ? (
              <Link
                href="/health"
                className="text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
              >
                Clear filters
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      {records.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No records match those filters" : "No health records yet"}
          description={
            hasFilters
              ? "Widen the date range or clear a filter to see more of the history."
              : "Every illness, injury, treatment and examination belongs here. It is also what feeds outbreak detection and the withdrawal check that gates sales."
          }
          action={
            hasFilters ? (
              <ButtonLink href="/health" variant="secondary">
                Clear filters
              </ButtonLink>
            ) : (
              <ButtonLink href="/health/new">Record health event</ButtonLink>
            )
          }
        />
      ) : (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Animal</Th>
                <Th>Pen</Th>
                <Th>Diagnosis</Th>
                <Th>Category</Th>
                <Th>Type</Th>
                <Th>Severity</Th>
                <Th>Outcome</Th>
                <Th className="text-right">Meds</Th>
                <Th className="text-right">Cost</Th>
              </Tr>
            </Thead>
            <Tbody>
              {records.map((record) => (
                <Tr
                  key={record.id}
                  className={severityRowClasses(record.severity, record.outcome)}
                >
                  <Td className="whitespace-nowrap">{formatDate(record.recordedAt)}</Td>
                  <Td className="whitespace-nowrap">
                    <Link
                      href={`/animals/${record.pig.id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {record.pig.tagNumber}
                    </Link>
                  </Td>
                  <Td>{record.pig.pen?.name ?? "—"}</Td>
                  <Td>
                    <Link href={`/health/${record.id}`} className="underline underline-offset-2">
                      {record.diagnosis}
                    </Link>
                  </Td>
                  <Td>
                    <CategoryBadge category={record.category} />
                  </Td>
                  <Td className="whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {HEALTH_RECORD_TYPE_LABELS[record.recordType]}
                  </Td>
                  <Td>
                    <SeverityBadge severity={record.severity} />
                  </Td>
                  <Td>
                    <OutcomeBadge outcome={record.outcome} />
                  </Td>
                  <Td className="text-right tabular-nums">{record._count.medications}</Td>
                  <Td className="text-right tabular-nums">{formatCents(record.costCents)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
