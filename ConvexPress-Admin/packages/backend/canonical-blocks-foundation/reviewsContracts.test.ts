import { expect, test } from "bun:test";
import { planCanonicalData } from "./planner";
const tree = [{ id: "reviews", name: "core/reviews", version: 1, attrs: { source: "site", limit: 6, minRating: 2 } }];
const scope = { websiteKey: "reviews-site", instanceKey: "reviews-staging" };
const policy = { enabledPlugins: ["commerce", "commerceReviews"], capabilities: ["reference.targetResolution"], disabledBlocks: [] };
test("Reviews binds its saved source and filters to a visitor page without accepting another source", () => {
  expect(planCanonicalData(tree, scope, policy, { reviews: "next-page" }).jobs[0]).toMatchObject({ resolver: "commerce.reviews", args: { source: "site", limit: 6, minRating: 2, cursor: "next-page" } });
});
test("Reviews requires the real Reviews plugin", () => {
  expect(() => planCanonicalData(tree, scope, { ...policy, enabledPlugins: ["commerce"] })).toThrow("Required plugin");
});
