import "server-only";

import type { FarmSettings, PregnancyStatus, Sex } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { addDays, ageInDays, daysBetween } from "@/lib/format";
import {
  findMatchesForDam,
  type SireMatch,
} from "@/lib/breeding/match-finder";
import { classifyRelationship, loadPedigreeIndex } from "@/lib/breeding/pedigree";
import {
  createInbreedingCalculator,
  inbreedingBand,
  type InbreedingBand,
} from "@/lib/breeding/inbreeding";
import { getParityMap as animalsParityMap, getParityOf } from "@/lib/db/animals";

/**
 * Shared breeding queries. Everything the breeding screens read goes through
 * here, and other modules (feed rations, reports, alerts) read sow parity from
 * `getSowParity`/`getParityMap` rather than counting litters themselves —
 * parity decides a female's life stage, so two implementations of it would
 * eventually disagree about whether an animal is a gilt or a sow.
 *
 * Gestation is never hard-coded: every projected date reads
 * `FarmSettings.gestationDays` (114), and heat predictions read
 * `estrusCycleDays` (21). The requirements document conflates the two.
 */

/** Statuses that mean "this mating has not yet reached an outcome". */
export const OPEN_PREGNANCY_STATUSES: PregnancyStatus[] = ["PENDING", "CONFIRMED"];

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const animalSummarySelect = {
  id: true,
  tagNumber: true,
  name: true,
  breed: true,
  sex: true,
  status: true,
  dateOfBirth: true,
  currentWeightKg: true,
  // Carried on every breeding query so screens can say "kidding" to a goat
  // keeper and "farrowing" to a pig keeper without a second round trip.
  species: {
    select: {
      id: true,
      name: true,
      birthEventTerm: true,
      youngTerm: true,
      adultFemaleTerm: true,
      adultMaleTerm: true,
      groupTerm: true,
      gestationDays: true,
      typicalLitterSize: true,
    },
  },
} as const;

const litterSummarySelect = {
  id: true,
  farrowingDate: true,
  bornAlive: true,
  stillborn: true,
  mummified: true,
  weaningDate: true,
  weanedCount: true,
} as const;

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type BreedingListFilters = {
  /** A concrete status, or "OPEN" for everything still awaiting an outcome. */
  status?: PregnancyStatus | "OPEN" | null;
  damId?: string | null;
  sireId?: string | null;
  from?: Date | null;
  to?: Date | null;
};

export async function listBreedingRecords(
  farmId: string,
  filters: BreedingListFilters = {}
) {
  const { status, damId, sireId, from, to } = filters;

  return prisma.breedingRecord.findMany({
    where: {
      farmId,
      ...(status
        ? status === "OPEN"
          ? { pregnancyStatus: { in: OPEN_PREGNANCY_STATUSES } }
          : { pregnancyStatus: status }
        : {}),
      ...(damId ? { damId } : {}),
      ...(sireId ? { sireId } : {}),
      ...(from || to
        ? {
            breedingDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ breedingDate: "desc" }],
    select: {
      id: true,
      breedingDate: true,
      method: true,
      expectedFarrowingDate: true,
      pregnancyStatus: true,
      offspringInbreedingCoefficient: true,
      overrideReason: true,
      dam: { select: animalSummarySelect },
      sire: { select: animalSummarySelect },
      litter: { select: litterSummarySelect },
    },
  });
}

export type BreedingListRow = Awaited<ReturnType<typeof listBreedingRecords>>[number];

export async function getBreedingRecord(farmId: string, id: string) {
  return prisma.breedingRecord.findFirst({
    where: { id, farmId },
    select: {
      id: true,
      farmId: true,
      breedingDate: true,
      method: true,
      expectedFarrowingDate: true,
      pregnancyStatus: true,
      confirmationMethod: true,
      confirmationDate: true,
      expectedOffspringCount: true,
      abnormalitiesNoted: true,
      offspringInbreedingCoefficient: true,
      overrideReason: true,
      notes: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      dam: { select: { ...animalSummarySelect, penId: true, generation: true, inbreedingCoefficient: true } },
      sire: { select: { ...animalSummarySelect, generation: true, inbreedingCoefficient: true } },
      litter: {
        select: {
          ...litterSummarySelect,
          farrowingDurationMinutes: true,
          complications: true,
          vetInterventionRequired: true,
          colostrumIntakeObserved: true,
          postFarrowingCheckNotes: true,
          notes: true,
          offspring: {
            orderBy: { tagNumber: "asc" },
            select: {
              id: true,
              tagNumber: true,
              name: true,
              sex: true,
              status: true,
              birthWeightKg: true,
              markings: true,
              generation: true,
              inbreedingCoefficient: true,
            },
          },
        },
      },
    },
  });
}

export type BreedingRecordDetail = NonNullable<
  Awaited<ReturnType<typeof getBreedingRecord>>
>;

/** Active animals of one sex, for the dam/sire pickers and list filters. */
export async function listBreedingCandidates(farmId: string, sex: Sex) {
  return prisma.animal.findMany({
    where: { farmId, sex, status: "ACTIVE" },
    orderBy: { tagNumber: "asc" },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      breed: true,
      dateOfBirth: true,
      currentWeightKg: true,
    },
  });
}

export type BreedingCandidate = Awaited<
  ReturnType<typeof listBreedingCandidates>
>[number];

// ---------------------------------------------------------------------------
// Sow productivity (§2.5)
// ---------------------------------------------------------------------------

export type SowProductivity = {
  /** Litters farrowed. This is the animal's parity. */
  parity: number;
  /** Lifetime animals born, counting stillborn and mummified (LPB). */
  lifetimeAnimalsBorn: number;
  lifetimeBornAlive: number;
  /** Lifetime animals weaned (LPW). */
  lifetimeAnimalsWeaned: number;
  pigsBornPerLitter: number | null;
  pigsWeanedPerLitter: number | null;
  /** Mean days between consecutive farrowings. Null until a second litter. */
  farrowingIntervalDays: number | null;
  preWeaningMortality: number | null;
  lastFarrowingDate: Date | null;
  /** Open (PENDING/CONFIRMED) mating, if she is currently carrying. */
  openBreedingId: string | null;
};

export async function getSowProductivity(
  farmId: string,
  sowId: string
): Promise<SowProductivity> {
  const [litters, open] = await Promise.all([
    prisma.litter.findMany({
      where: { breedingRecord: { farmId, damId: sowId } },
      orderBy: { farrowingDate: "asc" },
      select: { farrowingDate: true, bornAlive: true, stillborn: true, mummified: true, weanedCount: true },
    }),
    prisma.breedingRecord.findFirst({
      where: { farmId, damId: sowId, pregnancyStatus: { in: OPEN_PREGNANCY_STATUSES } },
      orderBy: { breedingDate: "desc" },
      select: { id: true },
    }),
  ]);

  const parity = litters.length;
  const lifetimeBornAlive = sum(litters.map((l) => l.bornAlive));
  const lifetimeAnimalsBorn = sum(litters.map((l) => l.bornAlive + l.stillborn + l.mummified));

  const weanedLitters = litters.filter((l) => l.weanedCount !== null);
  const lifetimeAnimalsWeaned = sum(weanedLitters.map((l) => l.weanedCount ?? 0));

  // Farrowing interval is only meaningful once there are two farrowings to sit
  // between; reporting the age of a single litter as an "interval" would put a
  // meaningless number next to a real one.
  const intervals: number[] = [];
  for (let i = 1; i < litters.length; i++) {
    intervals.push(daysBetween(litters[i - 1].farrowingDate, litters[i].farrowingDate));
  }

  const weanedBase = sum(weanedLitters.map((l) => l.bornAlive));

  return {
    parity,
    lifetimeAnimalsBorn,
    lifetimeBornAlive,
    lifetimeAnimalsWeaned,
    pigsBornPerLitter: parity > 0 ? lifetimeAnimalsBorn / parity : null,
    pigsWeanedPerLitter: weanedLitters.length > 0 ? lifetimeAnimalsWeaned / weanedLitters.length : null,
    farrowingIntervalDays: intervals.length > 0 ? sum(intervals) / intervals.length : null,
    preWeaningMortality:
      weanedBase > 0 ? Math.max(0, (weanedBase - lifetimeAnimalsWeaned) / weanedBase) : null,
    lastFarrowingDate: litters.length > 0 ? litters[litters.length - 1].farrowingDate : null,
    openBreedingId: open?.id ?? null,
  };
}

/**
 * Parity for one female: the number of litters she has farrowed, and for a
 * whole herd at once.
 *
 * Both delegate to the animals module rather than counting litters again here.
 * Parity decides a female's life stage, her ration and her culling decision, so
 * a second implementation that drifted by one litter would quietly disagree
 * with the herd list about whether an animal is a gilt or a sow. These stay
 * exported from the breeding domain because this is where callers look for
 * them.
 */
export async function getSowParity(farmId: string, sowId: string): Promise<number> {
  return getParityOf(farmId, sowId);
}

export async function getParityMap(farmId: string): Promise<Map<string, number>> {
  return animalsParityMap(farmId);
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type CalendarEventKind =
  | "MATING"
  | "EXPECTED_FARROWING"
  | "ACTUAL_FARROWING"
  | "EXPECTED_WEANING";

export type CalendarEvent = {
  date: Date;
  kind: CalendarEventKind;
  breedingRecordId: string;
  damTag: string;
  sireTag: string;
  detail: string;
  /** Expected farrowing already past the tolerance window. */
  overdue: boolean;
};

/**
 * Every breeding event that falls inside [rangeStart, rangeEnd].
 *
 * The window is widened by the weaning age on the way into the query because a
 * weaning that lands in this month belongs to a farrowing that happened four
 * weeks before it.
 */
export async function listCalendarEvents(
  farmId: string,
  rangeStart: Date,
  rangeEnd: Date,
  settings: FarmSettings
): Promise<CalendarEvent[]> {
  const litterWindowStart = addDays(rangeStart, -settings.weaningAgeDays);

  const records = await prisma.breedingRecord.findMany({
    where: {
      farmId,
      OR: [
        { breedingDate: { gte: rangeStart, lte: rangeEnd } },
        { expectedFarrowingDate: { gte: rangeStart, lte: rangeEnd } },
        { litter: { farrowingDate: { gte: litterWindowStart, lte: rangeEnd } } },
      ],
    },
    select: {
      id: true,
      breedingDate: true,
      expectedFarrowingDate: true,
      pregnancyStatus: true,
      dam: { select: { tagNumber: true } },
      sire: { select: { tagNumber: true } },
      litter: { select: { farrowingDate: true, bornAlive: true, weaningDate: true, weanedCount: true } },
    },
  });

  const now = new Date();
  const overdueCutoff = addDays(now, -settings.gestationToleranceDays);
  const events: CalendarEvent[] = [];

  const push = (event: CalendarEvent) => {
    if (event.date >= rangeStart && event.date <= rangeEnd) events.push(event);
  };

  for (const record of records) {
    const base = {
      breedingRecordId: record.id,
      damTag: record.dam.tagNumber,
      sireTag: record.sire.tagNumber,
      overdue: false,
    };

    push({ ...base, date: record.breedingDate, kind: "MATING", detail: "Mated" });

    if (record.pregnancyStatus !== "FARROWED") {
      push({
        ...base,
        date: record.expectedFarrowingDate,
        kind: "EXPECTED_FARROWING",
        detail: "Farrowing due",
        overdue:
          OPEN_PREGNANCY_STATUSES.includes(record.pregnancyStatus) &&
          record.expectedFarrowingDate < overdueCutoff,
      });
    }

    if (record.litter) {
      push({
        ...base,
        date: record.litter.farrowingDate,
        kind: "ACTUAL_FARROWING",
        detail: `Farrowed — ${record.litter.bornAlive} born alive`,
      });

      // A recorded weaning replaces the projection; before that the projection
      // is what the farrowing house plans around.
      const weaningDate =
        record.litter.weaningDate ?? addDays(record.litter.farrowingDate, settings.weaningAgeDays);
      push({
        ...base,
        date: weaningDate,
        kind: "EXPECTED_WEANING",
        detail: record.litter.weaningDate
          ? `Weaned — ${record.litter.weanedCount ?? 0} offspring`
          : "Weaning due",
      });
    }
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ---------------------------------------------------------------------------
// "Attention now" panel
// ---------------------------------------------------------------------------

export type AttentionLists = {
  overdue: BreedingListRow[];
  dueThisWeek: BreedingListRow[];
  unconfirmed: BreedingListRow[];
  readyGilts: {
    id: string;
    tagNumber: string;
    name: string | null;
    breed: string;
    dateOfBirth: Date;
    currentWeightKg: number | null;
  }[];
};

export async function getBreedingAttention(
  farmId: string,
  settings: FarmSettings,
  now: Date = new Date()
): Promise<AttentionLists> {
  const overdueCutoff = addDays(now, -settings.gestationToleranceDays);
  const weekAhead = addDays(now, 7);
  // A sow mated more than one estrus cycle ago has had time to return to heat;
  // if nobody has confirmed her either way by now, that is a missed check.
  const confirmationCutoff = addDays(now, -settings.estrusCycleDays);
  const giltAgeCutoff = addDays(now, -settings.minBreedingAgeDaysFemale);

  const [overdue, dueThisWeek, unconfirmed, readyGilts] = await Promise.all([
    listOpenBreedings(farmId, { expectedFarrowingDate: { lt: overdueCutoff } }),
    listOpenBreedings(farmId, {
      expectedFarrowingDate: { gte: overdueCutoff, lte: weekAhead },
    }),
    prisma.breedingRecord
      .findMany({
        where: {
          farmId,
          pregnancyStatus: "PENDING",
          breedingDate: { lt: confirmationCutoff },
        },
        orderBy: { breedingDate: "asc" },
        select: openBreedingSelect,
      })
      .then((rows) => rows as BreedingListRow[]),
    prisma.animal.findMany({
      where: {
        farmId,
        sex: "FEMALE",
        status: "ACTIVE",
        dateOfBirth: { lte: giltAgeCutoff },
        currentWeightKg: { gte: settings.minBreedingWeightKg },
        breedingsAsDam: { none: {} },
      },
      orderBy: { dateOfBirth: "asc" },
      select: {
        id: true,
        tagNumber: true,
        name: true,
        breed: true,
        dateOfBirth: true,
        currentWeightKg: true,
      },
    }),
  ]);

  return { overdue, dueThisWeek, unconfirmed, readyGilts };
}

const openBreedingSelect = {
  id: true,
  breedingDate: true,
  method: true,
  expectedFarrowingDate: true,
  pregnancyStatus: true,
  offspringInbreedingCoefficient: true,
  overrideReason: true,
  dam: { select: animalSummarySelect },
  sire: { select: animalSummarySelect },
  litter: { select: litterSummarySelect },
} as const;

async function listOpenBreedings(
  farmId: string,
  where: { expectedFarrowingDate: { lt?: Date; gte?: Date; lte?: Date } }
): Promise<BreedingListRow[]> {
  const rows = await prisma.breedingRecord.findMany({
    where: {
      farmId,
      pregnancyStatus: { in: OPEN_PREGNANCY_STATUSES },
      ...where,
    },
    orderBy: { expectedFarrowingDate: "asc" },
    select: openBreedingSelect,
  });
  return rows as BreedingListRow[];
}

// ---------------------------------------------------------------------------
// Estrus
// ---------------------------------------------------------------------------

export async function listEstrusRecords(farmId: string, limit = 50) {
  return prisma.estrusRecord.findMany({
    // EstrusRecord has no farmId of its own — it is scoped through the sow.
    where: { sow: { farmId } },
    orderBy: { observedAt: "desc" },
    take: limit,
    select: {
      id: true,
      observedAt: true,
      signRestlessness: true,
      signSwollenVulva: true,
      signDischarge: true,
      signReceptive: true,
      durationHours: true,
      wasBred: true,
      notes: true,
      sow: { select: { id: true, tagNumber: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

export type EstrusRecordRow = Awaited<ReturnType<typeof listEstrusRecords>>[number];

export type EstrusWatchRow = {
  sowId: string;
  tagNumber: string;
  name: string | null;
  parity: number;
  lastObservedAt: Date | null;
  daysSinceObserved: number | null;
  predictedNextHeat: Date | null;
  /** True when she is carrying a litter — not cycling is expected, not a fault. */
  pregnant: boolean;
  /** Overdue by more than half a cycle beyond the expected return to heat. */
  notCycling: boolean;
};

/**
 * Every breeding-age female with her last observed heat and the next one
 * predicted from `settings.estrusCycleDays`.
 *
 * A sow that has silently stopped cycling is the fertility problem this screen
 * exists to catch, so females with *no* observation at all are included rather
 * than filtered out — an empty column is the finding.
 */
export async function getEstrusWatchlist(
  farmId: string,
  settings: FarmSettings,
  now: Date = new Date()
): Promise<EstrusWatchRow[]> {
  const ageCutoff = addDays(now, -settings.minBreedingAgeDaysFemale);

  const [females, latest, openBreedings, parityMap] = await Promise.all([
    prisma.animal.findMany({
      where: { farmId, sex: "FEMALE", status: "ACTIVE", dateOfBirth: { lte: ageCutoff } },
      orderBy: { tagNumber: "asc" },
      select: { id: true, tagNumber: true, name: true },
    }),
    prisma.estrusRecord.groupBy({
      by: ["sowId"],
      where: { sow: { farmId } },
      _max: { observedAt: true },
    }),
    prisma.breedingRecord.findMany({
      where: { farmId, pregnancyStatus: { in: OPEN_PREGNANCY_STATUSES } },
      select: { damId: true },
    }),
    getParityMap(farmId),
  ]);

  const lastBySow = new Map(latest.map((row) => [row.sowId, row._max.observedAt]));
  const pregnantIds = new Set(openBreedings.map((row) => row.damId));

  // Half a cycle of grace: heat detection is a twice-daily eyeball check, and
  // one missed observation should not raise an alarm on its own.
  const overdueAfterDays = Math.round(settings.estrusCycleDays * 1.5);

  return females.map((sow) => {
    const lastObservedAt = lastBySow.get(sow.id) ?? null;
    const pregnant = pregnantIds.has(sow.id);
    const daysSinceObserved = lastObservedAt ? daysBetween(lastObservedAt, now) : null;

    return {
      sowId: sow.id,
      tagNumber: sow.tagNumber,
      name: sow.name,
      parity: parityMap.get(sow.id) ?? 0,
      lastObservedAt,
      daysSinceObserved,
      predictedNextHeat: lastObservedAt
        ? addDays(lastObservedAt, settings.estrusCycleDays)
        : null,
      pregnant,
      notCycling:
        !pregnant && daysSinceObserved !== null && daysSinceObserved > overdueAfterDays,
    };
  });
}

// ---------------------------------------------------------------------------
// Mating constraint check
// ---------------------------------------------------------------------------

export type MatingCheck = {
  /** Non-empty means the mating must not be written, under any override. */
  blockers: string[];
  /** Written only with an explicit `overrideReason`. */
  warnings: string[];
  offspringInbreedingCoefficient: number | null;
  band: InbreedingBand | null;
  relationshipLabel: string | null;
  /** The match-finder row for this sire, when he is an eligible candidate. */
  match: SireMatch | null;
  dam: { id: string; tagNumber: string; name: string | null; breed: string } | null;
  sire: { id: string; tagNumber: string; name: string | null; breed: string } | null;
};

/**
 * Re-runs every breeding constraint server-side.
 *
 * The match finder's UI must never be the only thing between a user and a
 * full-sib mating: `/breeding/new` is a Server Action reachable by direct POST,
 * and the pairing may also have been queued in a browser tab left open since
 * before the boar was retired. The authority on hard constraints is
 * `findMatchesForDam` — the same engine the recommendations are drawn from —
 * plus the §8.1/§8.2 rules that are about the *record* rather than the
 * genetics (status, age, weight, repeat matings).
 */
export async function checkMating({
  farmId,
  damId,
  sireId,
  breedingDate,
  settings,
  excludeBreedingId,
}: {
  farmId: string;
  damId: string;
  sireId: string;
  breedingDate: Date;
  settings: FarmSettings;
  excludeBreedingId?: string;
}): Promise<MatingCheck> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const [dam, sire] = await Promise.all([
    prisma.animal.findFirst({
      where: { id: damId, farmId },
      select: { id: true, tagNumber: true, name: true, breed: true, sex: true, status: true, dateOfBirth: true, currentWeightKg: true, speciesId: true, species: { select: { name: true, purpose: true } } },
    }),
    prisma.animal.findFirst({
      where: { id: sireId, farmId },
      select: { id: true, tagNumber: true, name: true, breed: true, sex: true, status: true, dateOfBirth: true, currentWeightKg: true, speciesId: true, species: { select: { name: true, purpose: true } } },
    }),
  ]);

  if (!dam) blockers.push("The selected dam is not an animal on this farm.");
  if (!sire) blockers.push("The selected sire is not an animal on this farm.");

  // Cross-species matings are impossible, not merely inadvisable, so this is a
  // blocker rather than a warning. It is checked here and not only in the
  // match finder because this runs on the write path, and the finder is a
  // preview the browser never has to go through.
  if (dam && sire && dam.speciesId !== sire.speciesId) {
    blockers.push(
      `A ${dam.species.name.toLowerCase()} cannot be bred with a ${sire.species.name.toLowerCase()}.`
    );
  }

  // Working animals are not breeding stock for the farm's production herd.
  for (const animal of [dam, sire]) {
    if (animal && animal.species.purpose === "WORKING") {
      blockers.push(`${animal.tagNumber} is a working animal, not breeding stock.`);
    }
  }
  if (!dam || !sire) {
    return {
      blockers,
      warnings,
      offspringInbreedingCoefficient: null,
      band: null,
      relationshipLabel: null,
      match: null,
      dam: dam ? summarise(dam) : null,
      sire: sire ? summarise(sire) : null,
    };
  }

  // --- Animal-level rules (§8.1, §8.2) ---------------------------------
  if (dam.sex !== "FEMALE") blockers.push(`${dam.tagNumber} is not female and cannot be recorded as the dam.`);
  if (sire.sex !== "MALE") blockers.push(`${sire.tagNumber} is not male and cannot be recorded as the sire.`);
  if (dam.id === sire.id) blockers.push("An animal cannot be mated with itself.");

  if (dam.status !== "ACTIVE") {
    blockers.push(`${dam.tagNumber} is ${dam.status.toLowerCase()}, not active — she cannot be bred.`);
  }
  if (sire.status !== "ACTIVE") {
    blockers.push(`${sire.tagNumber} is ${sire.status.toLowerCase()}, not active — he cannot be used.`);
  }

  if (breedingDate.getTime() > Date.now()) {
    blockers.push("The breeding date cannot be in the future.");
  }
  if (breedingDate < dam.dateOfBirth || breedingDate < sire.dateOfBirth) {
    blockers.push("The breeding date is before one of the animals was born.");
  }

  const damAgeDays = ageInDays(dam.dateOfBirth, breedingDate);
  if (damAgeDays < settings.minBreedingAgeDaysFemale) {
    blockers.push(
      `${dam.tagNumber} would be ${damAgeDays} days old at mating — below the farm's minimum breeding age of ${settings.minBreedingAgeDaysFemale} days.`
    );
  }
  const sireAgeDays = ageInDays(sire.dateOfBirth, breedingDate);
  if (sireAgeDays < settings.minBreedingAgeDaysMale) {
    blockers.push(
      `${sire.tagNumber} would be ${sireAgeDays} days old at mating — below the farm's minimum breeding age of ${settings.minBreedingAgeDaysMale} days.`
    );
  }

  if (dam.currentWeightKg !== null && dam.currentWeightKg < settings.minBreedingWeightKg) {
    blockers.push(
      `${dam.tagNumber} weighs ${dam.currentWeightKg} kg — below the farm's minimum breeding weight of ${settings.minBreedingWeightKg} kg.`
    );
  } else if (dam.currentWeightKg === null) {
    warnings.push(`No weight on record for ${dam.tagNumber} — the minimum breeding weight could not be checked.`);
  }

  // --- Repeat mating inside a gestation period (§8.2) -------------------
  const gestationWindowStart = addDays(breedingDate, -settings.gestationDays);
  const gestationWindowEnd = addDays(breedingDate, settings.gestationDays);

  const repeat = await prisma.breedingRecord.findFirst({
    where: {
      farmId,
      damId,
      sireId,
      breedingDate: { gte: gestationWindowStart, lte: gestationWindowEnd },
      ...(excludeBreedingId ? { id: { not: excludeBreedingId } } : {}),
    },
    orderBy: { breedingDate: "desc" },
    select: { id: true, breedingDate: true },
  });

  if (repeat) {
    blockers.push(
      `This pair was already mated on ${repeat.breedingDate.toISOString().slice(0, 10)}, inside one ${settings.gestationDays}-day gestation period.`
    );
  }

  const openForDam = await prisma.breedingRecord.findFirst({
    where: {
      farmId,
      damId,
      pregnancyStatus: { in: OPEN_PREGNANCY_STATUSES },
      ...(excludeBreedingId ? { id: { not: excludeBreedingId } } : {}),
    },
    orderBy: { breedingDate: "desc" },
    select: { id: true, breedingDate: true, pregnancyStatus: true },
  });

  if (openForDam) {
    warnings.push(
      `${dam.tagNumber} already has an open mating from ${openForDam.breedingDate.toISOString().slice(0, 10)} (${openForDam.pregnancyStatus.toLowerCase()}). Close it off if this replaces it.`
    );
  }

  // --- Genetics: the match finder is the authority ----------------------
  let match: SireMatch | null = null;
  let f: number | null = null;
  let relationshipLabel: string | null = null;

  if (dam.sex === "FEMALE") {
    try {
      const result = await findMatchesForDam(farmId, damId, settings);
      match =
        result.matches.find((row) => row.sireId === sireId) ??
        result.excluded.find((row) => row.sireId === sireId) ??
        null;

      if (match) {
        blockers.push(...match.blockers);
        warnings.push(...match.warnings);
        f = match.inbreedingCoefficient;
        relationshipLabel = match.relationshipLabel;
      }
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : "Could not evaluate this pairing.");
    }
  }

  // A sire the match finder never considered (retired, sold, wrong sex) still
  // needs his relatedness shown, so fall back to the pedigree engine directly.
  if (f === null) {
    const index = await loadPedigreeIndex(farmId);
    const calculator = createInbreedingCalculator(index);
    f = calculator.offspringInbreeding(sireId, damId);
    relationshipLabel = classifyRelationship(index, sireId, damId).label;

    if (f > settings.maxInbreedingCoefficient) {
      blockers.push(
        `Inbreeding coefficient ${(f * 100).toFixed(1)}% exceeds the farm limit of ${(settings.maxInbreedingCoefficient * 100).toFixed(1)}%.`
      );
    }
  }

  return {
    blockers: dedupe(blockers),
    warnings: dedupe(warnings),
    offspringInbreedingCoefficient: f,
    band: inbreedingBand(f, settings.warnInbreedingCoefficient, settings.maxInbreedingCoefficient),
    relationshipLabel,
    match,
    dam: summarise(dam),
    sire: summarise(sire),
  };
}

// ---------------------------------------------------------------------------
// Offspring registration helpers
// ---------------------------------------------------------------------------

/**
 * Breed string for a litter: the parents' breed when they share one, otherwise
 * an explicit cross. `Animal.breed` is free text precisely so a farm can record
 * what it actually keeps, and silently inheriting the dam's breed would make a
 * crossbred litter look purebred in every report thereafter.
 */
export function offspringBreed(damBreed: string, sireBreed: string): string {
  return damBreed === sireBreed ? damBreed : `${damBreed} × ${sireBreed}`;
}

/**
 * Suggests `count` unused tag numbers of the form `DAM-YYMM-n`, skipping any
 * that already exist on the farm. Only a suggestion — every one of them is an
 * editable field on the farrowing form, because plenty of farms number their
 * animals from a book rather than from a scheme.
 */
export function offspringTagPrefix(damTagNumber: string, farrowingDate: Date): string {
  const stamp = `${String(farrowingDate.getFullYear()).slice(2)}${String(farrowingDate.getMonth() + 1).padStart(2, "0")}`;
  return `${damTagNumber}-${stamp}-`;
}

export async function suggestOffspringTags(
  farmId: string,
  damTagNumber: string,
  farrowingDate: Date,
  count: number
): Promise<string[]> {
  const prefix = offspringTagPrefix(damTagNumber, farrowingDate);

  const taken = new Set(
    (
      await prisma.animal.findMany({
        where: { farmId, tagNumber: { startsWith: prefix } },
        select: { tagNumber: true },
      })
    ).map((row) => row.tagNumber)
  );

  const tags: string[] = [];
  let next = 1;
  while (tags.length < count) {
    const candidate = `${prefix}${next}`;
    if (!taken.has(candidate)) tags.push(candidate);
    next += 1;
    if (next > count + taken.size + 100) break; // paranoia; never reached in practice
  }
  return tags;
}

/** Tag numbers from `tags` that already exist on the farm. */
export async function findTagCollisions(farmId: string, tags: string[]): Promise<string[]> {
  if (tags.length === 0) return [];
  const rows = await prisma.animal.findMany({
    where: { farmId, tagNumber: { in: tags } },
    select: { tagNumber: true },
  });
  return rows.map((row) => row.tagNumber);
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function summarise(animal: { id: string; tagNumber: string; name: string | null; breed: string }) {
  return { id: animal.id, tagNumber: animal.tagNumber, name: animal.name, breed: animal.breed };
}
