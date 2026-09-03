"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { EQUIPMENT_STATUS_LABELS, MAINTENANCE_TYPE_LABELS } from "@/lib/labels";
import {
  assertNotFuture,
  optionalCents,
  optionalDate,
  optionalInt,
  optionalString,
  requireCents,
  requireDate,
  requireEnum,
  requireString,
} from "@/lib/validation";

const STATUSES = Object.keys(EQUIPMENT_STATUS_LABELS) as (keyof typeof EQUIPMENT_STATUS_LABELS)[];
const MAINTENANCE_TYPES = Object.keys(
  MAINTENANCE_TYPE_LABELS
) as (keyof typeof MAINTENANCE_TYPE_LABELS)[];

function readEquipmentFields(formData: FormData) {
  const expectedLifeMonths = optionalInt(formData, "expectedLifeMonths");
  if (expectedLifeMonths !== null && expectedLifeMonths <= 0) {
    throw new Error("Expected life must be greater than zero months");
  }

  const purchaseDate = optionalDate(formData, "purchaseDate");
  if (purchaseDate) assertNotFuture(purchaseDate, "Purchase date");

  return {
    name: requireString(formData, "name"),
    category: requireString(formData, "category"),
    serialNumber: optionalString(formData, "serialNumber"),
    location: optionalString(formData, "location"),
    purchaseDate,
    purchaseCostCents: optionalCents(formData, "purchaseCostCents"),
    expectedLifeMonths,
    status: requireEnum(formData, "status", STATUSES),
    notes: optionalString(formData, "notes"),
  };
}

/**
 * Buying an asset posts an equipment expense at the same time as the asset
 * row. Depreciation then spreads that cost across the asset's life for
 * reporting, but the cash left the farm on the purchase date and the ledger
 * records what actually moved.
 */
export async function createEquipment(formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const fields = readEquipmentFields(formData);

  await prisma.$transaction(async (tx) => {
    const item = await tx.equipment.create({
      data: { ...fields, farmId },
      select: { id: true },
    });

    if (fields.purchaseCostCents && fields.purchaseCostCents > 0 && fields.purchaseDate) {
      await tx.financialTransaction.create({
        data: {
          farmId,
          occurredAt: fields.purchaseDate,
          direction: "EXPENSE",
          category: "EQUIPMENT",
          amountCents: fields.purchaseCostCents,
          description: `Purchase — ${fields.name}`,
          equipmentId: item.id,
          createdByProfileId: user.id,
        },
      });
    }
  });

  revalidatePath("/equipment");
  revalidatePath("/finance");
  redirect("/equipment");
}

/**
 * Editing deliberately does NOT adjust the purchase transaction already in the
 * ledger. Correcting a typo in an asset's cost months later must not silently
 * restate a closed period's expenses — the ledger row is edited from
 * /finance/transactions if it is genuinely wrong.
 */
export async function updateEquipment(id: string, formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const existing = await prisma.equipment.findFirst({ where: { id, farmId }, select: { id: true } });
  if (!existing) throw new Error("Equipment not found");

  await prisma.equipment.update({ where: { id }, data: readEquipmentFields(formData) });

  revalidatePath("/equipment");
  revalidatePath(`/equipment/${id}`);
  redirect(`/equipment/${id}`);
}

export async function recordMaintenance(equipmentId: string, formData: FormData): Promise<void> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const item = await prisma.equipment.findFirst({
    where: { id: equipmentId, farmId },
    select: { id: true, name: true },
  });
  if (!item) throw new Error("Equipment not found");

  const performedAt = requireDate(formData, "performedAt");
  assertNotFuture(performedAt, "Maintenance date");

  const maintenanceType = requireEnum(formData, "maintenanceType", MAINTENANCE_TYPES);
  const description = requireString(formData, "description");
  const costCents = requireCents(formData, "costCents");
  const nextDueAt = optionalDate(formData, "nextDueAt");

  await prisma.$transaction(async (tx) => {
    await tx.maintenanceRecord.create({
      data: {
        equipmentId,
        performedAt,
        maintenanceType,
        description,
        costCents,
        nextDueAt,
        createdByProfileId: user.id,
      },
    });

    if (costCents > 0) {
      await tx.financialTransaction.create({
        data: {
          farmId,
          occurredAt: performedAt,
          direction: "EXPENSE",
          category: "EQUIPMENT",
          amountCents: costCents,
          description: `${MAINTENANCE_TYPE_LABELS[maintenanceType]} — ${item.name}`,
          equipmentId,
          createdByProfileId: user.id,
        },
      });
    }

    // A repair means the thing was broken; recording one is the natural moment
    // to put it back in service, rather than leaving a fixed feeder flagged as
    // needing repair until someone remembers to change the status by hand.
    if (maintenanceType === "REPAIR") {
      await tx.equipment.updateMany({
        where: { id: equipmentId, farmId, status: "NEEDS_REPAIR" },
        data: { status: "IN_SERVICE" },
      });
    }
  });

  revalidatePath("/equipment");
  revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/finance");
}
