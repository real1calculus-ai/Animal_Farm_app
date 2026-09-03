/**
 * Straight-line depreciation for farm equipment.
 *
 * Straight line rather than declining balance because it is what the spec asks
 * for (§3.5, "Cost tracking: Depreciation") and because it is the method a
 * small farm's accountant will already be using on the same assets. Salvage
 * value is assumed zero: nothing in the schema records one, and assuming a
 * residual we cannot substantiate would overstate book value.
 *
 * All amounts are integer minor units, like every other money value in the
 * app. Monthly depreciation is deliberately *not* pre-rounded into a per-month
 * figure — that rounds once per month and the error accumulates. Instead the
 * accumulated total is computed from elapsed months in one multiplication and
 * rounded once, so the numbers always add back up to the purchase cost.
 */

export type DepreciationInput = {
  purchaseCostCents: number | null;
  purchaseDate: Date | null;
  expectedLifeMonths: number | null;
};

export type Depreciation = {
  /** True when purchase cost, date and expected life are all recorded. */
  computable: boolean;
  purchaseCostCents: number;
  /** Whole months elapsed since purchase, capped at the expected life. */
  monthsElapsed: number;
  monthsRemaining: number;
  expectedLifeMonths: number;
  accumulatedCents: number;
  bookValueCents: number;
  /** Fraction of the asset's life consumed, 0–1. */
  lifeUsedFraction: number;
  /** True once the asset is past its expected life — the replacement flag. */
  fullyDepreciated: boolean;
};

const NOT_COMPUTABLE: Depreciation = {
  computable: false,
  purchaseCostCents: 0,
  monthsElapsed: 0,
  monthsRemaining: 0,
  expectedLifeMonths: 0,
  accumulatedCents: 0,
  bookValueCents: 0,
  lifeUsedFraction: 0,
  fullyDepreciated: false,
};

/** Whole calendar months between two dates, floored at zero. */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  // Part-months don't count until the day-of-month comes round.
  const adjusted = to.getDate() < from.getDate() ? months - 1 : months;
  return Math.max(0, adjusted);
}

export function depreciate(
  input: DepreciationInput,
  asOf: Date = new Date()
): Depreciation {
  const { purchaseCostCents, purchaseDate, expectedLifeMonths } = input;

  if (
    purchaseCostCents === null ||
    purchaseCostCents <= 0 ||
    purchaseDate === null ||
    expectedLifeMonths === null ||
    expectedLifeMonths <= 0
  ) {
    return {
      ...NOT_COMPUTABLE,
      purchaseCostCents: purchaseCostCents ?? 0,
      // An asset with a cost but no life set still has its cost as book value;
      // callers that total asset value should not lose it.
      bookValueCents: purchaseCostCents ?? 0,
    };
  }

  const rawMonths = monthsBetween(purchaseDate, asOf);
  const monthsElapsed = Math.min(rawMonths, expectedLifeMonths);
  const accumulatedCents = Math.round(
    (purchaseCostCents * monthsElapsed) / expectedLifeMonths
  );

  return {
    computable: true,
    purchaseCostCents,
    monthsElapsed,
    monthsRemaining: expectedLifeMonths - monthsElapsed,
    expectedLifeMonths,
    accumulatedCents,
    bookValueCents: purchaseCostCents - accumulatedCents,
    lifeUsedFraction: Math.min(1, rawMonths / expectedLifeMonths),
    fullyDepreciated: rawMonths >= expectedLifeMonths,
  };
}

/** Depreciation charge falling inside `[start, end)` — the period's expense. */
export function depreciationForPeriod(
  input: DepreciationInput,
  start: Date,
  end: Date
): number {
  const atStart = depreciate(input, start).accumulatedCents;
  const atEnd = depreciate(input, end).accumulatedCents;
  return Math.max(0, atEnd - atStart);
}

export type AssetTotals = {
  purchaseCostCents: number;
  bookValueCents: number;
  accumulatedCents: number;
  /** Items past their expected life, i.e. flagged for replacement. */
  pastExpectedLife: number;
};

export function totalAssetValue(
  items: DepreciationInput[],
  asOf: Date = new Date()
): AssetTotals {
  return items.reduce<AssetTotals>(
    (totals, item) => {
      const d = depreciate(item, asOf);
      return {
        purchaseCostCents: totals.purchaseCostCents + d.purchaseCostCents,
        bookValueCents: totals.bookValueCents + d.bookValueCents,
        accumulatedCents: totals.accumulatedCents + d.accumulatedCents,
        pastExpectedLife: totals.pastExpectedLife + (d.fullyDepreciated ? 1 : 0),
      };
    },
    { purchaseCostCents: 0, bookValueCents: 0, accumulatedCents: 0, pastExpectedLife: 0 }
  );
}
