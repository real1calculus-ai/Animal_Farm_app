import "server-only";

import { Prisma } from "@prisma/client";
import type { TransactionCategory, TransactionDirection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recentMonths } from "@/lib/finance/period";
import type { ProfitabilityInputs } from "@/lib/finance/profitability";

/**
 * Shared finance queries. Like `src/lib/db/animals.ts`, every export takes an
 * explicit `farmId` first — the caller has already resolved it with
 * `getActiveFarmId(user)`, and a helper that picked its own farm would be the
 * easiest possible way to leak one tenant's P&L into another's screen.
 *
 * The dashboard and reports modules read from here too, so the exports are
 * named for what they answer rather than for the screen that first needed
 * them.
 */

export type PrismaLike = Prisma.TransactionClient;

/**
 * Farm-level expenses: real costs that no single animal can be held
 * responsible for. Used by the profitability screen to keep overheads out of
 * per-animal cost and in their own disclosed line.
 */
export const OVERHEAD_CATEGORIES: TransactionCategory[] = [
  "LABOR",
  "UTILITIES",
  "HOUSING",
  "EQUIPMENT",
  "MARKETING",
  "OTHER_EXPENSE",
];

/**
 * Categories a person may create or edit by hand. Everything else is written
 * by the module that owns the underlying record (feed deliveries, health
 * treatments, animal sales), and editing the ledger copy directly would put it
 * out of step with its source.
 */
export const MANUAL_CATEGORIES: TransactionCategory[] = [
  "LABOR",
  "UTILITIES",
  "HOUSING",
  "BEDDING",
  "TRANSPORT",
  "MARKETING",
  "BREEDING",
  "OTHER_EXPENSE",
  "SERVICE_INCOME",
  "OTHER_INCOME",
];

// ---------------------------------------------------------------------------
// Period summaries
// ---------------------------------------------------------------------------

export type PeriodSummary = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  transactionCount: number;
};

/** Income, expense and net for `[start, end)`. */
export async function getPeriodSummary(
  farmId: string,
  start: Date,
  end: Date
): Promise<PeriodSummary> {
  const rows = await prisma.financialTransaction.groupBy({
    by: ["direction"],
    where: { farmId, occurredAt: { gte: start, lt: end } },
    _sum: { amountCents: true },
    _count: { _all: true },
  });

  let incomeCents = 0;
  let expenseCents = 0;
  let transactionCount = 0;

  for (const row of rows) {
    const sum = row._sum.amountCents ?? 0;
    transactionCount += row._count._all;
    if (row.direction === "INCOME") incomeCents += sum;
    else expenseCents += sum;
  }

  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents, transactionCount };
}

export type CategoryTotal = {
  category: TransactionCategory;
  amountCents: number;
  count: number;
};

/** Totals per category on one side of the ledger, largest first. */
export async function getCategoryBreakdown(
  farmId: string,
  start: Date,
  end: Date,
  direction: TransactionDirection
): Promise<CategoryTotal[]> {
  const rows = await prisma.financialTransaction.groupBy({
    by: ["category"],
    where: { farmId, direction, occurredAt: { gte: start, lt: end } },
    _sum: { amountCents: true },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({
      category: row.category,
      amountCents: row._sum.amountCents ?? 0,
      count: row._count._all,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export type MonthlyPoint = {
  label: string;
  start: Date;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
};

/**
 * Month-by-month income and expense for the trend strip.
 *
 * One query for the whole window, bucketed in memory, rather than one query
 * per month: twelve round trips to render a sparkline is the kind of thing
 * that only shows up as slow once the ledger has a few years in it.
 */
export async function getMonthlyTrend(
  farmId: string,
  months = 6,
  now: Date = new Date()
): Promise<MonthlyPoint[]> {
  const buckets = recentMonths(months, now);
  if (buckets.length === 0) return [];

  const windowStart = buckets[0].start;
  const windowEnd = buckets[buckets.length - 1].end;

  const rows = await prisma.financialTransaction.findMany({
    where: { farmId, occurredAt: { gte: windowStart, lt: windowEnd } },
    select: { occurredAt: true, direction: true, amountCents: true },
  });

  const points: MonthlyPoint[] = buckets.map((bucket) => ({
    label: bucket.label,
    start: bucket.start,
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
  }));

  for (const row of rows) {
    const at = row.occurredAt.getTime();
    const index = buckets.findIndex((b) => at >= b.start.getTime() && at < b.end.getTime());
    if (index === -1) continue;
    if (row.direction === "INCOME") points[index].incomeCents += row.amountCents;
    else points[index].expenseCents += row.amountCents;
  }

  for (const point of points) {
    point.netCents = point.incomeCents - point.expenseCents;
  }

  return points;
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

const transactionSelect = {
  id: true,
  occurredAt: true,
  direction: true,
  category: true,
  amountCents: true,
  description: true,
  pigId: true,
  feedBatchId: true,
  healthRecordId: true,
  animalSaleId: true,
  equipmentId: true,
  createdAt: true,
  pig: { select: { id: true, tagNumber: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.FinancialTransactionSelect;

export type TransactionRow = Prisma.FinancialTransactionGetPayload<{
  select: typeof transactionSelect;
}>;

export type TransactionFilters = {
  direction?: TransactionDirection;
  category?: TransactionCategory;
  start?: Date;
  end?: Date;
  pigId?: string;
  /** Substring match on the description. */
  search?: string;
};

export function buildTransactionWhere(
  farmId: string,
  filters: TransactionFilters
): Prisma.FinancialTransactionWhereInput {
  const where: Prisma.FinancialTransactionWhereInput = { farmId };

  if (filters.direction) where.direction = filters.direction;
  if (filters.category) where.category = filters.category;
  if (filters.pigId) where.pigId = filters.pigId;
  if (filters.search) {
    where.description = { contains: filters.search, mode: "insensitive" };
  }
  if (filters.start || filters.end) {
    where.occurredAt = {
      ...(filters.start ? { gte: filters.start } : {}),
      ...(filters.end ? { lt: filters.end } : {}),
    };
  }

  return where;
}

export async function listTransactions(
  farmId: string,
  filters: TransactionFilters = {},
  limit = 200
): Promise<TransactionRow[]> {
  return prisma.financialTransaction.findMany({
    where: buildTransactionWhere(farmId, filters),
    select: transactionSelect,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

/** Income/expense totals for exactly the filtered set, for the ledger footer. */
export async function sumTransactions(
  farmId: string,
  filters: TransactionFilters = {}
): Promise<PeriodSummary> {
  const rows = await prisma.financialTransaction.groupBy({
    by: ["direction"],
    where: buildTransactionWhere(farmId, filters),
    _sum: { amountCents: true },
    _count: { _all: true },
  });

  let incomeCents = 0;
  let expenseCents = 0;
  let transactionCount = 0;
  for (const row of rows) {
    transactionCount += row._count._all;
    if (row.direction === "INCOME") incomeCents += row._sum.amountCents ?? 0;
    else expenseCents += row._sum.amountCents ?? 0;
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents, transactionCount };
}

export async function getTransaction(farmId: string, id: string) {
  return prisma.financialTransaction.findFirst({
    where: { id, farmId },
    select: transactionSelect,
  });
}

/**
 * True when another module wrote this row. Such rows mirror a feed delivery, a
 * health record or a sale, and editing the mirror would leave the ledger
 * disagreeing with the record it came from — the UI sends the user to the
 * source instead.
 */
export function isGeneratedRow(row: {
  feedBatchId: string | null;
  healthRecordId: string | null;
  animalSaleId: string | null;
  equipmentId: string | null;
}): boolean {
  return Boolean(
    row.feedBatchId || row.healthRecordId || row.animalSaleId || row.equipmentId
  );
}

export type Provenance = {
  kind: "FEED" | "HEALTH" | "SALE" | "EQUIPMENT";
  label: string;
  href: string | null;
};

/**
 * Resolves the provenance links on a page of ledger rows into something
 * displayable.
 *
 * `feedBatchId`, `healthRecordId` and `equipmentId` are bare scalar columns
 * with no Prisma relation declared on `FinancialTransaction`, so they cannot
 * be `include`d — they are looked up in one batched query each instead. (Noted
 * as a schema gap: declaring the relations would make this an include.)
 */
export async function resolveProvenance(
  rows: TransactionRow[]
): Promise<Map<string, Provenance>> {
  const feedBatchIds = [...new Set(rows.map((r) => r.feedBatchId).filter(Boolean))] as string[];
  const healthRecordIds = [
    ...new Set(rows.map((r) => r.healthRecordId).filter(Boolean)),
  ] as string[];
  const equipmentIds = [...new Set(rows.map((r) => r.equipmentId).filter(Boolean))] as string[];
  const saleIds = [...new Set(rows.map((r) => r.animalSaleId).filter(Boolean))] as string[];

  const [batches, healthRecords, equipment, sales] = await Promise.all([
    feedBatchIds.length
      ? prisma.feedBatch.findMany({
          where: { id: { in: feedBatchIds } },
          select: { id: true, batchCode: true, feedType: { select: { name: true } } },
        })
      : Promise.resolve([]),
    healthRecordIds.length
      ? prisma.healthRecord.findMany({
          where: { id: { in: healthRecordIds } },
          select: { id: true, diagnosis: true, pigId: true },
        })
      : Promise.resolve([]),
    equipmentIds.length
      ? prisma.equipment.findMany({
          where: { id: { in: equipmentIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    saleIds.length
      ? prisma.animalSale.findMany({
          where: { id: { in: saleIds } },
          select: { id: true, buyerName: true },
        })
      : Promise.resolve([]),
  ]);

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const healthById = new Map(healthRecords.map((h) => [h.id, h]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const saleById = new Map(sales.map((s) => [s.id, s]));

  const result = new Map<string, Provenance>();

  for (const row of rows) {
    if (row.feedBatchId) {
      const batch = batchById.get(row.feedBatchId);
      result.set(row.id, {
        kind: "FEED",
        label: batch ? `Feed batch ${batch.batchCode} (${batch.feedType.name})` : "Feed delivery",
        href: "/feed",
      });
    } else if (row.healthRecordId) {
      const record = healthById.get(row.healthRecordId);
      result.set(row.id, {
        kind: "HEALTH",
        label: record ? `Health record — ${record.diagnosis}` : "Health record",
        href: record ? `/animals/${record.pigId}` : "/health",
      });
    } else if (row.animalSaleId) {
      const sale = saleById.get(row.animalSaleId);
      result.set(row.id, {
        kind: "SALE",
        label: sale ? `Sale to ${sale.buyerName}` : "Animal sale",
        href: `/finance/sales/${row.animalSaleId}`,
      });
    } else if (row.equipmentId) {
      const item = equipmentById.get(row.equipmentId);
      result.set(row.id, {
        kind: "EQUIPMENT",
        label: item ? `Equipment — ${item.name}` : "Equipment",
        href: `/equipment/${row.equipmentId}`,
      });
    }
  }

  return result;
}

/** Animals with a ledger row against them, for the transactions filter. */
export async function listAnimalsWithTransactions(farmId: string) {
  const rows = await prisma.financialTransaction.findMany({
    where: { farmId, pigId: { not: null } },
    select: { pig: { select: { id: true, tagNumber: true, name: true } } },
    distinct: ["pigId"],
    orderBy: { occurredAt: "desc" },
    take: 300,
  });

  return rows
    .map((row) => row.pig)
    .filter((pig): pig is { id: string; tagNumber: string; name: string | null } => pig !== null)
    .sort((a, b) => a.tagNumber.localeCompare(b.tagNumber, undefined, { numeric: true }));
}

// ---------------------------------------------------------------------------
// Animal sales
// ---------------------------------------------------------------------------

const saleListSelect = {
  id: true,
  soldAt: true,
  saleType: true,
  buyerName: true,
  buyerContact: true,
  totalCents: true,
  notes: true,
  createdBy: { select: { name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.AnimalSaleSelect;

export type SaleListRow = Prisma.AnimalSaleGetPayload<{ select: typeof saleListSelect }>;

export async function listAnimalSales(
  farmId: string,
  range?: { start: Date; end: Date },
  limit = 100
): Promise<SaleListRow[]> {
  return prisma.animalSale.findMany({
    where: {
      farmId,
      ...(range ? { soldAt: { gte: range.start, lt: range.end } } : {}),
    },
    select: saleListSelect,
    orderBy: { soldAt: "desc" },
    take: limit,
  });
}

export async function getAnimalSale(farmId: string, id: string) {
  return prisma.animalSale.findFirst({
    where: { id, farmId },
    include: {
      items: {
        include: {
          pig: { select: { id: true, tagNumber: true, name: true, breed: true, sex: true } },
        },
      },
      createdBy: { select: { name: true } },
      transactions: { select: { id: true, category: true, amountCents: true } },
    },
  });
}

/**
 * Animals that could appear on a sale: alive, on this farm, not already sold.
 * The withdrawal check is applied on top of this at sale time — it depends on
 * the sale date, which is not known here.
 */
export async function listSellableAnimals(farmId: string) {
  return prisma.pig.findMany({
    where: { farmId, status: "ACTIVE" },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      breed: true,
      sex: true,
      dateOfBirth: true,
      currentWeightKg: true,
      pen: { select: { name: true } },
    },
    orderBy: { tagNumber: "asc" },
  });
}

/** Mean realised price per kg over recent sales, for projected break-even. */
export async function getAverageSalePricePerKgCents(
  farmId: string,
  since?: Date
): Promise<number | null> {
  const items = await prisma.animalSaleItem.findMany({
    where: {
      sale: { farmId, ...(since ? { soldAt: { gte: since } } : {}) },
    },
    select: { pricePerKgCents: true },
    take: 500,
    orderBy: { sale: { soldAt: "desc" } },
  });

  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + item.pricePerKgCents, 0);
  return Math.round(total / items.length);
}

// ---------------------------------------------------------------------------
// Profitability inputs
// ---------------------------------------------------------------------------

/**
 * Assembles everything `computeProfitability` needs in one place.
 *
 * The animal set is scoped by the analysis window — animals sold inside it,
 * plus animals still on the farm — but their *costs* are gathered over each
 * animal's whole life, because "cost per pig from birth to sale" (§3.4) is a
 * lifetime figure and clipping it to the window would understate every animal
 * that was born before the period started.
 */
export async function getProfitabilityInputs(
  farmId: string,
  window: { start: Date; end: Date },
  asOf: Date = new Date()
): Promise<ProfitabilityInputs> {
  const pigRows = await prisma.pig.findMany({
    where: {
      farmId,
      OR: [
        { status: "ACTIVE" },
        { saleItems: { some: { sale: { soldAt: { gte: window.start, lt: window.end } } } } },
      ],
    },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      breed: true,
      sex: true,
      status: true,
      dateOfBirth: true,
      dateAcquired: true,
      dateExit: true,
      acquisitionCostCents: true,
      birthWeightKg: true,
      currentWeightKg: true,
      penId: true,
      dateMovedIn: true,
      motherId: true,
      fatherId: true,
      pen: { select: { name: true } },
      mother: { select: { tagNumber: true } },
      father: { select: { tagNumber: true } },
    },
  });

  const pigIds = pigRows.map((p) => p.id);
  if (pigIds.length === 0) {
    return {
      pigs: [],
      movements: [],
      health: [],
      feeding: [],
      saleItems: [],
      ledger: [],
      overheadCents: 0,
      assumedPricePerKgCents: null,
      asOf,
    };
  }

  const penIds = [...new Set(pigRows.map((p) => p.penId).filter(Boolean))] as string[];

  const [movements, healthRecords, feeding, saleItems, ledger, overhead, avgPrice] =
    await Promise.all([
      prisma.penMovement.findMany({
        where: { pigId: { in: pigIds } },
        select: { pigId: true, penId: true, movedAt: true },
        orderBy: { movedAt: "asc" },
      }),
      prisma.healthRecord.findMany({
        where: { farmId, pigId: { in: pigIds } },
        select: {
          pigId: true,
          recordedAt: true,
          costCents: true,
          medications: { select: { costCents: true } },
        },
      }),
      prisma.feedingRecord.findMany({
        where: {
          farmId,
          OR: [
            { pigId: { in: pigIds } },
            ...(penIds.length ? [{ penId: { in: penIds }, pigId: null }] : []),
          ],
        },
        select: {
          fedAt: true,
          pigId: true,
          penId: true,
          animalCount: true,
          allocatedKg: true,
          consumedKg: true,
          costPerKgCents: true,
        },
      }),
      prisma.animalSaleItem.findMany({
        where: { pigId: { in: pigIds }, sale: { farmId } },
        select: {
          pigId: true,
          weightKg: true,
          pricePerKgCents: true,
          amountCents: true,
          saleId: true,
          sale: { select: { soldAt: true } },
        },
      }),
      prisma.financialTransaction.findMany({
        where: { farmId, direction: "EXPENSE", pigId: { in: pigIds } },
        select: {
          pigId: true,
          occurredAt: true,
          category: true,
          amountCents: true,
          healthRecordId: true,
          feedBatchId: true,
          animalSaleId: true,
        },
      }),
      prisma.financialTransaction.aggregate({
        where: {
          farmId,
          direction: "EXPENSE",
          pigId: null,
          category: { in: OVERHEAD_CATEGORIES },
          occurredAt: { gte: window.start, lt: window.end },
        },
        _sum: { amountCents: true },
      }),
      getAverageSalePricePerKgCents(farmId, window.start),
    ]);

  return {
    pigs: pigRows.map((p) => ({
      id: p.id,
      tagNumber: p.tagNumber,
      name: p.name,
      breed: p.breed,
      sex: p.sex,
      status: p.status,
      dateOfBirth: p.dateOfBirth,
      dateAcquired: p.dateAcquired,
      dateExit: p.dateExit,
      acquisitionCostCents: p.acquisitionCostCents,
      birthWeightKg: p.birthWeightKg,
      currentWeightKg: p.currentWeightKg,
      penId: p.penId,
      penName: p.pen?.name ?? null,
      dateMovedIn: p.dateMovedIn,
      motherId: p.motherId,
      motherTag: p.mother?.tagNumber ?? null,
      fatherId: p.fatherId,
      fatherTag: p.father?.tagNumber ?? null,
    })),
    movements,
    health: healthRecords.map((h) => ({
      pigId: h.pigId,
      recordedAt: h.recordedAt,
      costCents: h.costCents,
      medicationCents: h.medications.reduce((sum, m) => sum + m.costCents, 0),
    })),
    feeding,
    saleItems: saleItems.map((item) => ({
      pigId: item.pigId,
      soldAt: item.sale.soldAt,
      weightKg: item.weightKg,
      pricePerKgCents: item.pricePerKgCents,
      amountCents: item.amountCents,
      saleId: item.saleId,
    })),
    ledger: ledger.map((row) => ({
      pigId: row.pigId as string,
      occurredAt: row.occurredAt,
      category: row.category,
      amountCents: row.amountCents,
      healthRecordId: row.healthRecordId,
      feedBatchId: row.feedBatchId,
      animalSaleId: row.animalSaleId,
    })),
    overheadCents: overhead._sum.amountCents ?? 0,
    assumedPricePerKgCents: avgPrice,
    asOf,
  };
}
