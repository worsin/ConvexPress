import { streamQuery } from "convex-helpers/server/pagination";
import { ConvexError, getDocumentSize } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import schema from "../schema";
type Context = Pick<MutationCtx, "db">;
type Entry = Pick<Doc<"commerce_review_items">, "_id" | "_creationTime" | "productId" | "status" | "rating">;
type State = Doc<"commerce_review_ratings">;
export type RatingTask = {
    productId: Id<"commerce_products">;
    generation: number;
    afterTime: number | null;
    afterId: string | null;
};
export const RATING_PAGE_ROWS = 32, RATING_PAGE_BYTES = 512 * 1024;
const empty = () => [0, 0, 0, 0, 0];
const baseline = (productId: Id<"commerce_products">) => ({ productId, phase: "pending" as const, generation: 0, counts: empty(), updatedAt: Date.now(), frontierTime: null, frontierId: null, horizonTime: null, horizonId: null });
const taskFor = (state: Pick<State, "productId" | "generation" | "frontierTime" | "frontierId">): RatingTask => ({ productId: state.productId, generation: state.generation, afterTime: state.frontierTime, afterId: state.frontierId });
export function validateReviewRating(rating: number) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        throw new ConvexError({ code: "invalid_rating", message: "Rating must be a whole number between 1 and 5." });
}
function validCounts(counts: number[]) { return counts.length === 5 && counts.every(count => Number.isSafeInteger(count) && count >= 0) && Number.isSafeInteger(counts.reduce((sum, count, index) => sum + count * (index + 1), 0)); }
async function stateFor(ctx: Pick<QueryCtx, "db">, productId: Id<"commerce_products">, budget?: RequestReadLedger) {
    budget?.beforeRead();
    const state = await ctx.db.query("commerce_review_ratings").withIndex("by_product", q => q.eq("productId", productId)).unique();
    budget?.record(state);
    return state;
}
/** Null means pending/invalid, never a partial average. Empty catalogs need no migration. */
export async function readProductRatingSummary(ctx: Pick<QueryCtx, "db">, productId: Id<"commerce_products">, budget?: RequestReadLedger) {
    const state = await stateFor(ctx, productId, budget);
    if (!state) {
        budget?.beforeRead();
        const legacy = await ctx.db.query("commerce_review_items").withIndex("by_product", q => q.eq("productId", productId)).first();
        budget?.record(legacy);
        if (legacy)
            return null;
    }
    else if (state.phase !== "ready" || !validCounts(state.counts))
        return null;
    const counts = state?.counts ?? empty(), count = counts.reduce((sum, n) => sum + n, 0), sum = counts.reduce((sum, n, i) => sum + n * (i + 1), 0);
    return { count, average: count ? sum / count : 0, distribution: { 1: counts[0]!, 2: counts[1]!, 3: counts[2]!, 4: counts[3]!, 5: counts[4]! } };
}
async function ensureState(ctx: Context, productId: Id<"commerce_products">) {
    const existing = await stateFor(ctx, productId);
    if (existing)
        return existing;
    const legacy = await ctx.db.query("commerce_review_items").withIndex("by_product", q => q.eq("productId", productId)).first();
    const id = await ctx.db.insert("commerce_review_ratings", { ...baseline(productId), phase: legacy ? "pending" : "ready" });
    return (await ctx.db.get("commerce_review_ratings", id))!;
}
const compare = (entry: Entry, time: number, id: string) => entry._creationTime === time ? (entry._id === id ? 0 : entry._id < id ? -1 : 1) : entry._creationTime < time ? -1 : 1;
function included(state: State, entry: Entry | null) {
    if (!entry || entry.productId !== state.productId || entry.status !== "approved")
        return false;
    if (state.phase === "ready")
        return true;
    if (state.phase !== "scanning")
        return false;
    return (state.frontierTime !== null && state.frontierId !== null && compare(entry, state.frontierTime, state.frontierId) <= 0)
        || (state.horizonTime !== null && state.horizonId !== null && compare(entry, state.horizonTime, state.horizonId) > 0);
}
/** Same-transaction deltas cover both sides of a product reassignment, including in-flight rebuilds. */
export async function adjustProductRatings(ctx: Context, previous: Entry | null, next: Entry | null) {
    if (previous?.productId === next?.productId && previous?.status === next?.status && previous?.rating === next?.rating)
        return;
    const products = new Set([previous?.productId, next?.productId].filter((id): id is Id<"commerce_products"> => !!id));
    for (const productId of products) {
        const state = await ensureState(ctx, productId);
        if (state.phase === "pending")
            continue;
        const counts = [...state.counts];
        let valid = validCounts(counts);
        for (const [entry, delta] of [[previous, -1], [next, 1]] as const)
            if (entry && included(state, entry)) {
                if (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5) {
                    valid = false;
                    continue;
                }
                counts[entry.rating - 1] = (counts[entry.rating - 1] ?? 0) + delta;
            }
        if (!valid || !validCounts(counts))
            await ctx.db.patch("commerce_review_ratings", state._id, { phase: "pending", generation: state.generation + 1, updatedAt: Date.now() });
        else if (counts.some((value, index) => value !== state.counts[index]))
            await ctx.db.patch("commerce_review_ratings", state._id, { counts });
    }
}
export async function insertCountedReview(ctx: Context, value: WithoutSystemFields<Doc<"commerce_review_items">>) {
    validateReviewRating(value.rating);
    await ensureState(ctx, value.productId);
    const id = await ctx.db.insert("commerce_review_items", value);
    await adjustProductRatings(ctx, null, await ctx.db.get("commerce_review_items", id));
    return id;
}
export async function patchCountedReview(ctx: Context, id: Id<"commerce_review_items">, value: Partial<WithoutSystemFields<Doc<"commerce_review_items">>>) {
    if (value.rating !== undefined)
        validateReviewRating(value.rating);
    if (!["productId", "status", "rating"].some(key => Object.prototype.hasOwnProperty.call(value, key)))
        return ctx.db.patch("commerce_review_items", id, value);
    const old = await ctx.db.get("commerce_review_items", id);
    if (old)
        await ensureState(ctx, old.productId);
    if (value.productId)
        await ensureState(ctx, value.productId);
    await ctx.db.patch("commerce_review_items", id, value);
    await adjustProductRatings(ctx, old, old ? { ...old, ...value } : null);
}
export async function deleteCountedReview(ctx: Context, id: Id<"commerce_review_items">) {
    const old = await ctx.db.get("commerce_review_items", id);
    if (old)
        await ensureState(ctx, old.productId);
    await ctx.db.delete("commerce_review_items", id);
    await adjustProductRatings(ctx, old, null);
}
export async function beginRatingRepair(ctx: Context, productId: Id<"commerce_products">, force = false): Promise<RatingTask | null> {
    const state = await stateFor(ctx, productId), product = await ctx.db.get("commerce_products", productId);
    if (!product) {
        if (state)
            await ctx.db.delete("commerce_review_ratings", state._id);
        return null;
    }
    if (state?.phase === "ready" && validCounts(state.counts) && !force)
        return null;
    if (state?.phase === "scanning" && !force)
        return taskFor(state);
    const horizon = await ctx.db.query("commerce_review_items").withIndex("by_product", q => q.eq("productId", productId)).order("desc").first();
    const next = { ...baseline(productId), generation: (state?.generation ?? 0) + 1, phase: horizon ? "scanning" as const : "ready" as const, horizonTime: horizon?._creationTime ?? null, horizonId: horizon?._id ?? null };
    if (state)
        await ctx.db.patch("commerce_review_ratings", state._id, next);
    else
        await ctx.db.insert("commerce_review_ratings", next);
    return horizon ? taskFor(next) : null;
}
export async function advanceRatingRepair(ctx: Context, task: RatingTask): Promise<RatingTask | null> {
    const state = await stateFor(ctx, task.productId);
    if (!state || state.phase !== "scanning" || state.generation !== task.generation || state.frontierTime !== task.afterTime || state.frontierId !== task.afterId)
        return null;
    if (!await ctx.db.get("commerce_products", task.productId)) {
        await ctx.db.delete("commerce_review_ratings", state._id);
        return null;
    }
    if (state.horizonTime === null || state.horizonId === null)
        throw Error("Missing rating rebuild horizon");
    if (task.afterTime === state.horizonTime && task.afterId === state.horizonId) {
        await ctx.db.patch("commerce_review_ratings", state._id, { phase: "ready", updatedAt: Date.now() });
        return null;
    }
    const iterator = streamQuery(ctx, { schema, table: "commerce_review_items", index: "by_product", order: "asc", startIndexKey: task.afterTime === null ? [task.productId] : [task.productId, task.afterTime, task.afterId!], startInclusive: task.afterTime === null, endIndexKey: [task.productId, state.horizonTime, state.horizonId], endInclusive: true });
    let rows = 0, bytes = 0, frontierTime = state.frontierTime, frontierId = state.frontierId, done = false;
    const counts = [...state.counts];
    try {
        while (rows < RATING_PAGE_ROWS && bytes < RATING_PAGE_BYTES) {
            const next = await iterator.next();
            if (next.done) {
                done = true;
                break;
            }
            const entry = next.value[0];
            rows++;
            bytes += getDocumentSize(entry);
            if (entry.status === "approved") {
                validateReviewRating(entry.rating);
                counts[entry.rating - 1]++;
            }
            frontierTime = entry._creationTime;
            frontierId = entry._id;
        }
    }
    finally {
        await iterator.return(undefined);
    }
    if (!validCounts(counts))
        throw Error("Product ratings need repair before publication");
    await ctx.db.patch("commerce_review_ratings", state._id, { counts, frontierTime, frontierId, phase: done ? "ready" : "scanning", updatedAt: Date.now() });
    return done ? null : taskFor({ ...state, frontierTime, frontierId });
}
