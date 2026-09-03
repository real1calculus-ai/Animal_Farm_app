"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AnimalSaleType, TransactionCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINANCE_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { assertPigsMayBeSold } from "@/lib/health/withdrawal";
import { ANIMAL_SALE_TYPE_LABELS } from "@/lib/labels";
import {
  assertNotFuture,
  optionalString,
  requireCents,
  requireDate,
  requireEnum,
  requireFloat,
  requireString,
} from "@/lib/validation";

/**
 * Which income category a sale books against. Derived from the sale type
 * rather than asked for separately: a "cull" sale filed under "finished pig
 * sale" would quietly corrupt every revenue-by-source breakdown, and there is
 * no case where the operator should be able to disagree with themselves.
 */
const CATEGORY_BY_SALE_TYPE: Record<AnimalSaleType, TransactionCategory> = {
  FEEDER_PIG: "PIGLET_SALE",
  FINISHED_PIG: "FINISHED_PIG_SALE",
  BREEDING_STOCK: "BREEDING_STOCK_SALE",
  CULL: "CULL_SALE",
};

const SALE_TYPES = Object.keys(ANIMAL_SALE_TYPE_LABELS) as AnimalSaleType[];

type ParsedItem = {
  pigId: string;
  weightKg: number;
  pricePerKgCents: number;
  amountCents: number;
  carcassGrade: string | null;
};

/**
 * Reads the line items the client builder submitted.
 *
 * Each row is named by its own client-side id (`item-<rowId>-*`) rather than
 * by position, so a removed row cannot shift another row's weight onto the
 * wrong animal, and each field goes through the same validators as any other
 * single-value form field.
 */
function parseItems(formData: FormData): ParsedItem[] {
  const rowIds = formData
    .getAll("rowId")
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean);

  const items: ParsedItem[] = [];
  const seen = new Set<string>();

  for (const rowId of rowIds) {
    // A row the operator left blank is skipped, not an error — the builder
    // always renders one empty row to start with.
    const pigId = optionalString(formData, `item-${rowId}-pigId`);
    if (!pigId) continue;

    if (seen.has(pigId)) {
      throw new Error("The same animal appears twice on this sale");
    }
    seen.add(pigId);

    const weightKg = requireFloat(formData, `item-${rowId}-weightKg`);
    if (weightKg <= 0) throw new Error("Sale weight must be greater than zero");

    const pricePerKgCents = requireCents(formData, `item-${rowId}-pricePerKg`);
    if (pricePerKgCents <= 0) throw new Error("Price per kg must be greater than zero");

    items.push({
      pigId,
      weightKg,
      pricePerKgCents,
      // Money stays in integer minor units: multiply the kg by the per-kg
      // minor units and round once, rather than rounding a float currency.
      amountCents: Math.round(weightKg * pricePerKgCents),
      carcassGrade: optionalString(formData, `item-${rowId}-carcassGrade`),
    });
  }

  if (items.length === 0) {
    throw new Error("Add at least one animal to the sale");
  }

  return items;
}

/**
 * Records an animal sale.
 *
 * Everything lands in one `prisma.$transaction`: the sale header, its line
 * items, each animal's exit, and the income row in the ledger. Split across
 * separate writes, a failure halfway would leave animals marked SOLD with no
 * sale to show for it, or revenue in the P&L for animals still listed as
 * alive.
 *
 * The withdrawal check runs inside that same transaction and throws rather
 * than returning a flag (§8.3, food safety). It is a regulatory hard stop, not
 * a warning: an animal still carrying drug residue must not reach the food
 * chain, so the whole sale rolls back and the operator is told which animal,
 * which drug, and when it clears.
 */
export async function createAnimalSale(formData: FormData): Promise<void> {
  const user = await requireRole(FINANCE_ROLES);
  const farmId = await getActiveFarmId(user);

  const soldAt = requireDate(formData, "soldAt");
  assertNotFuture(soldAt, "Sale date");

  const saleType = requireEnum(formData, "saleType", SALE_TYPES);
  const buyerName = requireString(formData, "buyerName");
  const buyerContact = optionalString(formData, "buyerContact");
  const notes = optionalString(formData, "notes");

  const items = parseItems(formData);
  const pigIds = items.map((item) => item.pigId);
  // The total is computed, never typed. See the note in SaleBuilder.
  const totalCents = items.reduce((sum, item) => sum + item.amountCents, 0);

  // Confirm every animal is on this farm and still alive before we touch
  // anything — scoping by farmId here is what stops a hand-crafted POST from
  // selling another tenant's herd.
  const pigs = await prisma.pig.findMany({
    where: { id: { in: pigIds }, farmId },
    select: { id: true, tagNumber: true, status: true, dateOfBirth: true },
  });

  if (pigs.length !== pigIds.length) {
    throw new Error("One or more of those animals could not be found on this farm");
  }

  const notActive = pigs.filter((pig) => pig.status !== "ACTIVE");
  if (notActive.length > 0) {
    throw new Error(
      `Already exited and cannot be sold: ${notActive.map((p) => p.tagNumber).join(", ")}`
    );
  }

  const bornAfter = pigs.filter((pig) => pig.dateOfBirth > soldAt);
  if (bornAfter.length > 0) {
    throw new Error(
      `Sale date is before the birth date of ${bornAfter.map((p) => p.tagNumber).join(", ")}`
    );
  }

  const saleId = await prisma.$transaction(async (tx) => {
    // FOOD-SAFETY GATE (§8.3). Throws — and so rolls this transaction back —
    // if any animal is inside a medication withdrawal window on the sale date.
    // Deliberately inside the transaction so the check cannot be separated
    // from the write it protects.
    await assertPigsMayBeSold(pigIds, farmId, { saleDate: soldAt });

    const sale = await tx.animalSale.create({
      data: {
        farmId,
        soldAt,
        saleType,
        buyerName,
        buyerContact,
        notes,
        totalCents,
        createdByProfileId: user.id,
        items: {
          create: items.map((item) => ({
            pigId: item.pigId,
            weightKg: item.weightKg,
            pricePerKgCents: item.pricePerKgCents,
            amountCents: item.amountCents,
            carcassGrade: item.carcassGrade,
          })),
        },
      },
      select: { id: true },
    });

    await tx.pig.updateMany({
      where: { id: { in: pigIds }, farmId },
      data: { status: "SOLD", dateExit: soldAt, exitReason: "SOLD" },
    });

    // One income row for the sale, linked back to it. Per-animal revenue is
    // read from the sale items rather than split into one ledger row each —
    // the ledger records the money that moved, which was a single payment.
    await tx.financialTransaction.create({
      data: {
        farmId,
        occurredAt: soldAt,
        direction: "INCOME",
        category: CATEGORY_BY_SALE_TYPE[saleType],
        amountCents: totalCents,
        description: `${ANIMAL_SALE_TYPE_LABELS[saleType]} — ${items.length} animal${
          items.length === 1 ? "" : "s"
        } to ${buyerName}`,
        animalSaleId: sale.id,
        createdByProfileId: user.id,
      },
    });

    return sale.id;
  });

  revalidatePath("/finance");
  revalidatePath("/finance/sales");
  revalidatePath("/finance/transactions");
  revalidatePath("/finance/profitability");
  revalidatePath("/animals");
  revalidatePath("/pens");

  redirect(`/finance/sales/${saleId}`);
}
