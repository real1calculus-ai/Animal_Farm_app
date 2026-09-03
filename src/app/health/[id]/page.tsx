import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  CategoryBadge,
  OutcomeBadge,
  SeverityBadge,
} from "@/components/health/badges";
import { HealthRecordForm, type AnimalChoice } from "@/components/health/health-record-form";
import { MedicationManager } from "@/components/health/medication-manager";
import { WithdrawalBanner } from "@/components/health/withdrawal-banner";
import { deleteHealthRecord, updateHealthRecord } from "@/app/health/actions";
import { HEALTH_ROLES, requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatAge, formatCents, formatDate, toDateInputValue } from "@/lib/format";
import { HEALTH_RECORD_TYPE_LABELS, PIG_STATUS_LABELS, SEX_LABELS } from "@/lib/labels";
import { getHealthRecord } from "@/lib/db/health";
import { computeWithdrawalStatus } from "@/lib/health/withdrawal";

/**
 * One health event in full: the clinical detail, its medications, and — top of
 * the page — whether the animal is currently sale-blocked because of them.
 */
export default async function HealthRecordPage({ params }: PageProps<"/health/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);

  const record = await getHealthRecord(farmId, id);
  if (!record) notFound();

  const canEdit = HEALTH_ROLES.includes(user.role);
  // Withdrawal is a property of the animal, not of this one record, so the
  // banner is computed from every medication the animal has ever had.
  const withdrawal = computeWithdrawalStatus(record.medications);

  const animal: AnimalChoice = {
    id: record.pig.id,
    tagNumber: record.pig.tagNumber,
    name: record.pig.name,
    dateOfBirth: toDateInputValue(record.pig.dateOfBirth),
    penName: record.pig.pen?.name ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={record.diagnosis}
        description={`${HEALTH_RECORD_TYPE_LABELS[record.recordType]} recorded on ${formatDate(
          record.recordedAt
        )} for pig ${record.pig.tagNumber}.`}
        actions={
          <>
            <ButtonLink href="/health" variant="secondary">
              Back to records
            </ButtonLink>
            <ButtonLink href={`/animals/${record.pig.id}`} variant="secondary">
              Animal profile
            </ButtonLink>
          </>
        }
      />

      <WithdrawalBanner status={withdrawal} tagNumber={record.pig.tagNumber} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Clinical record
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Category">
              <CategoryBadge category={record.category} />
            </Detail>
            <Detail label="Severity">
              <SeverityBadge severity={record.severity} />
            </Detail>
            <Detail label="Outcome">
              <OutcomeBadge outcome={record.outcome} />
            </Detail>
            <Detail label="Resolved on">{formatDate(record.resolvedAt)}</Detail>
            <Detail label="Treatment cost">{formatCents(record.costCents)}</Detail>
            <Detail label="Medication cost">
              {formatCents(record.medications.reduce((sum, m) => sum + m.costCents, 0))}
            </Detail>
            <Detail label="Recorded by">{record.createdBy?.name ?? "—"}</Detail>
            <Detail label="Last updated">{formatDate(record.updatedAt)}</Detail>
          </dl>

          <div className="mt-4 space-y-3">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Treatment applied
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-800 dark:text-zinc-200">
                {record.treatment ?? "—"}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Veterinary notes
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-800 dark:text-zinc-200">
                {record.vetNotes ?? "—"}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">The animal</h2>
          <dl className="grid grid-cols-1 gap-y-3">
            <Detail label="Tag">
              <Link
                href={`/animals/${record.pig.id}`}
                className="font-medium underline underline-offset-2"
              >
                {record.pig.tagNumber}
              </Link>
              {record.pig.name ? ` — ${record.pig.name}` : ""}
            </Detail>
            <Detail label="Breed">{record.pig.breed}</Detail>
            <Detail label="Sex">{SEX_LABELS[record.pig.sex]}</Detail>
            <Detail label="Status">{PIG_STATUS_LABELS[record.pig.status]}</Detail>
            <Detail label="Age at the event">
              {formatAge(record.pig.dateOfBirth, record.recordedAt)}
            </Detail>
            <Detail label="Pen">{record.pig.pen?.name ?? "Unassigned"}</Detail>
          </dl>
        </Card>
      </div>

      <MedicationManager
        medications={record.medications}
        healthRecordId={record.id}
        canEdit={canEdit}
      />

      {canEdit ? (
        <>
          <details className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Edit this record
            </summary>
            <div className="mt-4">
              <HealthRecordForm
                action={updateHealthRecord}
                animals={[animal]}
                mode="edit"
                cancelHref={`/health/${record.id}`}
                initial={{
                  id: record.id,
                  pigId: record.pig.id,
                  recordedAt: toDateInputValue(record.recordedAt),
                  recordType: record.recordType,
                  category: record.category,
                  severity: record.severity,
                  diagnosis: record.diagnosis,
                  treatment: record.treatment ?? "",
                  vetNotes: record.vetNotes ?? "",
                  costMajor: (record.costCents / 100).toFixed(2),
                  outcome: record.outcome,
                  resolvedAt: toDateInputValue(record.resolvedAt),
                }}
              />
            </div>
          </details>

          <Card className="border-red-200 dark:border-red-900">
            <h2 className="text-sm font-medium text-red-800 dark:text-red-300">Delete record</h2>
            <p className="mt-1 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Removes this record and its medications. If a withdrawal period was being tracked
              through those medications, deleting them removes that block — correct the record
              instead unless it was entered against the wrong animal.
            </p>
            <form action={deleteHealthRecord}>
              <input type="hidden" name="id" value={record.id} />
              <SubmitButton variant="danger" pendingLabel="Deleting...">
                Delete record
              </SubmitButton>
            </form>
          </Card>
        </>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Editing a clinical record is restricted to administrators, managers and veterinarians. You
          can still add and complete medications above.
        </p>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-200">{children}</dd>
    </div>
  );
}
