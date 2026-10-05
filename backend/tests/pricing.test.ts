import { describe, expect, it } from "vitest";
import { grossMargin, isMarginBelow, landedCostCents, suggestRetailCents } from "../src/modules/pricing/pricing.ts";

describe("pricing", () => {
  it("adds up landed cost", () => {
    expect(landedCostCents({ unitCostCents: 800, shippingCostCents: 200, miscCostCents: 100 })).toBe(1100);
  });

  it("suggests the lowest .99 price that meets the target margin", () => {
    // $11 landed at 45% is $20.00 raw; $19.99 would be 44.97%, so $20.99.
    expect(suggestRetailCents(1100, 0.45)).toBe(2099);
    expect(grossMargin(2099, 1100)).toBeGreaterThanOrEqual(0.45);
    // Already lands on a .99-friendly number.
    expect(suggestRetailCents(1000, 0.5)).toBe(2099);
    expect(suggestRetailCents(990, 0.5)).toBe(1999);
  });

  it("rejects impossible margins", () => {
    expect(() => suggestRetailCents(1000, 1)).toThrow(RangeError);
  });

  it("flags margin drift", () => {
    const costs = { unitCostCents: 800, shippingCostCents: 250 };
    expect(isMarginBelow(2499, costs, 0.45)).toBe(false); // 58%
    expect(isMarginBelow(2499, { ...costs, unitCostCents: 1400 }, 0.45)).toBe(true); // 34%
  });
});
