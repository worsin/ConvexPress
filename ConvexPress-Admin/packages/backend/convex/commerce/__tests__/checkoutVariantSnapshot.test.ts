import { describe, expect, test } from "bun:test";
import { buildOrderItemTitle, buildOrderItemMetadata } from "../orderBundleHelpers";

describe("checkout variant order item snapshots", () => {
  test("order item title includes variant title", () => {
    expect(buildOrderItemTitle({ product: { title: "T-Shirt" }, variant: { title: "Red / Large" } })).toBe("T-Shirt - Red / Large");
  });
  test("order item title uses product only when no variant", () => {
    expect(buildOrderItemTitle({ product: { title: "T-Shirt" } })).toBe("T-Shirt");
  });
  test("order item metadata captures variant SKU, title, optionSummary", () => {
    const metadata = buildOrderItemMetadata({ product: { title: "T-Shirt" }, variant: { title: "Red / Large", optionSummary: "Color: Red / Size: Large", sku: "TSH-R-L" } });
    expect(metadata.variantTitle).toBe("Red / Large");
    expect(metadata.optionSummary).toBe("Color: Red / Size: Large");
    expect(metadata.variantSku).toBe("TSH-R-L");
    expect(metadata.productTitle).toBe("T-Shirt");
  });
  test("order item metadata handles missing variant gracefully", () => {
    const metadata = buildOrderItemMetadata({ product: { title: "Simple Product" } });
    expect(metadata.productTitle).toBe("Simple Product");
    expect(metadata.variantTitle).toBeUndefined();
    expect(metadata.optionSummary).toBeUndefined();
  });
});
