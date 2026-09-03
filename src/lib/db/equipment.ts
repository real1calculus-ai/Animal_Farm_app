import "server-only";

import { Prisma } from "@prisma/client";
import type { EquipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { depreciate, totalAssetValue, type Depreciation } from "@/lib/finance/depreciation";

/**
 * Equipment and maintenance queries.
 *
 * Depreciation and the "due for maintenance" state are both derived at read
 * time from the purchase and maintenance records rather than stored. A stored
 * book value is stale the day after it is written, and a stored `isDue` flag
 * needs a scheduled job to stay honest — which this app does not have.
 */

export type PrismaLike = Prisma.TransactionClient;

/** How far ahead a maintenance due date counts as "due soon" rather than "later". */
export const DUE_SOON_DAYS = 30;

const equipmentSelect = {
  id: true,
  name: true,
  category: true,
  serialNumber: true,
  location: true,
  purchaseDate: true,
  purchaseCostCents: true,
  expectedLifeMonths: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EquipmentSelect;

export type EquipmentRecord = Prisma.EquipmentGetPayload<{ select: typeof equipmentSelect }>;

export type MaintenanceState = "OVERDUE" | "DUE_SOON" | "SCHEDULED" | "NONE";

export type EquipmentRow = EquipmentRecord & {
  depreciation: Depreciation;
  lastMaintenanceAt: Date | null;
  nextDueAt: Date | null;
  maintenanceState: MaintenanceState;
  maintenanceCostCents: number;
  /** Past its expected life — the age-based replacement flag (§3.5). */
  replacementDue: boolean;
};

function maintenanceState(nextDueAt: Date | null, asOf: Date): MaintenanceState {
  if (!nextDueAt) return "NONE";
  if (nextDueAt < asOf) return "OVERDUE";
  const soon = new Date(asOf.getTime() + DUE_SOON_DAYS * 86_400_000);
  return nextDueAt <= soon ? "DUE_SOON" : "SCHEDULED";
}

/**
 * Every item with its book value and maintenance state.
 *
 * Maintenance history is fetched once for the whole list and reduced in
 * memory — the alternative, a `_max` aggregate per item, is one query per row.
 */
export async function listEquipment(
  farmId: string,
  options: { status?: EquipmentStatus; asOf?: Date } = {}
): Promise<EquipmentRow[]> {
  const asOf = options.asOf ?? new Date();

  const items = await prisma.equipment.findMany({
    where: { farmId, ...(options.status ? { status: options.status } : {}) },
    select: equipmentSelect,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  if (items.length === 0) return [];

  const records = await prisma.maintenanceRecord.findMany({
    where: { equipmentId: { in: items.map((item) => item.id) } },
    select: { equipmentId: true, performedAt: true, nextDueAt: true, costCents: true },
    orderBy: { performedAt: "desc" },
  });

  const lastByItem = new Map<string, Date>();
  const nextByItem = new Map<string, Date>();
  const costByItem = new Map<string, number>();

  for (const record of records) {
    if (!lastByItem.has(record.equipmentId)) {
      lastByItem.set(record.equipmentId, record.performedAt);
    }
    costByItem.set(
      record.equipmentId,
      (costByItem.get(record.equipmentId) ?? 0) + record.costCents
    );
    // The soonest outstanding due date wins — an overdue inspection should not
    // be hidden behind a service scheduled for next year.
    if (record.nextDueAt) {
      const current = nextByItem.get(record.equipmentId);
      if (!current || record.nextDueAt < current) {
        nextByItem.set(record.equipmentId, record.nextDueAt);
      }
    }
  }

  return items.map((item) => {
    const depreciation = depreciate(item, asOf);
    const nextDueAt = nextByItem.get(item.id) ?? null;

    return {
      ...item,
      depreciation,
      lastMaintenanceAt: lastByItem.get(item.id) ?? null,
      nextDueAt,
      maintenanceState: maintenanceState(nextDueAt, asOf),
      maintenanceCostCents: costByItem.get(item.id) ?? 0,
      // A retired item is not awaiting replacement; it has already been dealt with.
      replacementDue: depreciation.fullyDepreciated && item.status !== "RETIRED",
    };
  });
}

export type EquipmentSummary = {
  itemCount: number;
  inService: number;
  needsRepair: number;
  retired: number;
  purchaseCostCents: number;
  bookValueCents: number;
  accumulatedDepreciationCents: number;
  maintenanceOverdue: number;
  maintenanceDueSoon: number;
  replacementDue: number;
};

/** Asset totals and alert counts. Read by the dashboard and reports too. */
export async function getEquipmentSummary(
  farmId: string,
  asOf?: Date
): Promise<EquipmentSummary> {
  const items = await listEquipment(farmId, { asOf });
  // Retired assets are excluded from the balance: they are off the books.
  const onBooks = items.filter((item) => item.status !== "RETIRED");
  const totals = totalAssetValue(onBooks, asOf);

  return {
    itemCount: items.length,
    inService: items.filter((item) => item.status === "IN_SERVICE").length,
    needsRepair: items.filter((item) => item.status === "NEEDS_REPAIR").length,
    retired: items.filter((item) => item.status === "RETIRED").length,
    purchaseCostCents: totals.purchaseCostCents,
    bookValueCents: totals.bookValueCents,
    accumulatedDepreciationCents: totals.accumulatedCents,
    maintenanceOverdue: items.filter((item) => item.maintenanceState === "OVERDUE").length,
    maintenanceDueSoon: items.filter((item) => item.maintenanceState === "DUE_SOON").length,
    replacementDue: items.filter((item) => item.replacementDue).length,
  };
}

/** Items with maintenance overdue or falling due inside `DUE_SOON_DAYS`. */
export async function listMaintenanceDue(
  farmId: string,
  asOf?: Date
): Promise<EquipmentRow[]> {
  const items = await listEquipment(farmId, { asOf });
  return items
    .filter(
      (item) =>
        item.status !== "RETIRED" &&
        (item.maintenanceState === "OVERDUE" || item.maintenanceState === "DUE_SOON")
    )
    .sort((a, b) => (a.nextDueAt?.getTime() ?? 0) - (b.nextDueAt?.getTime() ?? 0));
}

export async function getEquipment(farmId: string, id: string) {
  return prisma.equipment.findFirst({ where: { id, farmId }, select: equipmentSelect });
}

export async function listMaintenanceRecords(equipmentId: string, limit = 100) {
  return prisma.maintenanceRecord.findMany({
    where: { equipmentId },
    select: {
      id: true,
      performedAt: true,
      maintenanceType: true,
      description: true,
      costCents: true,
      nextDueAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { performedAt: "desc" },
    take: limit,
  });
}

/** The distinct categories already in use, offered as datalist suggestions. */
export async function listEquipmentCategories(farmId: string): Promise<string[]> {
  const rows = await prisma.equipment.findMany({
    where: { farmId },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((row) => row.category);
}
