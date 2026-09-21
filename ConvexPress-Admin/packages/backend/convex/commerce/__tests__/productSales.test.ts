import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { saleIntervalBuckets, salePointBuckets, SALE_TIME_END } from "../saleIntervals";
import { syncProductSaleIndex, readActiveSaleCandidates } from "../productSaleIndex";
import { insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences, insertDynamicWithMediaReferences, patchDynamicWithMediaReferences } from "../../media/attachmentGuard";
import { readProductCollection } from "../../canonicalDocuments/productCollection";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { rebuild } from "../productSaleMaintenance";
const modules = { "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js"), "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"), "./convex/commerce/productSaleMaintenance.ts": () => import("../productSaleMaintenance") };
async function fixture() {
    const t = convexTest({ schema, modules });
    const user = await t.run(async (ctx) => { const id = await ctx.db.insert("users", { authSource: "local", email: "sales@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 }); await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: id }); return id; });
    const product = { title: "Cup", slug: "cup", status: "publish" as const, productType: "simple" as const, authorId: user, categoryIds: [], galleryMediaIds: [], basePrice: { amount: 1000, currencyCode: "USD" }, salePrice: { amount: 0, currencyCode: "USD" }, salePriceFrom: 100, salePriceTo: 200, trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 };
    const add = () => t.run(ctx => insertWithMediaReferences(ctx, "commerce_products", product));
    const sales = (now = 150) => t.run(ctx => readProductCollection(ctx, { mode: "sale" }, undefined, undefined, { now }));
    return { t, user, product, add, sales };
}
test("disjoint time buckets match each millisecond once across small and extreme intervals", () => {
    const failures = [];
    for (let start = 0; start < 32; start++)
        for (let end = start + 1; end < 34; end++) {
            const buckets = new Set(saleIntervalBuckets(start, end));
            for (let now = 0; now < 35; now++) {
                const matches = salePointBuckets(now).filter(key => buckets.has(key)).length;
                if (matches !== (now >= start && now < end ? 1 : 0))
                    failures.push({ start, end, now, matches });
            }
        }
    expect(failures).toEqual([]);
    for (const [start, end] of [[0, SALE_TIME_END], [1, SALE_TIME_END - 1], [2 ** 40 - 1, 2 ** 40 + 1], [SALE_TIME_END - 1, SALE_TIME_END]]) {
        const buckets = new Set(saleIntervalBuckets(start!, end!));
        expect(buckets.size).toBeLessThanOrEqual(106);
        expect(salePointBuckets(start!).filter(key => buckets.has(key))).toHaveLength(1);
        expect(salePointBuckets(end! - 1).filter(key => buckets.has(key))).toHaveLength(1);
    }
    expect(() => saleIntervalBuckets(2, 2)).toThrow();
    expect(() => salePointBuckets(-1)).toThrow();
});
test("old active sales remain discoverable behind hundreds of newer nonmatching products with bounded reads", async () => {
    const { t, product, add } = await fixture();
    const id = await add();
    await t.run(async (ctx) => {
        for (let i = 0; i < 360; i++) {
            const next = await ctx.db.insert("commerce_products", { ...product, slug: `other-${i}`, createdAt: i + 2, collectionIndexVersion: 1, ...(i % 3 === 0 ? { salePrice: undefined } : i % 3 === 1 ? { salePriceFrom: 1000, salePriceTo: 2000 } : { salePriceFrom: 1, salePriceTo: 99 }) });
            await syncProductSaleIndex(ctx, next);
        }
    });
    const budget = new RequestReadLedger();
    const result = await t.run(ctx => readProductCollection(ctx, { mode: "sale" }, budget, undefined, { now: 150 }));
    expect(result.items.map(item => item.id)).toEqual([id]);
    expect(budget.documents).toBeLessThan(16);
    expect(budget.queries).toBeLessThan(100);
    expect(budget.authorizationRecheckAt).toBe(201);
});
test("inclusive/free sale windows, scheduled publication and empty results expose exact refresh deadlines", async () => {
    const { t, add, sales } = await fixture();
    const id = await add();
    expect((await sales(99)).items).toHaveLength(0);
    expect((await sales(100)).items[0]?.pricing?.salePrice?.amount).toBe(0);
    expect((await sales(200)).items).toHaveLength(1);
    expect((await sales(201)).items).toHaveLength(0);
    await t.run(ctx => patchWithMediaReferences(ctx, "commerce_products", id, { publishedAt: 180 }));
    const budget = new RequestReadLedger();
    expect((await t.run(ctx => readProductCollection(ctx, { mode: "sale", showPrice: false }, budget, undefined, { now: 150 }))).items).toEqual([]);
    expect(budget.authorizationRecheckAt).toBe(180);
    await t.run(ctx => patchWithMediaReferences(ctx, "commerce_products", id, { salePriceTo: undefined, salePriceFrom: undefined, publishedAt: undefined }));
    expect((await sales(1)).items).toHaveLength(1);
});
test("variant defaults, visibility, reassignment and deletion maintain both parent sale indexes", async () => {
    const { t, product, add, sales } = await fixture();
    const id = await add();
    const other = await t.run(ctx => insertWithMediaReferences(ctx, "commerce_products", { ...product, slug: "other", productType: "variable" }));
    await t.run(ctx => patchWithMediaReferences(ctx, "commerce_products", id, { productType: "variable" }));
    expect((await sales()).items).toEqual([]);
    const value = { productId: id, title: "Option", optionSummary: "Option", price: { amount: 1000, currencyCode: "USD" }, salePrice: { amount: 0, currencyCode: "USD" }, salePriceFrom: 100, salePriceTo: 200, status: "draft" as const, isDefault: true, createdAt: 1, updatedAt: 1 };
    const hidden = await t.run(ctx => insertWithMediaReferences(ctx, "commerce_product_variants", value));
    expect((await sales()).items).toEqual([]);
    await t.run(ctx => patchWithMediaReferences(ctx, "commerce_product_variants", hidden, { status: "publish" }));
    expect((await sales()).items.map(item => item.id)).toEqual([id]);
    await t.run(ctx => patchDynamicWithMediaReferences(ctx, hidden, { productId: other }));
    expect((await sales()).items.map(item => item.id)).toEqual([other]);
    const regular = await t.run(ctx => insertWithMediaReferences(ctx, "commerce_product_variants", { ...value, productId: other, status: "publish", salePrice: undefined, isDefault: false }));
    await t.run(ctx => deleteWithMediaReferences(ctx, "commerce_product_variants", hidden));
    expect((await sales()).items).toEqual([]);
    await t.run(ctx => replaceWithMediaReferences(ctx, "commerce_product_variants", regular, { ...value, productId: other, status: "publish" }));
    expect((await sales()).items.map(item => item.id)).toEqual([other]);
    await t.run(ctx => deleteWithMediaReferences(ctx, "commerce_products", other));
    expect((await sales()).items).toEqual([]);
});
test("newest active candidates merge across buckets without duplicates and stop before loading the whole sale catalog", async () => {
    const { t, product } = await fixture();
    const expected = await t.run(async (ctx) => { const ids = []; for (let i = 0; i < 40; i++)
        ids.push(await insertDynamicWithMediaReferences(ctx, "commerce_products", { ...product, slug: `sale-${i}`, createdAt: i + 1, salePriceFrom: i, salePriceTo: 200 + i })); return ids.reverse(); });
    const found = await t.run(async (ctx) => { const ids = []; for await (const candidate of readActiveSaleCandidates(ctx, 150)) {
        ids.push(candidate.productId);
        if (ids.length === 8)
            break;
    } return ids; });
    expect(found).toEqual(expected.slice(0, 8));
});
test("legacy catalogs refuse incomplete sales until rebuilt and stale coordinates cannot broaden visibility", async () => {
    const { t, product, sales } = await fixture();
    const id = await t.run(ctx => ctx.db.insert("commerce_products", product));
    await expect(sales()).rejects.toThrow("being indexed");
    expect(await t.run(ctx => (rebuild as any)._handler(ctx, {}))).toEqual({ processed: 1, done: true });
    expect((await sales()).items).toHaveLength(1);
    await t.run(ctx => ctx.db.patch(id, { status: "draft" }));
    expect((await sales()).items).toEqual([]);
    await t.run(ctx => syncProductSaleIndex(ctx, id));
    expect(await t.run(ctx => ctx.db.query("commerce_product_sales").withIndex("by_product", q => q.eq("productId", id)).take(107))).toEqual([]);
});
