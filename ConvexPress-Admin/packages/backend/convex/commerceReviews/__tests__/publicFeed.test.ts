import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { insertCountedReview } from "../ratingIndex";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceReviews/queries.ts": () => import("../queries"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "review-author@example.invalid", displayName: "A reader", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const settings = await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, commerceReviewsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const product = await ctx.db.insert("commerce_products", { title: "Notebook", slug: "notebook", status: "publish", productType: "simple", authorId: user, categoryIds: [], galleryMediaIds: [], basePrice: { amount: 1000, currencyCode: "USD" }, trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "reviews-site", instanceKey: "reviews-source", environmentKind: "staging", deploymentOrigin: "https://source.example.invalid", managementOrigin: "https://control.example.invalid", siteOrigin: "https://site.example.invalid", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const review = await insertCountedReview(ctx, { productId: product, userId: user, rating: 4, title: "Useful", content: "A good notebook", status: "approved", isVerifiedPurchase: false, helpfulCount: 0, rejectionReason: "Private moderation note", moderatedBy: user, moderatedAt: 1, createdAt: 1, updatedAt: 1 });
    return { user, settings, product, review };
  });
  return { t, ids };
}
test("public reviews never expose ownership or moderation fields", async () => {
  const { t, ids } = await fixture();
  const result = await t.query(api.commerceReviews.queries.getByProduct, { productId: ids.product, instanceKey: "reviews-source", paginationOpts: { numItems: 4, cursor: null } });
  const review = result.page[0]!;
  if (review.state !== "review") throw Error("Expected public review");
  expect(review.title).toBe("Useful");
  for (const key of ["userId", "orderId", "moderatedBy", "moderatedAt", "rejectionReason", "status", "updatedAt"]) expect(review).not.toHaveProperty(key);
});
test("draft product reviews are inaccessible anonymously", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.product, { status: "draft" }));
  expect(await t.query(api.commerceReviews.queries.getByProduct, { productId: ids.product, instanceKey: "reviews-source", paginationOpts: { numItems: 4, cursor: null } })).toMatchObject({ page: [{ state: "unavailable" }], isDone: true });
});

test("all sort orders paginate approved reviews without leaking pending rows or mistaking a page for the total", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    for (let i = 2; i <= 61; i++) await insertCountedReview(ctx, {
      productId: ids.product, userId: ids.user, rating: i % 5 + 1, status: i % 7 === 0 ? "pending" : "approved",
      isVerifiedPurchase: false, helpfulCount: i % 9, title: `Review ${i}`, createdAt: i, updatedAt: i,
    });
  });
  for (const sortBy of ["newest", "oldest", "highest", "lowest", "helpful"] as const) {
    let cursor: string | null = null;
    const seen = new Set<string>(), sorted: number[] = [];
    for (let i = 0; i < 20; i++) {
      const result = await t.query(api.commerceReviews.queries.getByProduct, { productId: ids.product, instanceKey: "reviews-source", sortBy, paginationOpts: { numItems: 4, cursor } });
      expect(result.page.length).toBeLessThanOrEqual(4);
      for (const review of result.page) {
        if (review.state !== "review") throw Error("Unexpected denial");
        expect(seen.has(review._id)).toBe(false); seen.add(review._id);
        sorted.push(sortBy === "highest" || sortBy === "lowest" ? review.rating : sortBy === "helpful" ? review.helpfulCount : review.createdAt);
      }
      if (result.isDone) break;
      cursor = result.continueCursor;
      if (i === 19) throw Error("Pagination did not finish");
    }
    expect(seen.size).toBe(53);
    const ascending = sortBy === "lowest" || sortBy === "oldest";
    expect(sorted).toEqual([...sorted].sort((a,b) => ascending ? a-b : b-a));
  }
});

test("every continuation rechecks installation, publication, plugin and membership authority", async () => {
  const { t, ids } = await fixture();
  const args = { productId: ids.product, instanceKey: "reviews-source", paginationOpts: { numItems: 1, cursor: null as string | null } };
  const denied = { page: [{ state: "unavailable" }], isDone: true };
  const read = () => t.query(api.commerceReviews.queries.getByProduct, args);
  expect(await t.query(api.commerceReviews.queries.getByProduct, { ...args, instanceKey: "other-site" })).toMatchObject(denied);
  await t.run(ctx => ctx.db.patch(ids.product, { publishedAt: Date.now() + 60000 }));
  expect(await read()).toMatchObject(denied);
  await t.run(ctx => ctx.db.patch(ids.product, { publishedAt: undefined }));
  const first = await read(); args.paginationOpts.cursor = first.continueCursor;
  await t.run(ctx => ctx.db.patch(ids.settings, { values: { commerceEnabled: true, commerceReviewsEnabled: true, membershipEnabled: true } }));
  for (const resourceType of ["product", "route"] as const) {
    const rule = await t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType, resourceIdOrKey: resourceType === "product" ? String(ids.product) : "/products/notebook", ruleMode: "allow_only", planIds: [], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 }));
    expect(await read()).toMatchObject(denied);
    await t.run(ctx => ctx.db.delete(rule));
  }
  for (const values of [{ commerceEnabled: false, commerceReviewsEnabled: true }, { commerceEnabled: true, commerceReviewsEnabled: false }]) {
    await t.run(ctx => ctx.db.patch(ids.settings, { values })); expect(await read()).toMatchObject(denied);
  }
});

test("page bounds cannot be overridden and legacy bodies stay bounded without exposing account images", async () => {
  const { t, ids } = await fixture();
  const args = { productId: ids.product, instanceKey: "reviews-source", paginationOpts: { numItems: 4, cursor: null } };
  for (const numItems of [0, 25, 1.5, -1]) await expect(t.query(api.commerceReviews.queries.getByProduct, { ...args, paginationOpts: { ...args.paginationOpts, numItems } })).rejects.toThrow("Invalid review page");
  await t.run(async ctx => {
    await ctx.db.patch(ids.review, { title: "T".repeat(1000), content: "C".repeat(30000) });
    await ctx.db.patch(ids.user, { displayName: "D".repeat(500), avatarUrl: "https://private.example.invalid/account.png" });
  });
  const result = await t.query(api.commerceReviews.queries.getByProduct, args);
  const review = result.page[0]!; if (review.state !== "review") throw Error("Expected review");
  expect(review.title?.length).toBe(240); expect(review.content?.length).toBe(12000); expect(review.userName.length).toBe(80);
  expect(review).not.toHaveProperty("userAvatar");
  await t.run(ctx => ctx.db.patch(ids.review, { rating: 6 }));
  expect((await t.query(api.commerceReviews.queries.getByProduct, args)).page).toEqual([]);
});
