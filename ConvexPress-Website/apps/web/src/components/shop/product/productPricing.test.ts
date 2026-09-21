import { expect, test } from "bun:test";
import { productPricing, productPriceInputs } from "./productPricing";
import { nextPriceBoundary } from "@/templates/sdk/block-data/portable/commercePricing";
const price = { amount: 2500, currencyCode: "USD" };
const free = { amount: 0, currencyCode: "USD" };
test("actual product pricing model follows a free variant sale through both boundaries", () => {
  const variant = { price, salePrice: free, salePriceFrom: 100, salePriceTo: 200, status: "publish" };
  for (const [now, amount, compare] of [[99, 2500, false], [100, 0, true], [200, 0, true], [201, 2500, false]] as const) {
    const result = productPricing(null, variant, [variant], true, now);
    expect(result.price).toBe(amount);
    expect(result.showCompare).toBe(compare);
    expect(result.priceRange).toEqual({ min: amount, max: amount });
  }
  const inputs = productPriceInputs(null, [variant]);
  expect(nextPriceBoundary(inputs, 99)).toBe(100);
  expect(nextPriceBoundary(inputs, 100)).toBe(201);
  expect(nextPriceBoundary(inputs, 200)).toBe(201);
  expect(nextPriceBoundary(inputs, 201)).toBeNull();
});
test("simple free sales show the regular comparison and zero-priced variants stay in the range", () => {
  expect(productPricing({ basePrice: price, salePrice: free }, null, [], false, 0)).toMatchObject({ price: 0, regularPrice: 2500, showCompare: true });
  const variants = [{ price: free }, { price }, { price: { amount: 9999 }, status: "draft" }, { price: { amount: 1 }, status: "private" }];
  expect(productPricing(null, null, variants, true, 0).priceRange).toEqual({ min: 0, max: 2500 });
  expect(productPricing(null, variants[2], variants, true, 0).price).toBeUndefined();
});
test("expired epoch-zero sales and invalid cross-currency sales stay at the regular price", () => {
  expect(productPricing(null, { price, salePrice: free, salePriceTo: 0 }, [], true, 1).price).toBe(2500);
  expect(productPricing(null, { price, salePrice: { amount: 0, currencyCode: "EUR" } }, [], true, 1).price).toBe(2500);
  expect(productPricing({ displayPrice: 0, compareAtPrice: 2500 }, null, [], false, 1).showCompare).toBe(true);
});
