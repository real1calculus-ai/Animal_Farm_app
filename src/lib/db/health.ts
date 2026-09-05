import "server-only";

import type {
  HealthCategory,
  HealthOutcome,
  HealthRecordType,
  LifeStage,
  Prisma,
  Severity,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFarmSettings } from "@/lib/active-farm";
import { getParityMap } from "@/lib/db/animals";
import { addDays, ageInDays, daysBetween } from "@/lib/format";
import { deriveLifeStage } from "@/lib/life-stage";
import {
  computeWithdrawalStatus,
  WITHDRAWAL_MEDICATION_SELECT,
  type WithdrawalMedication,
  type WithdrawalStatus,
} from "@/lib/health/withdrawal";
import {
  detectDiagnosisClusters,
  detectMortalitySpike,
  detectReproductiveFailureCluster,
  type MortalitySpike,
  type OutbreakAlert,
  type OutbreakCase,
} from "@/lib/health/outbreak";

/**
 * Every read the health module performs, in one place.
 *
 * Two reasons this is not inlined into the pages: the animal, breeding and
 * finance screens all want `getAnimalHealthSummary`, and a health query written
 * inline is a health query written without `farmId` sooner or later. Every
 * function here takes `farmId` as its first argument and puts it in the where
 * clause — including the vaccination queries, which have to reach it through
 * `animal.farmId` because `VaccinationRecord` carries no tenant column of its own.
 */

const DEFAULT_LIST_LIMIT = 200;

// ---------------------------------------------------------------------------
// Health records
// ---------------------------------------------------------------------------

export type HealthRecordFilters = {
  category?: HealthCategory | null;
  severity?: Severity | null;
  outcome?: HealthOutcome | null;
  recordType?: HealthRecordType | null;
  penId?: string | null;
  animalId?: string | null;
  from?: Date | null;
  to?: Date | null;
  /** Free text over the diagnosis. */
  search?: string | null;
};

function buildWhere(farmId: string, filters: HealthRecordFilters): Prisma.HealthRecordWhereInput {
  const where: Prisma.HealthRecordWhereInput = { farmId };

  if (filters.category) where.category = filters.category;
  if (filters.severity) where.severity = filters.severity;
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.recordType) where.recordType = filters.recordType;
  if (filters.animalId) where.animalId = filters.animalId;
  if (filters.penId) where.animal = { penId: filters.penId };
  if (filters.search) where.diagnosis = { contains: filters.search, mode: "insensitive" };

  if (filters.from || filters.to) {
    where.recordedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
    };
  }

  return where;
}

const LIST_SELECT = {
  id: true,
  recordedAt: true,
  recordType: true,
  category: true,
  severity: true,
  diagnosis: true,
  treatment: true,
  outcome: true,
  resolvedAt: true,
  costCents: true,
  animal: {
    select: {
      id: true,
      tagNumber: true,
      name: true,
      status: true,
      pen: { select: { id: true, name: true } },
    },
  },
  _count: { select: { medications: true } },
} satisfies Prisma.HealthRecordSelect;

export type HealthRecordListItem = Prisma.HealthRecordGetPayload<{ select: typeof LIST_SELECT }>;

export async function listHealthRecords(
  farmId: string,
  filters: HealthRecordFilters = {},
  limit: number = DEFAULT_LIST_LIMIT
): Promise<HealthRecordListItem[]> {
  return prisma.healthRecord.findMany({
    where: buildWhere(farmId, filters),
    select: LIST_SELECT,
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function countHealthRecords(
  farmId: string,
  filters: HealthRecordFilters = {}
): Promise<number> {
  return prisma.healthRecord.count({ where: buildWhere(farmId, filters) });
}

const DETAIL_INCLUDE = {
  medications: { orderBy: { startDate: "asc" } },
  createdBy: { select: { id: true, name: true } },
  animal: {
    select: {
      id: true,
      tagNumber: true,
      name: true,
      breed: true,
      sex: true,
      status: true,
      dateOfBirth: true,
      dateExit: true,
      exitReason: true,
      pen: { select: { id: true, name: true, housingType: true } },
    },
  },
} satisfies Prisma.HealthRecordInclude;

export type HealthRecordDetail = Prisma.HealthRecordGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Null rather than throwing when the id belongs to another farm — callers 404. */
export async function getHealthRecord(
  farmId: string,
  id: string
): Promise<HealthRecordDetail | null> {
  return prisma.healthRecord.findFirst({ where: { id, farmId }, include: DETAIL_INCLUDE });
}

// ---------------------------------------------------------------------------
// Cross-module summary
// ---------------------------------------------------------------------------

export type AnimalHealthSummary = {
  animalId: string;
  totalRecords: number;
  ongoingCount: number;
  lastRecordAt: Date | null;
  lastDiagnosis: string | null;
  treatmentCostCents: number;
  vaccinationCount: number;
  lastVaccinationAt: Date | null;
  nextVaccinationDue: Date | null;
  withdrawal: WithdrawalStatus;
};

/**
 * One animal's health at a glance. Read by the animal profile, the breeding
 * screens and the sale flow, so it is deliberately cheap and returns plain
 * data rather than Prisma rows.
 */
export async function getAnimalHealthSummary(
  farmId: string,
  animalId: string,
  asOf: Date = new Date()
): Promise<AnimalHealthSummary> {
  const [records, vaccinations, medications] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { farmId, animalId },
      select: { recordedAt: true, diagnosis: true, outcome: true, costCents: true },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.vaccinationRecord.findMany({
      where: { animalId, animal: { farmId } },
      select: { administeredAt: true, nextDueDate: true },
      orderBy: { administeredAt: "desc" },
    }),
    prisma.medication.findMany({
      where: { healthRecord: { farmId, animalId } },
      select: WITHDRAWAL_MEDICATION_SELECT,
    }),
  ]);

  const medicationCost = await prisma.medication.aggregate({
    where: { healthRecord: { farmId, animalId } },
    _sum: { costCents: true },
  });

  const upcomingDue = vaccinations
    .map((v) => v.nextDueDate)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())
    .find((d) => d >= asOf);

  return {
    animalId,
    totalRecords: records.length,
    ongoingCount: records.filter((r) => r.outcome === "ONGOING").length,
    lastRecordAt: records[0]?.recordedAt ?? null,
    lastDiagnosis: records[0]?.diagnosis ?? null,
    treatmentCostCents:
      records.reduce((sum, r) => sum + r.costCents, 0) + (medicationCost._sum.costCents ?? 0),
    vaccinationCount: vaccinations.length,
    lastVaccinationAt: vaccinations[0]?.administeredAt ?? null,
    nextVaccinationDue: upcomingDue ?? null,
    withdrawal: computeWithdrawalStatus(medications, asOf),
  };
}

// ---------------------------------------------------------------------------
// "Needs attention" lists for the top of /health
// ---------------------------------------------------------------------------

export type OngoingTreatment = {
  recordId: string;
  animalId: string;
  tagNumber: string;
  animalName: string | null;
  penName: string | null;
  diagnosis: string;
  category: HealthCategory;
  severity: Severity;
  recordedAt: Date;
  daysOngoing: number;
};

export async function getOngoingTreatments(
  farmId: string,
  asOf: Date = new Date()
): Promise<OngoingTreatment[]> {
  const rows = await prisma.healthRecord.findMany({
    where: { farmId, outcome: "ONGOING", animal: { status: "ACTIVE" } },
    select: {
      id: true,
      recordedAt: true,
      diagnosis: true,
      category: true,
      severity: true,
      animal: {
        select: { id: true, tagNumber: true, name: true, pen: { select: { name: true } } },
      },
    },
    orderBy: [{ severity: "desc" }, { recordedAt: "asc" }],
  });

  return rows.flatMap((row) => {
    if (!row.animal) return [];
    return [{
    recordId: row.id,
    animalId: row.animal.id,
    tagNumber: row.animal.tagNumber,
    animalName: row.animal.name,
    penName: row.animal.pen?.name ?? null,
    diagnosis: row.diagnosis,
    category: row.category,
    severity: row.severity,
    recordedAt: row.recordedAt,
    daysOngoing: Math.max(0, daysBetween(row.recordedAt, asOf)),
    }];
  });
}

export type AnimalInWithdrawal = {
  animalId: string;
  tagNumber: string;
  animalName: string | null;
  penName: string | null;
  status: WithdrawalStatus;
};

/**
 * Animals that may not be sold or slaughtered right now. The same computation
 * the sale guard uses, surfaced as a list so it is visible before somebody
 * loads a lorry rather than at the moment the sale is refused.
 */
export async function getAnimalsInWithdrawal(
  farmId: string,
  asOf: Date = new Date()
): Promise<AnimalInWithdrawal[]> {
  const medications = await prisma.medication.findMany({
    where: {
      withdrawalDays: { gt: 0 },
      healthRecord: { farmId, animal: { status: "ACTIVE" } },
    },
    select: {
      ...WITHDRAWAL_MEDICATION_SELECT,
      healthRecord: {
        select: {
          animal: {
            select: { id: true, tagNumber: true, name: true, pen: { select: { name: true } } },
          },
        },
      },
    },
  });

  const byAnimal = new Map<
    string,
    { animal: { id: string; tagNumber: string; name: string | null; penName: string | null }; meds: WithdrawalMedication[] }
  >();

  for (const row of medications) {
      // A batch-level treatment has no individual animal. These aggregations
      // are per-animal by definition; flock health is reported on the batch
      // screens instead of being flattened into a headcount of one.
    const animal = row.healthRecord.animal;
    if (!animal) continue;
    const entry = byAnimal.get(animal.id) ?? {
      animal: { id: animal.id, tagNumber: animal.tagNumber, name: animal.name, penName: animal.pen?.name ?? null },
      meds: [],
    };
    entry.meds.push(row);
    byAnimal.set(animal.id, entry);
  }

  return [...byAnimal.values()]
    .map((entry) => ({
      animalId: entry.animal.id,
      tagNumber: entry.animal.tagNumber,
      animalName: entry.animal.name,
      penName: entry.animal.penName,
      status: computeWithdrawalStatus(entry.meds, asOf),
    }))
    .filter((row) => row.status.inWithdrawal)
    .sort(
      (a, b) =>
        (a.status.clearanceDate?.getTime() ?? 0) - (b.status.clearanceDate?.getTime() ?? 0)
    );
}

// ---------------------------------------------------------------------------
// Monitoring: morbidity, mortality, timeline, antibiotics, cost
// ---------------------------------------------------------------------------

export type MorbidityByPen = {
  penId: string | null;
  penName: string;
  herdCount: number;
  sickCount: number;
  rate: number;
};

export type MorbidityReport = {
  herdCount: number;
  sickCount: number;
  rate: number;
  byPen: MorbidityByPen[];
};

/** % of the ACTIVE herd carrying at least one ONGOING health record. */
export async function getMorbidity(farmId: string): Promise<MorbidityReport> {
  const animals = await prisma.animal.findMany({
    where: { farmId, status: "ACTIVE" },
    select: {
      id: true,
      pen: { select: { id: true, name: true } },
      healthRecords: { where: { outcome: "ONGOING" }, select: { id: true }, take: 1 },
    },
  });

  const pens = new Map<string, MorbidityByPen>();
  let sickCount = 0;

  for (const animal of animals) {
    const sick = animal.healthRecords.length > 0;
    if (sick) sickCount += 1;

    const key = animal.pen?.id ?? "__none__";
    const entry = pens.get(key) ?? {
      penId: animal.pen?.id ?? null,
      penName: animal.pen?.name ?? "Unassigned",
      herdCount: 0,
      sickCount: 0,
      rate: 0,
    };
    entry.herdCount += 1;
    if (sick) entry.sickCount += 1;
    pens.set(key, entry);
  }

  const byPen = [...pens.values()]
    .map((pen) => ({ ...pen, rate: pen.herdCount > 0 ? pen.sickCount / pen.herdCount : 0 }))
    .sort((a, b) => b.rate - a.rate || a.penName.localeCompare(b.penName));

  return {
    herdCount: animals.length,
    sickCount,
    rate: animals.length > 0 ? sickCount / animals.length : 0,
    byPen,
  };
}

export type MortalityEvent = {
  animalId: string;
  tagNumber: string;
  penName: string | null;
  date: Date;
  diagnosis: string | null;
  category: HealthCategory | null;
  healthRecordId: string | null;
};

export type MortalityReport = {
  events: MortalityEvent[];
  spike: MortalitySpike;
};

/**
 * Deaths from both sides: the health record whose outcome is DEATH, and the
 * animal marked DECEASED. Normally the same event recorded once — the entry
 * form writes both in one transaction — but an animal can be marked deceased
 * from the herd screens without a health record, and those deaths still count
 * towards a mortality spike.
 */
export async function getMortalityReport(
  farmId: string,
  { days = 180, asOf = new Date() }: { days?: number; asOf?: Date } = {}
): Promise<MortalityReport> {
  const since = addDays(asOf, -days);

  const [deathRecords, deceasedAnimals] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { farmId, outcome: "DEATH", recordedAt: { gte: since } },
      select: {
        id: true,
        recordedAt: true,
        diagnosis: true,
        category: true,
        animal: { select: { id: true, tagNumber: true, pen: { select: { name: true } } } },
      },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.animal.findMany({
      where: {
        farmId,
        status: "DECEASED",
        dateExit: { gte: since },
      },
      select: {
        id: true,
        tagNumber: true,
        dateExit: true,
        pen: { select: { name: true } },
      },
    }),
  ]);

  const events: MortalityEvent[] = deathRecords.flatMap((row) =>
    row.animal
      ? [{
          animalId: row.animal.id,
          tagNumber: row.animal.tagNumber,
          penName: row.animal.pen?.name ?? null,
          date: row.recordedAt,
          diagnosis: row.diagnosis,
          category: row.category,
          healthRecordId: row.id,
        }]
      : []
  );

  const seen = new Set(events.map((e) => e.animalId));
  for (const animal of deceasedAnimals) {
    if (seen.has(animal.id) || !animal.dateExit) continue;
    events.push({
      animalId: animal.id,
      tagNumber: animal.tagNumber,
      penName: animal.pen?.name ?? null,
      date: animal.dateExit,
      diagnosis: null,
      category: null,
      healthRecordId: null,
    });
  }

  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  const settings = await getFarmSettings(farmId);

  return {
    events,
    spike: detectMortalitySpike(
      events.map((e) => e.date),
      { windowDays: settings.outbreakWindowDays, asOf }
    ),
  };
}

export type TimelineBucket = { start: Date; label: string };
export type TimelineSeries = {
  diagnosis: string;
  category: HealthCategory;
  counts: number[];
  total: number;
};
export type DiseaseTimeline = {
  buckets: TimelineBucket[];
  series: TimelineSeries[];
  maxCount: number;
};

/**
 * Prevalence of each condition over time, bucketed by week. Returns counts
 * only — the SVG is drawn by the component, because a chart library would be
 * a large dependency for what is a polyline over ~12 points.
 */
export async function getDiseaseTimeline(
  farmId: string,
  { weeks = 12, topConditions = 6, asOf = new Date() }: { weeks?: number; topConditions?: number; asOf?: Date } = {}
): Promise<DiseaseTimeline> {
  const bucketStarts: Date[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) bucketStarts.push(addDays(startOfDay(asOf), -i * 7));
  const since = bucketStarts[0] ?? startOfDay(asOf);

  const rows = await prisma.healthRecord.findMany({
    where: { farmId, recordedAt: { gte: since }, recordType: { not: "VACCINATION" } },
    select: { recordedAt: true, diagnosis: true, category: true, animalId: true },
  });

  const totals = new Map<string, { category: HealthCategory; animals: Set<string> }>();
  for (const row of rows) {
    if (!row.animalId) continue;
    const entry = totals.get(row.diagnosis) ?? { category: row.category, animals: new Set<string>() };
    entry.animals.add(row.animalId);
    totals.set(row.diagnosis, entry);
  }

  const ranked = [...totals.entries()]
    .sort((a, b) => b[1].animals.size - a[1].animals.size)
    .slice(0, topConditions);

  const buckets: TimelineBucket[] = bucketStarts.map((start) => ({
    start,
    label: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
  }));

  let maxCount = 0;
  const series: TimelineSeries[] = ranked.map(([diagnosis, meta]) => {
    const counts = bucketStarts.map((start) => {
      const end = addDays(start, 7);
      const animals = new Set(
        rows
          .filter((r) => r.diagnosis === diagnosis && r.recordedAt >= start && r.recordedAt < end)
          .map((r) => r.animalId)
      );
      if (animals.size > maxCount) maxCount = animals.size;
      return animals.size;
    });
    return { diagnosis, category: meta.category, counts, total: meta.animals.size };
  });

  return { buckets, series, maxCount };
}

export type AntibioticUsagePoint = {
  label: string;
  start: Date;
  /** Medication courses started in the period. */
  courses: number;
  /** Distinct animals treated with an antibiotic in the period. */
  animals: number;
  costCents: number;
};

export type AntibioticUsage = {
  points: AntibioticUsagePoint[];
  totalCourses: number;
  totalAnimals: number;
  /** Antibiotic courses as a share of all medication courses. */
  shareOfAllMedications: number;
  topDrugs: { drugName: string; courses: number; animals: number }[];
  maxCourses: number;
};

/**
 * Antibiotic usage over time (§3.2 — resistance monitoring). Counts courses
 * and distinct animals separately: one long course on one animal and six short
 * courses on six animals are very different pictures of a herd.
 */
export async function getAntibioticUsage(
  farmId: string,
  { months = 6, asOf = new Date() }: { months?: number; asOf?: Date } = {}
): Promise<AntibioticUsage> {
  const starts: Date[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    starts.push(new Date(asOf.getFullYear(), asOf.getMonth() - i, 1));
  }
  const since = starts[0] ?? new Date(asOf.getFullYear(), asOf.getMonth(), 1);

  const medications = await prisma.medication.findMany({
    where: { healthRecord: { farmId }, startDate: { gte: since } },
    select: {
      drugName: true,
      isAntibiotic: true,
      startDate: true,
      costCents: true,
      healthRecord: { select: { animalId: true } },
    },
  });

  const antibiotics = medications.filter((m) => m.isAntibiotic);

  const points: AntibioticUsagePoint[] = starts.map((start, index) => {
    const end = starts[index + 1] ?? new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
    const inPeriod = antibiotics.filter((m) => m.startDate >= start && m.startDate < end);
    return {
      start,
      label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      courses: inPeriod.length,
      animals: new Set(inPeriod.map((m) => m.healthRecord.animalId)).size,
      costCents: inPeriod.reduce((sum, m) => sum + m.costCents, 0),
    };
  });

  const byDrug = new Map<string, { courses: number; animals: Set<string> }>();
  for (const medication of antibiotics) {
    const name = medication.drugName.trim();
    const entry = byDrug.get(name) ?? { courses: 0, animals: new Set<string>() };
    entry.courses += 1;
    if (medication.healthRecord.animalId) entry.animals.add(medication.healthRecord.animalId);
    byDrug.set(name, entry);
  }

  return {
    points,
    totalCourses: antibiotics.length,
    totalAnimals: new Set(antibiotics.map((m) => m.healthRecord.animalId)).size,
    shareOfAllMedications: medications.length > 0 ? antibiotics.length / medications.length : 0,
    topDrugs: [...byDrug.entries()]
      .map(([drugName, entry]) => ({
        drugName,
        courses: entry.courses,
        animals: entry.animals.size,
      }))
      .sort((a, b) => b.courses - a.courses)
      .slice(0, 6),
    maxCourses: points.reduce((max, point) => Math.max(max, point.courses), 0),
  };
}

export type CategoryCost = {
  category: HealthCategory;
  recordCount: number;
  animalCount: number;
  treatmentCostCents: number;
  medicationCostCents: number;
  totalCents: number;
};

/** Treatment cost by category — record cost plus the medications on it. */
export async function getTreatmentCostByCategory(
  farmId: string,
  { months = 12, asOf = new Date() }: { months?: number; asOf?: Date } = {}
): Promise<{ rows: CategoryCost[]; totalCents: number }> {
  const since = new Date(asOf.getFullYear(), asOf.getMonth() - (months - 1), 1);

  const records = await prisma.healthRecord.findMany({
    where: { farmId, recordedAt: { gte: since } },
    select: {
      category: true,
      costCents: true,
      animalId: true,
      medications: { select: { costCents: true } },
    },
  });

  const byCategory = new Map<HealthCategory, CategoryCost & { animals: Set<string> }>();

  for (const record of records) {
    const entry =
      byCategory.get(record.category) ??
      ({
        category: record.category,
        recordCount: 0,
        animalCount: 0,
        treatmentCostCents: 0,
        medicationCostCents: 0,
        totalCents: 0,
        animals: new Set<string>(),
      } as CategoryCost & { animals: Set<string> });

    entry.recordCount += 1;
    if (record.animalId) entry.animals.add(record.animalId);
    entry.treatmentCostCents += record.costCents;
    entry.medicationCostCents += record.medications.reduce((sum, m) => sum + m.costCents, 0);
    byCategory.set(record.category, entry);
  }

  const rows = [...byCategory.values()]
    .map(({ animals, ...rest }) => ({
      ...rest,
      animalCount: animals.size,
      totalCents: rest.treatmentCostCents + rest.medicationCostCents,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return { rows, totalCents: rows.reduce((sum, row) => sum + row.totalCents, 0) };
}

// ---------------------------------------------------------------------------
// Outbreak alerts
// ---------------------------------------------------------------------------

export type OutbreakReport = {
  alerts: OutbreakAlert[];
  caseThreshold: number;
  windowDays: number;
};

/** Fetches the window and hands it to the pure detectors in outbreak.ts. */
export async function getOutbreakReport(
  farmId: string,
  asOf: Date = new Date()
): Promise<OutbreakReport> {
  const settings = await getFarmSettings(farmId);
  const since = addDays(asOf, -settings.outbreakWindowDays);

  const rows = await prisma.healthRecord.findMany({
    where: {
      farmId,
      recordedAt: { gte: since, lte: asOf },
      recordType: { not: "VACCINATION" },
    },
    select: {
      diagnosis: true,
      category: true,
      recordedAt: true,
      animal: {
        select: { id: true, tagNumber: true, pen: { select: { id: true, name: true } } },
      },
    },
  });

  // Outbreak tracing is about which animals were affected and where they
  // live; a flock-level record names no individual to trace.
  const cases: OutbreakCase[] = rows.flatMap((row) => row.animal ? [{
    animalId: row.animal.id,
    tagNumber: row.animal.tagNumber,
    diagnosis: row.diagnosis,
    category: row.category,
    recordedAt: row.recordedAt,
    penId: row.animal.pen?.id ?? null,
    penName: row.animal.pen?.name ?? null,
  }] : []);

  const thresholds = {
    caseThreshold: settings.outbreakCaseThreshold,
    windowDays: settings.outbreakWindowDays,
  };

  const alerts = detectDiagnosisClusters(cases, thresholds, asOf);
  const reproductive = detectReproductiveFailureCluster(cases, thresholds, asOf);
  if (reproductive) alerts.push(reproductive);

  return { alerts, caseThreshold: thresholds.caseThreshold, windowDays: thresholds.windowDays };
}

// ---------------------------------------------------------------------------
// Vaccination
// ---------------------------------------------------------------------------

export type VaccinationListFilters = {
  animalId?: string | null;
  penId?: string | null;
  vaccineName?: string | null;
  lotNumber?: string | null;
  from?: Date | null;
  to?: Date | null;
};

const VACCINATION_SELECT = {
  id: true,
  vaccineName: true,
  administeredAt: true,
  lotNumber: true,
  veterinarian: true,
  nextDueDate: true,
  costCents: true,
  notes: true,
  protocolItem: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  animal: {
    select: { id: true, tagNumber: true, name: true, pen: { select: { id: true, name: true } } },
  },
} satisfies Prisma.VaccinationRecordSelect;

export type VaccinationListItem = Prisma.VaccinationRecordGetPayload<{
  select: typeof VACCINATION_SELECT;
}>;

export async function listVaccinationRecords(
  farmId: string,
  filters: VaccinationListFilters = {},
  limit: number = DEFAULT_LIST_LIMIT
): Promise<VaccinationListItem[]> {
  const where: Prisma.VaccinationRecordWhereInput = {
    animal: {
      farmId,
      ...(filters.penId ? { penId: filters.penId } : {}),
    },
  };

  if (filters.animalId) where.animalId = filters.animalId;
  if (filters.vaccineName)
    where.vaccineName = { contains: filters.vaccineName, mode: "insensitive" };
  if (filters.lotNumber) where.lotNumber = { contains: filters.lotNumber, mode: "insensitive" };
  if (filters.from || filters.to) {
    where.administeredAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
    };
  }

  return prisma.vaccinationRecord.findMany({
    where,
    select: VACCINATION_SELECT,
    orderBy: { administeredAt: "desc" },
    take: limit,
  });
}

export type ProtocolItem = {
  id: string;
  name: string;
  vaccineName: string;
  targetStage: LifeStage;
  ageDaysMin: number | null;
  ageDaysMax: number | null;
  boosterIntervalDays: number | null;
  notes: string | null;
  isActive: boolean;
  doseCount: number;
};

export async function listProtocolItems(
  farmId: string,
  { activeOnly = false }: { activeOnly?: boolean } = {}
): Promise<ProtocolItem[]> {
  const rows = await prisma.vaccinationProtocolItem.findMany({
    where: { farmId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ targetStage: "asc" }, { ageDaysMin: "asc" }, { name: "asc" }],
    include: { _count: { select: { records: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    vaccineName: row.vaccineName,
    targetStage: row.targetStage,
    ageDaysMin: row.ageDaysMin,
    ageDaysMax: row.ageDaysMax,
    boosterIntervalDays: row.boosterIntervalDays,
    notes: row.notes,
    isActive: row.isActive,
    doseCount: row._count.records,
  }));
}

export type VaccinationDueStatus = "OVERDUE" | "DUE" | "UPCOMING";

export type VaccinationObligation = {
  key: string;
  animalId: string;
  tagNumber: string;
  animalName: string | null;
  penId: string | null;
  penName: string;
  lifeStage: LifeStage;
  ageDays: number;
  protocolItemId: string;
  protocolName: string;
  vaccineName: string;
  /** True once the dose is owed — i.e. its window has opened. */
  required: boolean;
  /** True when a matching vaccination has been recorded. */
  satisfied: boolean;
  /** Date the dose became (or becomes) due. */
  dueDate: Date;
  /** End of the age window, where the protocol defines one. */
  dueWindowEnd: Date | null;
  status: VaccinationDueStatus;
  everAdministered: boolean;
  lastAdministeredAt: Date | null;
  isBooster: boolean;
};

/** How far ahead a not-yet-due dose is worth showing. */
export const UPCOMING_HORIZON_DAYS = 30;
/** Grace period before a booster counts as overdue rather than due. */
const BOOSTER_GRACE_DAYS = 14;

/**
 * Expands the standing protocol against the live herd.
 *
 * For every ACTIVE animal, its life stage is derived (never stored — see
 * src/lib/life-stage.ts) and matched against the protocol items targeting that
 * stage. Age-window items are due between `ageDaysMin` and `ageDaysMax` after
 * birth; booster items are due `boosterIntervalDays` after the last dose, and
 * immediately if the animal has never had one.
 *
 * Doses already given are returned too, with `satisfied: true` — the
 * compliance percentage is meaningless without the denominator.
 */
export async function getVaccinationObligations(
  farmId: string,
  asOf: Date = new Date()
): Promise<VaccinationObligation[]> {
  const [settings, protocol, parityByAnimal, animals] = await Promise.all([
    getFarmSettings(farmId),
    prisma.vaccinationProtocolItem.findMany({ where: { farmId, isActive: true } }),
    // Parity comes from the animals module so "how many litters has she had"
    // has exactly one definition in the codebase.
    getParityMap(farmId),
    prisma.animal.findMany({
      where: { farmId, status: "ACTIVE" },
      select: {
        id: true,
        tagNumber: true,
        name: true,
        sex: true,
        dateOfBirth: true,
        pen: { select: { id: true, name: true } },
        vaccinationRecords: {
          select: {
            protocolItemId: true,
            vaccineName: true,
            administeredAt: true,
          },
          orderBy: { administeredAt: "desc" },
        },
      },
    }),
  ]);

  if (protocol.length === 0) return [];

  const obligations: VaccinationObligation[] = [];

  for (const animal of animals) {
    const lifeStage = deriveLifeStage({
      dateOfBirth: animal.dateOfBirth,
      sex: animal.sex,
      parity: parityByAnimal.get(animal.id) ?? 0,
      weaningAgeDays: settings.weaningAgeDays,
      minBreedingAgeDays:
        animal.sex === "FEMALE" ? settings.minBreedingAgeDaysFemale : settings.minBreedingAgeDaysMale,
      asOf,
    });
    const age = ageInDays(animal.dateOfBirth, asOf);

    for (const item of protocol) {
      if (item.targetStage !== lifeStage) continue;

      const matches = animal.vaccinationRecords.filter(
        (record) =>
          record.protocolItemId === item.id ||
          (record.protocolItemId === null &&
            record.vaccineName.trim().toLowerCase() === item.vaccineName.trim().toLowerCase())
      );
      const lastAdministeredAt = matches[0]?.administeredAt ?? null;

      const base = {
        key: `${animal.id}:${item.id}`,
        animalId: animal.id,
        tagNumber: animal.tagNumber,
        animalName: animal.name,
        penId: animal.pen?.id ?? null,
        penName: animal.pen?.name ?? "Unassigned",
        lifeStage,
        ageDays: age,
        protocolItemId: item.id,
        protocolName: item.name,
        vaccineName: item.vaccineName,
        everAdministered: matches.length > 0,
        lastAdministeredAt,
      };

      if (item.boosterIntervalDays && item.boosterIntervalDays > 0) {
        const dueDate = lastAdministeredAt
          ? addDays(lastAdministeredAt, item.boosterIntervalDays)
          : startOfDay(asOf);
        const satisfied = dueDate > asOf;
        obligations.push({
          ...base,
          isBooster: true,
          // A booster is always owed once the animal is in the target stage;
          // it is *satisfied* while the last dose is still in date.
          required: true,
          satisfied,
          dueDate,
          dueWindowEnd: null,
          status: statusFor(dueDate, addDays(dueDate, BOOSTER_GRACE_DAYS), asOf),
        });
        continue;
      }

      if (item.ageDaysMin !== null) {
        const windowStart = addDays(startOfDay(animal.dateOfBirth), item.ageDaysMin);
        const windowEnd = addDays(
          startOfDay(animal.dateOfBirth),
          item.ageDaysMax ?? item.ageDaysMin
        );
        const required = asOf >= windowStart;
        obligations.push({
          ...base,
          isBooster: false,
          required,
          satisfied: matches.length > 0,
          dueDate: windowStart,
          dueWindowEnd: windowEnd,
          status: statusFor(windowStart, windowEnd, asOf),
        });
        continue;
      }

      // No age window and no booster interval: a one-off dose for the stage.
      obligations.push({
        ...base,
        isBooster: false,
        required: true,
        satisfied: matches.length > 0,
        dueDate: startOfDay(asOf),
        dueWindowEnd: null,
        status: "DUE",
      });
    }
  }

  return obligations;
}

function statusFor(dueStart: Date, dueEnd: Date, asOf: Date): VaccinationDueStatus {
  if (asOf > dueEnd) return "OVERDUE";
  if (asOf >= dueStart) return "DUE";
  return "UPCOMING";
}

export type VaccinationSchedule = {
  overdue: VaccinationObligation[];
  due: VaccinationObligation[];
  upcoming: VaccinationObligation[];
};

/** The three action lists, from the obligations that are not yet satisfied. */
export function splitSchedule(
  obligations: readonly VaccinationObligation[],
  horizonDays: number = UPCOMING_HORIZON_DAYS,
  asOf: Date = new Date()
): VaccinationSchedule {
  const outstanding = obligations.filter((o) => !o.satisfied);
  const horizon = addDays(asOf, horizonDays);
  const byDue = (a: VaccinationObligation, b: VaccinationObligation) =>
    a.dueDate.getTime() - b.dueDate.getTime() || a.tagNumber.localeCompare(b.tagNumber);

  return {
    overdue: outstanding.filter((o) => o.status === "OVERDUE").sort(byDue),
    due: outstanding.filter((o) => o.status === "DUE").sort(byDue),
    upcoming: outstanding
      .filter((o) => o.status === "UPCOMING" && o.dueDate <= horizon)
      .sort(byDue),
  };
}

export type ComplianceRow = {
  key: string;
  label: string;
  required: number;
  satisfied: number;
  overdue: number;
  rate: number;
};

/**
 * Coverage % by pen and by age group (§3.2 "Vaccination coverage % by pen/age
 * group"). The denominator is doses that are actually owed — counting doses
 * that are not due yet as failures would show a brand-new litter at 0%.
 */
export function summariseCompliance(obligations: readonly VaccinationObligation[]): {
  byPen: ComplianceRow[];
  byStage: ComplianceRow[];
  overall: ComplianceRow;
} {
  const required = obligations.filter((o) => o.required);

  const group = (keyOf: (o: VaccinationObligation) => { key: string; label: string }) => {
    const map = new Map<string, ComplianceRow>();
    for (const obligation of required) {
      const { key, label } = keyOf(obligation);
      const row = map.get(key) ?? { key, label, required: 0, satisfied: 0, overdue: 0, rate: 0 };
      row.required += 1;
      if (obligation.satisfied) row.satisfied += 1;
      if (!obligation.satisfied && obligation.status === "OVERDUE") row.overdue += 1;
      map.set(key, row);
    }
    return [...map.values()]
      .map((row) => ({ ...row, rate: row.required > 0 ? row.satisfied / row.required : 0 }))
      .sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label));
  };

  const satisfied = required.filter((o) => o.satisfied).length;

  return {
    byPen: group((o) => ({ key: o.penId ?? "__none__", label: o.penName })),
    byStage: group((o) => ({ key: o.lifeStage, label: o.lifeStage })),
    overall: {
      key: "__all__",
      label: "Whole herd",
      required: required.length,
      satisfied,
      overdue: required.filter((o) => !o.satisfied && o.status === "OVERDUE").length,
      rate: required.length > 0 ? satisfied / required.length : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Option lists for form selects
// ---------------------------------------------------------------------------

export type AnimalOption = {
  id: string;
  tagNumber: string;
  name: string | null;
  dateOfBirth: Date;
  penName: string | null;
};

export async function listAnimalOptions(
  farmId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Promise<AnimalOption[]> {
  const animals = await prisma.animal.findMany({
    where: { farmId, ...(includeInactive ? {} : { status: "ACTIVE" }) },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      dateOfBirth: true,
      pen: { select: { name: true } },
    },
    orderBy: { tagNumber: "asc" },
  });
  return animals.map((animal) => ({
    id: animal.id,
    tagNumber: animal.tagNumber,
    name: animal.name,
    dateOfBirth: animal.dateOfBirth,
    penName: animal.pen?.name ?? null,
  }));
}

export type PenOption = { id: string; name: string; activeCount: number };

export async function listPenOptions(farmId: string): Promise<PenOption[]> {
  const pens = await prisma.pen.findMany({
    where: { farmId, isActive: true },
    select: {
      id: true,
      name: true,
      _count: { select: { animals: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { name: "asc" },
  });
  return pens.map((pen) => ({ id: pen.id, name: pen.name, activeCount: pen._count.animals }));
}

// ---------------------------------------------------------------------------

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
