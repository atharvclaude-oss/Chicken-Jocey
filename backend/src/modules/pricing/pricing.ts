// Pricing math. Pure functions in integer cents so they are easy to test and
// reuse from the admin UI, import pipeline and margin checks.

export interface CostInputs {
  unitCostCents: number;
  shippingCostCents: number;
  /** Payment fees, packaging, expected refunds: anything per-unit we eat. */
  miscCostCents?: number;
}

export const landedCostCents = ({ unitCostCents, shippingCostCents, miscCostCents = 0 }: CostInputs) =>
  unitCostCents + shippingCostCents + miscCostCents;

/** Gross margin as a fraction of retail, e.g. 0.45. */
export function grossMargin(retailCents: number, landedCents: number): number {
  if (retailCents <= 0) return 0;
  return (retailCents - landedCents) / retailCents;
}

/**
 * Lowest .99 price that still meets `targetMargin`.
 * $11 landed at 45% → $20.00 raw → $20.99 (since $19.99 would be under 45%).
 */
export function suggestRetailCents(landedCents: number, targetMargin: number): number {
  if (targetMargin < 0 || targetMargin >= 1) throw new RangeError("targetMargin must be in [0, 1)");
  const raw = Math.ceil(landedCents / (1 - targetMargin));
  return Math.floor(raw / 100) * 100 + 99;
}

/** True when a listing's current cost pushes the variant under the floor. */
export const isMarginBelow = (retailCents: number, costs: CostInputs, floor: number) =>
  grossMargin(retailCents, landedCostCents(costs)) < floor;

/**
 * Company floor: retail is at least 2x landed cost (item + shipping), i.e. a
 * 50% gross margin before payment fees. Nothing goes live below this.
 */
export const MIN_MARKUP = 2;
export const MIN_MARGIN = 1 - 1 / MIN_MARKUP;

/** Default retail price for a new product: lowest .99 price at or above the floor. */
export const floorRetailCents = (costs: CostInputs) => suggestRetailCents(landedCostCents(costs), MIN_MARGIN);

export const isBelowFloor = (retailCents: number, costs: CostInputs) =>
  retailCents < MIN_MARKUP * landedCostCents(costs);
