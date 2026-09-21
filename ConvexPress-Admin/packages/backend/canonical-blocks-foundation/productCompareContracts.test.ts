import { expect, test } from "bun:test";
import { planCanonicalData } from "./planner";
const tree = [{ id: "compare", name: "commerce/product-compare", version: 1, attrs: { products: ["product-a", "product-b"], attributes: ["Color", "SKU"] } }];
const scope = { websiteKey: "compare", instanceKey: "staging" };
test("product comparison plans the saved product and attribute selection", () => {
  const plan = planCanonicalData(tree, scope, { enabledPlugins: ["commerce"], capabilities: ["reference.targetResolution"], disabledBlocks: [] });
  expect(plan.jobs).toHaveLength(1);
  expect(plan.jobs[0]).toMatchObject({ resolver: "commerce.productCompare", args: { products: ["product-a", "product-b"], attributes: ["Color", "SKU"] } });
});
test("product comparison requires the actual commerce plugin", () => {
  expect(() => planCanonicalData(tree, scope, { enabledPlugins: [], capabilities: ["reference.targetResolution"], disabledBlocks: [] })).toThrow("Required plugin or runtime policy is unavailable");
});
