import { patchWithMediaReferences } from "../media/attachmentGuard";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { resolvePrice } from "../canonicalDocuments/foundation/commercePricing";
import { readPublicCardVariant } from "./publicProductVariant";
import { saleIntervalBuckets, salePointBuckets, SALE_TIME_END, MAX_SALE_BUCKETS } from "./saleIntervals";
export const PRODUCT_SALE_FIELDS = ["status", "productType", "publishedAt", "createdAt", "basePrice", "salePrice", "salePriceFrom", "salePriceTo"] as const;
export const VARIANT_SALE_FIELDS = ["productId", "status", "isDefault", "price", "salePrice", "salePriceFrom", "salePriceTo"] as const;
type WriteContext = Pick<MutationCtx, "db">;
/** Current public default selection is shared with the storefront card reader. */
export async function syncProductSaleIndex(ctx: WriteContext, productId: Id<"commerce_products">, budget?: RequestReadLedger): Promise<void> {
    budget?.beforeRead();
    const product = await ctx.db.get("commerce_products", productId);
    budget?.record(product);
    let interval: {
        startsAt: number;
        endsAt: number;
        createdAt: number;
    } | null = null;
    if (product?.status === "publish") {
        const variant = product.productType === "variable" ? await readPublicCardVariant(ctx, productId, budget) : null;
        if (product.productType !== "variable" || variant) {
            const source = variant ?? product, regular = variant?.price ?? product.basePrice;
            const start = Math.max(0, Math.ceil(source.salePriceFrom ?? 0), Math.ceil(product.publishedAt ?? 0));
            const end = Math.min(SALE_TIME_END, Math.floor(source.salePriceTo ?? (SALE_TIME_END - 1)) + 1);
            if (Number.isSafeInteger(start) && Number.isInteger(end) && end > start && resolvePrice(regular, source.salePrice, source, start).saleActive) {
                if (!Number.isSafeInteger(product.createdAt) || product.createdAt < 0)
                    throw Error("Invalid product creation time for sale index");
                interval = { startsAt: start, endsAt: end, createdAt: product.createdAt };
            }
        }
    }
    const desired = new Set(interval ? saleIntervalBuckets(interval.startsAt, interval.endsAt) : []);
    budget?.beforeRead();
    const previous = await ctx.db.query("commerce_product_sales").withIndex("by_product", q => q.eq("productId", productId)).take(MAX_SALE_BUCKETS + 1);
    for (const row of previous)
        budget?.record(row);
    if (previous.length > MAX_SALE_BUCKETS)
        throw new ConvexError({ code: "SALE_INDEX_CORRUPT", message: "Product sale index needs repair." });
    for (const row of previous) {
        if (!desired.delete(row.bucket))
            await ctx.db.delete("commerce_product_sales", row._id);
        else if (interval && (row.startsAt !== interval.startsAt || row.endsAt !== interval.endsAt || row.createdAt !== interval.createdAt))
            await ctx.db.patch("commerce_product_sales", row._id, interval);
    }
    if (interval)
        for (const bucket of desired)
            await ctx.db.insert("commerce_product_sales", { productId, bucket, ...interval });
    if (product)
        await patchWithMediaReferences(ctx, "commerce_products", productId, { saleIndexVersion: 1 }, undefined, budget);
}
/** The caller has already written the source. Reassignment refreshes both parents. */
export async function reconcileProductSaleWrite(ctx: WriteContext, table: string, id: string, previous: Record<string, unknown> | null, next: Record<string, unknown> | null, budget?: RequestReadLedger): Promise<void> {
    if (table === "commerce_products")
        return syncProductSaleIndex(ctx, id as Id<"commerce_products">, budget);
    if (table !== "commerce_product_variants")
        return;
    const parents = new Set([previous?.productId, next?.productId].filter((value): value is string => typeof value === "string"));
    for (const parent of parents) {
        const productId = ctx.db.normalizeId("commerce_products", parent);
        if (productId)
            await syncProductSaleIndex(ctx, productId, budget);
    }
}
export async function assertSaleIndexReady(ctx: Pick<QueryCtx, "db">, budget?: RequestReadLedger) {
    budget?.beforeRead();
    const pending = await ctx.db.query("commerce_products").withIndex("by_sale_index_version", q => q.eq("saleIndexVersion", undefined)).first();
    budget?.record(pending);
    if (pending)
        throw new ConvexError({ code: "SALE_INDEX_PENDING", message: "Product sales are being indexed. Retry after the catalog rebuild completes." });
}
/** At most 54 ordered index streams. Covers only active sale intervals, then
 * merges newest-first; source authorization still occurs in the caller. */
export async function* readActiveSaleCandidates(ctx: Pick<QueryCtx, "db">, now: number, budget?: RequestReadLedger): AsyncGenerator<Doc<"commerce_product_sales">> {
    await assertSaleIndexReady(ctx, budget);
    for (const field of ["startsAt", "endsAt"] as const) {
        budget?.beforeRead();
        const boundary = field === "startsAt"
            ? await ctx.db.query("commerce_product_sales").withIndex("by_start", q => q.gt("startsAt", now)).first()
            : await ctx.db.query("commerce_product_sales").withIndex("by_end", q => q.gt("endsAt", now)).first();
        budget?.record(boundary);
        if (boundary && boundary[field] < SALE_TIME_END)
            budget?.noteAuthorizationBoundary(boundary[field], now);
    }
    const streams = salePointBuckets(now).map(bucket => ctx.db.query("commerce_product_sales").withIndex("by_bucket_created", q => q.eq("bucket", bucket)).order("desc")[Symbol.asyncIterator]());
    const pull = async (index: number) => { budget?.beforeRead(); const result = await streams[index]!.next(); if (result.done)
        return null; budget?.record(result.value); return result.value; };
    try {
        const heads = await Promise.all(streams.map((_, index) => pull(index)));
        while (true) {
            let best = -1;
            for (let i = 0; i < heads.length; i++) {
                const candidate = heads[i];
                if (!candidate)
                    continue;
                const current = best < 0 ? null : heads[best];
                if (!current || candidate.createdAt > current.createdAt || (candidate.createdAt === current.createdAt && candidate.productId > current.productId))
                    best = i;
            }
            if (best < 0)
                return;
            const row = heads[best]!;
            if (row.startsAt <= now && row.endsAt > now)
                yield row;
            heads[best] = await pull(best);
        }
    }
    finally {
        await Promise.all(streams.map(stream => stream.return?.()));
    }
}
