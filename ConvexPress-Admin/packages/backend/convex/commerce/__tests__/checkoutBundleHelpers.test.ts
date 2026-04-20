import { describe, expect, test } from "bun:test";

import { collectBundlePurchaseCounts } from "../checkoutBundleHelpers";
import { buildBundleLineMetadata } from "../../commerceBundles/runtime";

describe("commerce checkout bundle helpers", () => {
  test("aggregates bundle quantities across converted cart items", () => {
    const starterBundle = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_starter",
        slug: "starter-kit",
        name: "Starter Kit",
        bundleType: "fixed",
        pricingType: "fixed",
      },
      owningProductId: "product_bundle_starter",
      snapshot: {
        selections: [],
        totalItems: 0,
        regularPriceAmount: 5000,
        componentSubtotalAmount: 5000,
        resolvedBundlePriceAmount: 4000,
      },
    });
    const deluxeBundle = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_deluxe",
        slug: "deluxe-kit",
        name: "Deluxe Kit",
        bundleType: "fixed",
        pricingType: "fixed",
      },
      owningProductId: "product_bundle_deluxe",
      snapshot: {
        selections: [],
        totalItems: 0,
        regularPriceAmount: 7000,
        componentSubtotalAmount: 7000,
        resolvedBundlePriceAmount: 5500,
      },
    });

    expect(
      collectBundlePurchaseCounts([
        { quantity: 2, metadata: starterBundle },
        { quantity: 1, metadata: deluxeBundle },
        { quantity: 3, metadata: starterBundle },
        { quantity: 5, metadata: { lineType: "product" } },
      ]),
    ).toEqual([
      { bundleId: "bundle_starter", quantity: 5 },
      { bundleId: "bundle_deluxe", quantity: 1 },
    ]);
  });

  test("returns an empty list when no bundle lines are present", () => {
    expect(
      collectBundlePurchaseCounts([
        { quantity: 2, metadata: { lineType: "product" } },
        { quantity: 1 },
      ]),
    ).toEqual([]);
  });
});
