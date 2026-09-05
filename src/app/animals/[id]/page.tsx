import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { AnimalStatusBadge } from "@/components/animals/status-badge";
import { InbreedingSummary } from "@/components/animals/inbreeding-summary";
import { LogWeightForm } from "@/components/animals/log-weight-form";
import { MovePenForm } from "@/components/animals/move-pen-form";
import { WeightChart } from "@/components/animals/weight-chart";
import { logWeight, movePen } from "@/app/animals/actions";
import { canSeeFinancials, requireUser, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import {
  findSiblings,
  getAnimalWithRelations,
  getParityOf,
  listPensWithOccupancy,
} from "@/lib/db/animals";
import { loadPedigreeIndex } from "@/lib/breeding/pedigree";
import { createInbreedingCalculator, pedigreeCompleteness } from "@/lib/breeding/inbreeding";
import { averageDailyGain, deriveLifeStage } from "@/lib/life-stage";
import {
  formatAge,
  formatCents,
  formatDate,
  formatKg,
  toDateInputValue,
} from "@/lib/format";
import {
  ACQUISITION_TYPE_LABELS,
  BREEDING_METHOD_LABELS,
  EXIT_REASON_LABELS,
  HEALTH_CATEGORY_LABELS,
  HEALTH_OUTCOME_LABELS,
  HEALTH_RECORD_TYPE_LABELS,
  HOUSING_TYPE_LABELS,
  LIFE_STAGE_LABELS,
  PREGNANCY_STATUS_LABELS,
  SEVERITY_LABELS,
  SEX_LABELS,
} from "@/lib/labels";
import type { PedigreeNode } from "@/lib/breeding/pedigree";
import type { HealthOutcome, Severity } from "@prisma/client";

/** Generations of ancestry the completeness figure is measured over. */
const COMPLETENESS_GENERATIONS = 4;

const SEVERITY_VARIANTS: Record<Severity, "default" | "warning" | "danger"> = {
  MILD: "default",
  MODERATE: "warning",
  SEVERE: "danger",
};

const OUTCOME_VARIANTS: Record<HealthOutcome, "default" | "success" | "warning" | "danger"> = {
  RECOVERED: "success",
  ONGOING: "warning",
  DEATH: "danger",
};

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Nothing({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500 dark:text-zinc-400">{children}</p>;
}

function AnimalLink({
  animal,
}: {
  animal: { id: string; tagNumber: string; name?: string | null } | null;
}) {
  if (!animal) return <span className="text-zinc-500 dark:text-zinc-400">Unknown</span>;
  return (
    <Link
      href={`/animals/${animal.id}`}
      className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
    >
      {animal.tagNumber}
      {animal.name ? ` — ${animal.name}` : ""}
    </Link>
  );
}

function SiblingList({ title, siblings }: { title: string; siblings: PedigreeNode[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title} ({siblings.length})
      </h3>
      {siblings.length === 0 ? (
        <Nothing>None on record.</Nothing>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {siblings.map((sibling) => (
            <li key={sibling.id}>
              <AnimalLink animal={sibling} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AnimalDetailPage({ params }: PageProps<"/animals/[id]">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const { id } = await params;

  const animal = await getAnimalWithRelations(farmId, id);
  if (!animal) notFound();

  const canEdit = WRITE_ROLES.includes(user.role);
  const showMoney = canSeeFinancials(user.role);

  const [index, settings, parity, pens] = await Promise.all([
    loadPedigreeIndex(farmId),
    getFarmSettings(farmId),
    getParityOf(farmId, id),
    listPensWithOccupancy(farmId),
  ]);

  // One calculator per request: it memoises kinship across every animal it is
  // asked about, so the herd's whole pedigree is walked at most once here.
  const calculator = createInbreedingCalculator(index);
  const coefficient = calculator.inbreedingOf(id);
  const completeness = pedigreeCompleteness(index, id, COMPLETENESS_GENERATIONS);

  const lifeStage = deriveLifeStage({
    dateOfBirth: animal.dateOfBirth,
    sex: animal.sex,
    parity,
    weaningAgeDays: settings.weaningAgeDays,
    minBreedingAgeDays:
      animal.sex === "FEMALE"
        ? settings.minBreedingAgeDaysFemale
        : settings.minBreedingAgeDaysMale,
  });

  const siblings = findSiblings(index, id);

  // Weigh-ins arrive oldest-first, which is what both the chart and the gain
  // calculations want.
  const weighIns = animal.weightRecords;
  const lifetimeGain =
    weighIns.length >= 2
      ? averageDailyGain(weighIns[0], weighIns[weighIns.length - 1])
      : null;
  const recentGain =
    weighIns.length >= 2
      ? averageDailyGain(weighIns[weighIns.length - 2], weighIns[weighIns.length - 1])
      : null;

  const offspring = [...animal.offspringAsMother, ...animal.offspringAsFather].sort(
    (a, b) => b.dateOfBirth.getTime() - a.dateOfBirth.getTime()
  );

  const breedings = [
    ...animal.breedingsAsDam.map((record) => ({ record, role: "Dam", partner: record.sire })),
    ...animal.breedingsAsSire.map((record) => ({ record, role: "Sire", partner: record.dam })),
  ].sort((a, b) => b.record.breedingDate.getTime() - a.record.breedingDate.getTime());

  const today = toDateInputValue(new Date());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${animal.tagNumber}${animal.name ? ` — ${animal.name}` : ""}`}
        description={`${animal.breed} · ${SEX_LABELS[animal.sex]} · born ${formatDate(
          animal.dateOfBirth
        )} (${formatAge(animal.dateOfBirth)})`}
        actions={
          <>
            <ButtonLink href={`/animals/${animal.id}/pedigree`} variant="secondary">
              View pedigree
            </ButtonLink>
            {canEdit ? <ButtonLink href={`/animals/${animal.id}/edit`}>Edit</ButtonLink> : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <AnimalStatusBadge status={animal.status} />
        <Badge>{LIFE_STAGE_LABELS[lifeStage]}</Badge>
        <Badge>
          {animal.pen
            ? `${animal.pen.name} · ${HOUSING_TYPE_LABELS[animal.pen.housingType]}`
            : "No pen assigned"}
        </Badge>
        {animal.congenitalDefects ? (
          <Badge variant="warning">Defect: {animal.congenitalDefects}</Badge>
        ) : null}
        {animal.dateExit ? (
          <Badge variant="danger">
            Exited {formatDate(animal.dateExit)}
            {animal.exitReason ? ` · ${EXIT_REASON_LABELS[animal.exitReason]}` : ""}
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Current weight"
          value={formatKg(animal.currentWeightKg)}
          hint={
            weighIns.length > 0
              ? `Last weighed ${formatDate(weighIns[weighIns.length - 1].recordedAt)}`
              : "No weigh-ins recorded"
          }
        />
        <StatTile
          label="Average daily gain"
          value={lifetimeGain === null ? "—" : `${lifetimeGain.toFixed(3)} kg/day`}
          hint={
            recentGain === null
              ? "Needs at least two weigh-ins"
              : `${recentGain.toFixed(3)} kg/day since the previous weigh-in`
          }
        />
        <StatTile
          label="Age"
          value={formatAge(animal.dateOfBirth)}
          hint={`Body condition ${animal.bodyConditionScore ?? "—"}/5`}
        />
        <StatTile
          label="Generation"
          value={String(animal.generation)}
          hint={animal.generation === 0 ? "Founder — no recorded parents" : "Depth below the founders"}
        />

        <InbreedingSummary
          coefficient={coefficient}
          completeness={completeness}
          generations={COMPLETENESS_GENERATIONS}
          warnThreshold={settings.warnInbreedingCoefficient}
          maxThreshold={settings.maxInbreedingCoefficient}
        />

        <Card className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Acquisition</span>
          <span className="text-base font-medium text-zinc-900 dark:text-zinc-50">
            {ACQUISITION_TYPE_LABELS[animal.acquisitionType]} · {formatDate(animal.dateAcquired)}
          </span>
          {showMoney ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Cost:{" "}
              {animal.acquisitionCostCents === null
                ? "not recorded"
                : formatCents(animal.acquisitionCostCents, settings.currencyCode)}
            </span>
          ) : null}
          {animal.markings ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Markings: {animal.markings}
            </span>
          ) : null}
        </Card>
      </div>

      {canEdit ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section
            title="Record a weigh-in"
            description="Writes the weight record and updates the animal's current weight together."
          >
            <LogWeightForm animalId={animal.id} action={logWeight} defaultDate={today} />
          </Section>

          <Section
            title="Move pen"
            description="Refused for deceased animals, and for a destination pen that is already full."
          >
            <MovePenForm
              animalId={animal.id}
              currentPenId={animal.penId}
              action={movePen}
              pens={pens}
              defaultDate={today}
            />
          </Section>
        </div>
      ) : null}

      <Section
        title="Parents and offspring"
        action={
          <Link
            href={`/animals/${animal.id}/pedigree`}
            className="text-sm underline underline-offset-2"
          >
            Full family tree
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Dam
            </h3>
            <p className="mt-1 text-sm">
              <AnimalLink animal={animal.mother} />
              {animal.mother ? (
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                  ({animal.mother.breed})
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Sire
            </h3>
            <p className="mt-1 text-sm">
              <AnimalLink animal={animal.father} />
              {animal.father ? (
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                  ({animal.father.breed})
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Offspring ({offspring.length})
          </h3>
          {offspring.length === 0 ? (
            <Nothing>No offspring recorded.</Nothing>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {offspring.map((child) => (
                <li key={child.id}>
                  <AnimalLink animal={child} />
                  <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                    ({formatAge(child.dateOfBirth)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section
        title="Siblings"
        description="Full siblings share both parents; half siblings share exactly one. Two unknown parents are never counted as a match."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SiblingList title="Full siblings" siblings={siblings.full} />
          <SiblingList title="Maternal half" siblings={siblings.maternalHalf} />
          <SiblingList title="Paternal half" siblings={siblings.paternalHalf} />
        </div>
      </Section>

      <Section title="Weight history" description={`${weighIns.length} weigh-ins recorded.`}>
        {weighIns.length === 0 ? (
          <Nothing>
            No weigh-ins yet. Growth rate and feed conversion both start with the first one.
          </Nothing>
        ) : (
          <>
            <WeightChart points={weighIns} />
            <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Table>
                <Thead className="sticky top-0 z-10 bg-white dark:bg-zinc-950">
                  <Tr>
                    <Th>Date</Th>
                    <Th className="text-right">Weight</Th>
                    <Th className="text-right">BCS</Th>
                    <Th>Notes</Th>
                    <Th>Recorded by</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {[...weighIns].reverse().map((record) => (
                    <Tr key={record.id}>
                      <Td className="whitespace-nowrap">{formatDate(record.recordedAt)}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">
                        {formatKg(record.weightKg)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {record.bodyConditionScore ?? "—"}
                      </Td>
                      <Td>{record.notes ?? "—"}</Td>
                      <Td className="whitespace-nowrap">{record.recordedBy?.name ?? "—"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Pen movements"
        description="Kept for biosecurity tracing — pen names are stored as written at the time of the move."
      >
        {animal.penMovements.length === 0 ? (
          <Nothing>No moves recorded.</Nothing>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Reason</Th>
                <Th>Moved by</Th>
              </Tr>
            </Thead>
            <Tbody>
              {animal.penMovements.map((movement) => (
                <Tr key={movement.id}>
                  <Td className="whitespace-nowrap">{formatDate(movement.movedAt)}</Td>
                  <Td className="whitespace-nowrap">{movement.fromPenName ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{movement.toPenName ?? "No pen"}</Td>
                  <Td>{movement.reason ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{movement.movedBy?.name ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Section>

      <Section
        title="Health"
        description="Most recent 20 records."
        action={
          <Link href="/health" className="text-sm underline underline-offset-2">
            Health module
          </Link>
        }
      >
        {animal.healthRecords.length === 0 ? (
          <Nothing>No health records for this animal.</Nothing>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Category</Th>
                <Th>Diagnosis</Th>
                <Th>Severity</Th>
                <Th>Outcome</Th>
              </Tr>
            </Thead>
            <Tbody>
              {animal.healthRecords.map((record) => (
                <Tr key={record.id}>
                  <Td className="whitespace-nowrap">{formatDate(record.recordedAt)}</Td>
                  <Td className="whitespace-nowrap">
                    {HEALTH_RECORD_TYPE_LABELS[record.recordType]}
                  </Td>
                  <Td className="whitespace-nowrap">{HEALTH_CATEGORY_LABELS[record.category]}</Td>
                  <Td>{record.diagnosis}</Td>
                  <Td>
                    <Badge variant={SEVERITY_VARIANTS[record.severity]}>
                      {SEVERITY_LABELS[record.severity]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={OUTCOME_VARIANTS[record.outcome]}>
                      {HEALTH_OUTCOME_LABELS[record.outcome]}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        {animal.vaccinationRecords.length > 0 ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Recent vaccinations
            </h3>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              {animal.vaccinationRecords.map((record) => (
                <li key={record.id}>
                  {formatDate(record.administeredAt)} — {record.vaccineName}
                  {record.nextDueDate ? ` (next due ${formatDate(record.nextDueDate)})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section
        title="Breeding history"
        action={
          <Link href="/breeding" className="text-sm underline underline-offset-2">
            Breeding module
          </Link>
        }
      >
        {breedings.length === 0 ? (
          <Nothing>No breeding records for this animal.</Nothing>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Role</Th>
                <Th>Partner</Th>
                <Th>Method</Th>
                <Th>Status</Th>
                <Th>Expected farrowing</Th>
              </Tr>
            </Thead>
            <Tbody>
              {breedings.map(({ record, role, partner }) => (
                <Tr key={record.id}>
                  <Td className="whitespace-nowrap">{formatDate(record.breedingDate)}</Td>
                  <Td>{role}</Td>
                  <Td className="whitespace-nowrap">
                    <AnimalLink animal={partner} />
                  </Td>
                  <Td className="whitespace-nowrap">{BREEDING_METHOD_LABELS[record.method]}</Td>
                  <Td className="whitespace-nowrap">
                    {PREGNANCY_STATUS_LABELS[record.pregnancyStatus]}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(record.expectedFarrowingDate)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Section>

      <Section title="Litter">
        {animal.litter === null ? (
          <Nothing>
            Not linked to a farrowing record — normal for purchased stock, and for animals entered
            before the litter was registered.
          </Nothing>
        ) : (
          <div className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <p>
              Farrowed {formatDate(animal.litter.farrowingDate)} — {animal.litter.bornAlive} born
              alive, {animal.litter.stillborn} stillborn.
            </p>
            <p>
              {animal.litter.weaningDate
                ? `Weaned ${formatDate(animal.litter.weaningDate)}${
                    animal.litter.weanedCount !== null
                      ? ` (${animal.litter.weanedCount} weaned)`
                      : ""
                  }`
                : "Not yet weaned."}
            </p>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="text-zinc-500 dark:text-zinc-400">Litter parents:</span>
              <AnimalLink animal={animal.litter.breedingRecord.dam} />
              <span aria-hidden="true">×</span>
              <AnimalLink animal={animal.litter.breedingRecord.sire} />
            </p>
          </div>
        )}
      </Section>

      {animal.phenotypeNotes || animal.exitNotes ? (
        <Section title="Notes">
          {animal.phenotypeNotes ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Phenotype
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">
                {animal.phenotypeNotes}
              </p>
            </div>
          ) : null}
          {animal.exitNotes ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Exit
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">
                {animal.exitNotes}
              </p>
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
