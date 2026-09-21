import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { insertCountedReview, patchCountedReview, deleteCountedReview, readProductRatingSummary, beginRatingRepair, advanceRatingRepair, type RatingTask } from "../../commerceReviews/ratingIndex";
import { insertDynamicWithMediaReferences, patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../../media/attachmentGuard";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = {
    "./convex/_generated/api.js": () => import("../../_generated/api.js"),
    "./convex/_generated/server.js": () => import("../../_generated/server.js"),
    "./convex/commerceReviews/mutations.ts": () => import("../../commerceReviews/mutations"),
    "./convex/commerceReviews/queries.ts": () => import("../../commerceReviews/queries"),
    "./convex/commerceReviews/ratingMaintenance.ts": () => import("../../commerceReviews/ratingMaintenance"),
    "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
async function fixture() {
    const t = convexTest({ schema, modules });
    const ids = await t.run(async (ctx) => {
        const roleId = await ctx.db.insert("roles", { name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false, isProtected: true, capabilities: ["commerce.reviews.moderate", "commerce.reviews.delete", "commerce.reviews.view"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
        const user = await ctx.db.insert("users", { authSource: "local", email: "ratings@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
        const settings = await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, commerceReviewsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
        const product = await ctx.db.insert("commerce_products", { title: "Cup", slug: "cup", status: "publish", productType: "simple", authorId: user, categoryIds: [], galleryMediaIds: [], basePrice: { amount: 1000, currencyCode: "USD" }, trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 });
        const { _id, _creationTime, ...productValue } = (await ctx.db.get(product))!;
        const other = await ctx.db.insert("commerce_products", { ...productValue, slug: "other" });
        return { user, settings, product, other };
    });
    const admin = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
    const row = (rating = 5) => ({ productId: ids.product, userId: ids.user, rating, status: "approved" as const, isVerifiedPurchase: false, helpfulCount: 0, createdAt: 1, updatedAt: 1 });
    const read = (productId = ids.product) => t.run(ctx => readProductRatingSummary(ctx, productId));
    return { t, admin, ids, row, read };
}
test("registered review moderation, rating edits and deletion update the durable summary without product schema writes", async () => {
    const { t, admin, ids, row, read } = await fixture();
    const review = await t.run(ctx => insertCountedReview(ctx, { ...row(), status: "pending" }));
    expect((await read())?.count).toBe(0);
    await admin.mutation(api.commerceReviews.mutations.approve, { reviewId: review });
    await admin.mutation(api.commerceReviews.mutations.approve, { reviewId: review });
    expect(await read()).toMatchObject({ average: 5, count: 1 });
    await admin.mutation(api.commerceReviews.mutations.update, { reviewId: review, rating: 2 });
    expect((await t.run(ctx => ctx.db.get(review)))?.status).toBe("pending");
    expect((await read())?.count).toBe(0);
    await admin.mutation(api.commerceReviews.mutations.approve, { reviewId: review });
    expect(await read()).toMatchObject({ average: 2, count: 1 });
    await expect(admin.mutation(api.commerceReviews.mutations.update, { reviewId: review, rating: 2.5 })).rejects.toThrow("whole number");
    expect((await read())?.average).toBe(2);
    expect(await admin.mutation(api.commerceReviews.mutations.bulkReject, { reviewIds: [review, review] })).toEqual({ rejected: 1 });
    expect((await read())?.count).toBe(0);
    await admin.mutation(api.commerceReviews.mutations.approve, { reviewId: review });
    await admin.mutation(api.commerceReviews.mutations.remove, { reviewId: review });
    expect((await read())?.count).toBe(0);
    expect(await t.run(ctx => ctx.db.get(ids.product))).not.toHaveProperty("averageRating");
});
test("typed and dynamic writes preserve both products across reassignment, status changes and deletion", async () => {
    const { t, ids, row, read } = await fixture();
    const id = await t.run(ctx => insertDynamicWithMediaReferences(ctx, "commerce_review_items", row(4)));
    expect(await read()).toMatchObject({ average: 4, count: 1 });
    await t.run(ctx => patchDynamicWithMediaReferences(ctx, id, { productId: ids.other, rating: 3 }));
    expect((await read())?.count).toBe(0);
    expect(await read(ids.other)).toMatchObject({ average: 3, count: 1 });
    await t.run(ctx => patchDynamicWithMediaReferences(ctx, id, { status: "spam" }));
    expect((await read(ids.other))?.count).toBe(0);
    await t.run(ctx => patchDynamicWithMediaReferences(ctx, id, { status: "approved" }));
    await t.run(ctx => deleteDynamicWithMediaReferences(ctx, id));
    expect((await read(ids.other))?.count).toBe(0);
});
test("large legacy rebuild survives duplicate pages, concurrent edits/deletes/new reviews and product reassignment", async () => {
    const { t, ids, row, read } = await fixture();
    const reviews = await t.run(async (ctx) => { const rows = []; for (let i = 0; i < 320; i++)
        rows.push(await ctx.db.insert("commerce_review_items", row(i % 5 + 1))); return rows; });
    expect(await read()).toBeNull();
    let task = await t.run(ctx => beginRatingRepair(ctx, ids.product));
    expect(task).not.toBeNull();
    const first = task!;
    task = await t.run(ctx => advanceRatingRepair(ctx, first));
    expect(await t.run(ctx => advanceRatingRepair(ctx, first))).toBeNull();
    expect(await read()).toBeNull();
    await t.run(async (ctx) => {
        await patchCountedReview(ctx, reviews[0]!, { status: "pending" });
        await patchCountedReview(ctx, reviews[100]!, { rating: 5 });
        await deleteCountedReview(ctx, reviews[1]!);
        await deleteCountedReview(ctx, reviews[200]!);
        await insertCountedReview(ctx, row(2));
        await patchCountedReview(ctx, reviews[2]!, { productId: ids.other });
        await patchCountedReview(ctx, reviews[250]!, { productId: ids.other });
    });
    let pages = 1;
    while (task) {
        const current: RatingTask = task;
        task = await t.run(ctx => advanceRatingRepair(ctx, current));
        expect(++pages).toBeLessThan(20);
    }
    const actual = await read();
    const expected = await t.run(async (ctx) => { const rows = await ctx.db.query("commerce_review_items").withIndex("by_product_status", q => q.eq("productId", ids.product).eq("status", "approved")).take(400); return { count: rows.length, average: rows.reduce((sum, r) => sum + r.rating, 0) / rows.length }; });
    expect(actual).toMatchObject(expected);
    expect((await read(ids.other))?.count).toBe(2);
    const budget = new RequestReadLedger();
    await t.run(ctx => readProductRatingSummary(ctx, ids.product, budget));
    expect(budget.documents).toBe(1);
    expect(budget.queries).toBe(1);
});
test("forced repair invalidates old generation jobs and rebuilds corrupt counters without exposing partial averages", async () => {
    const { t, ids, row, read } = await fixture();
    await t.run(ctx => insertCountedReview(ctx, row()));
    const old = (await t.run(ctx => beginRatingRepair(ctx, ids.product, true)))!;
    const fresh = (await t.run(ctx => beginRatingRepair(ctx, ids.product, true)))!;
    expect(fresh.generation).toBeGreaterThan(old.generation);
    expect(await t.run(ctx => advanceRatingRepair(ctx, old))).toBeNull();
    expect(await read()).toBeNull();
    await t.run(ctx => advanceRatingRepair(ctx, fresh));
    expect((await read())?.count).toBe(1);
    await t.run(async (ctx) => { const state = await ctx.db.query("commerce_review_ratings").withIndex("by_product", q => q.eq("productId", ids.product)).unique(); await ctx.db.patch(state!._id, { counts: [-1, 0, 0, 0, 0] }); });
    expect(await read()).toBeNull();
    let task = await t.run(ctx => beginRatingRepair(ctx, ids.product, true));
    while (task) {
        const current: RatingTask = task;
        task = await t.run(ctx => advanceRatingRepair(ctx, current));
    }
    expect((await read())?.count).toBe(1);
});
test("public rating summaries are plugin, publication and source gated", async () => {
    const { t, ids, row } = await fixture();
    await t.run(ctx => insertCountedReview(ctx, row(4)));
    expect(await t.query(api.commerceReviews.queries.getProductRating, { productId: ids.product })).toMatchObject({ averageRating: 4, totalReviews: 1, distribution: { 4: 1 } });
    await t.run(ctx => ctx.db.patch(ids.product, { status: "draft" }));
    expect(await t.query(api.commerceReviews.queries.getProductRating, { productId: ids.product })).toBeNull();
    await t.run(ctx => ctx.db.patch(ids.product, { status: "publish", publishedAt: Date.now() + 60000 }));
    expect(await t.query(api.commerceReviews.queries.getProductRating, { productId: ids.product })).toBeNull();
    await t.run(ctx => ctx.db.patch(ids.settings, { values: { commerceEnabled: true, commerceReviewsEnabled: false } }));
    expect(await t.query(api.commerceReviews.queries.getProductRating, { productId: ids.product })).toBeNull();
});
test("a full final rebuild batch completes exactly once and stale recovery resumes the recorded frontier", async () => {
    const { t, ids, row, read } = await fixture();
    await t.run(async (ctx) => { for (let i = 0; i < 32; i++)
        await ctx.db.insert("commerce_review_items", row()); });
    const first = (await t.run(ctx => beginRatingRepair(ctx, ids.product)))!;
    const last = (await t.run(ctx => advanceRatingRepair(ctx, first)))!;
    expect(last).not.toBeNull();
    expect(await read()).toBeNull();
    const resumed = await t.run(ctx => beginRatingRepair(ctx, ids.product));
    expect(resumed).toEqual(last);
    expect(await t.run(ctx => advanceRatingRepair(ctx, last))).toBeNull();
    expect((await read())?.count).toBe(32);
    expect(await t.run(ctx => advanceRatingRepair(ctx, last))).toBeNull();
    expect((await read())?.count).toBe(32);
});
test("WordPress review upserts preserve aggregates through repeats and product changes", async () => {
    const { t, ids, row, read } = await fixture();
    const { upsertCommerceReview } = await import("../../wordpressSync/phases/commerceTransactions");
    const value = { ...row(3), createdAtSource: 1 };
    const id = await t.run(ctx => (upsertCommerceReview as any)._handler(ctx, { review: value }));
    await t.run(ctx => (upsertCommerceReview as any)._handler(ctx, { existingId: id, review: value }));
    expect(await read()).toMatchObject({ average: 3, count: 1 });
    await t.run(ctx => (upsertCommerceReview as any)._handler(ctx, { existingId: id, review: { ...value, productId: ids.other, rating: 5 } }));
    expect((await read())?.count).toBe(0);
    expect(await read(ids.other)).toMatchObject({ average: 5, count: 1 });
});
test("unauthorized moderation and invalid legacy ratings cannot produce public totals", async () => {
    const { t, ids, row, read } = await fixture();
    const review = await t.run(ctx => insertCountedReview(ctx, { ...row(), status: "pending" }));
    await expect(t.mutation(api.commerceReviews.mutations.approve, { reviewId: review })).rejects.toThrow("Authentication required");
    expect((await read())?.count).toBe(0);
    await t.run(ctx => ctx.db.patch(review, { status: "approved", rating: 6 }));
    const task = (await t.run(ctx => beginRatingRepair(ctx, ids.product, true)))!;
    await expect(t.run(ctx => advanceRatingRepair(ctx, task))).rejects.toThrow("whole number");
    expect(await read()).toBeNull();
    await t.run(ctx => patchCountedReview(ctx, review, { rating: 4 }));
    let current = await t.run(ctx => beginRatingRepair(ctx, ids.product, true));
    while (current) {
        const page: RatingTask = current;
        current = await t.run(ctx => advanceRatingRepair(ctx, page));
    }
    expect(await read()).toMatchObject({ average: 4, count: 1 });
});
