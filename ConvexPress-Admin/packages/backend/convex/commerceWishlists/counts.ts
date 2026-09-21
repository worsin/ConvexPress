import { captureWishlistContribution, adjustOwnerSummary } from "./ownerTotals";
import { streamQuery } from "convex-helpers/server/pagination";
import { getDocumentSize } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import schema from "../schema";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

type Context = Pick<MutationCtx, "db">;
type Entry = Pick<
	Doc<"commerce_wishlist_items">,
	"_id" | "_creationTime" | "wishlistId"
>;
type State = Doc<"commerce_wishlist_counts">;
export type WishlistCountTask = {
	wishlistId: Id<"commerce_wishlists">;
	generation: number;
	afterTime: number | null;
	afterId: string | null;
};
export const WISHLIST_COUNT_PAGE_ROWS = 32,
	WISHLIST_COUNT_PAGE_BYTES = 512 * 1024;
const taskFor = (
	state: Pick<
		State,
		"wishlistId" | "generation" | "frontierTime" | "frontierId"
	>,
): WishlistCountTask => ({
	wishlistId: state.wishlistId,
	generation: state.generation,
	afterTime: state.frontierTime,
	afterId: state.frontierId,
});
const baseline = (wishlistId: Id<"commerce_wishlists">) => ({
	wishlistId,
	phase: "pending" as const,
	generation: 0,
	count: 0,
	updatedAt: Date.now(),
	frontierTime: null,
	frontierId: null,
	horizonTime: null,
	horizonId: null,
});
async function stateFor(
	ctx: Pick<QueryCtx, "db">,
	wishlistId: Id<"commerce_wishlists">,
	budget?: RequestReadLedger,
) {
	budget?.beforeRead();
	const state = await ctx.db
		.query("commerce_wishlist_counts")
		.withIndex("by_wishlist", (q) => q.eq("wishlistId", wishlistId))
		.unique();
	budget?.record(state);
	return state;
}
export async function readCompletedWishlistCount(
	ctx: Pick<QueryCtx, "db">,
	wishlistId: Id<"commerce_wishlists">,
	budget?: RequestReadLedger,
): Promise<number | null> {
	const state = await stateFor(ctx, wishlistId, budget);
	return state?.phase === "ready" &&
		Number.isSafeInteger(state.count) &&
		state.count >= 0
		? state.count
		: null;
}
function compare(entry: Entry, time: number, id: string) {
	return entry._creationTime === time
		? entry._id === id
			? 0
			: entry._id < id
				? -1
				: 1
		: entry._creationTime < time
			? -1
			: 1;
}
function included(
	state: State,
	entry: Entry | null,
	wishlistId: Id<"commerce_wishlists">,
) {
	if (!entry || entry.wishlistId !== wishlistId) return 0;
	if (state.phase === "ready") return 1;
	if (state.phase !== "scanning") return 0;
	// Scanned rows and writes after the fixed horizon are already represented.
	// Remaining original rows will be counted when their page is scanned.
	return (state.frontierTime !== null &&
		state.frontierId !== null &&
		compare(entry, state.frontierTime, state.frontierId) <= 0) ||
		(state.horizonTime !== null &&
			state.horizonId !== null &&
			compare(entry, state.horizonTime, state.horizonId) > 0)
		? 1
		: 0;
}
async function adjustWishlistItemCountInternal(
	ctx: Context,
	previous: Entry | null,
	next: Entry | null,
) {
	if (previous?.wishlistId === next?.wishlistId) return;
	const wishlists = new Set(
		[previous?.wishlistId, next?.wishlistId].filter(
			(id): id is Id<"commerce_wishlists"> => !!id,
		),
	);
	for (const wishlistId of wishlists) {
		const state = await stateFor(ctx, wishlistId);
		if (!state) {
			if (!(await ctx.db.get("commerce_wishlists", wishlistId))) continue;
			await ctx.db.insert("commerce_wishlist_counts", baseline(wishlistId));
			await ctx.db.patch("commerce_wishlists", wishlistId, {
				itemCountReady: false,
			});
			continue;
		}
		const count =
			state.count +
			included(state, next, wishlistId) -
			included(state, previous, wishlistId);
		if (!Number.isSafeInteger(count) || count < 0) {
			await ctx.db.patch("commerce_wishlist_counts", state._id, {
				phase: "pending",
				generation: state.generation + 1,
				updatedAt: Date.now(),
			});
			await ctx.db.patch("commerce_wishlists", wishlistId, {
				itemCountReady: false,
			});
		} else if (count !== state.count) {
			// Preserve progress time so writes cannot indefinitely postpone recovery of
			// a lost scheduler continuation on a busy wishlist.
			await ctx.db.patch("commerce_wishlist_counts", state._id, { count });
		}
	}
}
export async function insertCountedWishlistItem(
	ctx: Context,
	value: WithoutSystemFields<Doc<"commerce_wishlist_items">>,
) {
	const id = await ctx.db.insert("commerce_wishlist_items", value);
	const row = await ctx.db.get("commerce_wishlist_items", id);
	await adjustWishlistItemCount(ctx, null, row);
	return id;
}
export async function patchCountedWishlistItem(
	ctx: Context,
	id: Id<"commerce_wishlist_items">,
	value: Partial<WithoutSystemFields<Doc<"commerce_wishlist_items">>>,
) {
	if (!Object.prototype.hasOwnProperty.call(value, "wishlistId"))
		return ctx.db.patch("commerce_wishlist_items", id, value);
	const old = await ctx.db.get("commerce_wishlist_items", id);
	await ctx.db.patch("commerce_wishlist_items", id, value);
	await adjustWishlistItemCount(ctx, old, old ? { ...old, ...value } : null);
}
export async function deleteCountedWishlistItem(
	ctx: Context,
	id: Id<"commerce_wishlist_items">,
) {
	const old = await ctx.db.get("commerce_wishlist_items", id);
	await ctx.db.delete("commerce_wishlist_items", id);
	await adjustWishlistItemCount(ctx, old, null);
}
async function beginWishlistCountRepairInternal(
	ctx: Context,
	wishlistId: Id<"commerce_wishlists">,
	force = false,
): Promise<WishlistCountTask | null> {
	const state = await stateFor(ctx, wishlistId),
		wishlist = await ctx.db.get("commerce_wishlists", wishlistId);
	if (!wishlist) {
		if (state) await ctx.db.delete("commerce_wishlist_counts", state._id);
		return null;
	}
	if (state?.phase === "ready" && wishlist.itemCountReady === true && !force)
		return null;
	if (state?.phase === "scanning" && !force) return taskFor(state);
	const horizon = await ctx.db
		.query("commerce_wishlist_items")
		.withIndex("by_wishlist", (q) => q.eq("wishlistId", wishlistId))
		.order("desc")
		.first();
	const next = {
		...baseline(wishlistId),
		generation: (state?.generation ?? 0) + 1,
		phase: horizon ? ("scanning" as const) : ("ready" as const),
		horizonTime: horizon?._creationTime ?? null,
		horizonId: horizon?._id ?? null,
	};
	if (state) await ctx.db.patch("commerce_wishlist_counts", state._id, next);
	else await ctx.db.insert("commerce_wishlist_counts", next);
	await ctx.db.patch("commerce_wishlists", wishlistId, {
		itemCountReady: !horizon,
	});
	return horizon ? taskFor(next) : null;
}
/** The helper's index key includes _creationTime and _id. A fixed end key plus
 * same-transaction deltas avoids restarting a large scan when new entries arrive. */
async function advanceWishlistCountRepairInternal(
	ctx: Context,
	task: WishlistCountTask,
): Promise<WishlistCountTask | null> {
	const state = await stateFor(ctx, task.wishlistId);
	if (
		!state ||
		state.phase !== "scanning" ||
		state.generation !== task.generation ||
		state.frontierTime !== task.afterTime ||
		state.frontierId !== task.afterId
	)
		return null;
	if (!(await ctx.db.get("commerce_wishlists", task.wishlistId))) {
		await ctx.db.delete("commerce_wishlist_counts", state._id);
		return null;
	}
	if (state.horizonTime === null || state.horizonId === null)
		throw Error("Missing wishlist count horizon");
	// At a full final batch the frontier is already the fixed end key. Do not
	// reopen that key: an equal-bound stream can yield the endpoint again.
	if (
		task.afterTime === state.horizonTime &&
		task.afterId === state.horizonId
	) {
		await ctx.db.patch("commerce_wishlist_counts", state._id, {
			phase: "ready",
			updatedAt: Date.now(),
		});
		await ctx.db.patch("commerce_wishlists", task.wishlistId, {
			itemCountReady: true,
		});
		return null;
	}
	const iterator = streamQuery(ctx, {
		schema,
		table: "commerce_wishlist_items",
		index: "by_wishlist",
		order: "asc",
		startIndexKey:
			task.afterTime === null
				? [task.wishlistId]
				: [task.wishlistId, task.afterTime, task.afterId!],
		startInclusive: task.afterTime === null,
		endIndexKey: [task.wishlistId, state.horizonTime, state.horizonId],
		endInclusive: true,
	});
	let rows = 0,
		bytes = 0,
		count = state.count,
		frontierTime = state.frontierTime,
		frontierId = state.frontierId,
		done = false;
	try {
		while (
			rows < WISHLIST_COUNT_PAGE_ROWS &&
			bytes < WISHLIST_COUNT_PAGE_BYTES
		) {
			const next = await iterator.next();
			if (next.done) {
				done = true;
				break;
			}
			const entry = next.value[0];
			rows++;
			bytes += getDocumentSize(entry);
			count++;
			frontierTime = entry._creationTime;
			frontierId = entry._id;
		}
	} finally {
		await iterator.return(undefined);
	}
	if (!Number.isSafeInteger(count))
		throw Error("Wishlist count exceeds supported integer range");
	await ctx.db.patch("commerce_wishlist_counts", state._id, {
		count,
		frontierTime,
		frontierId,
		phase: done ? "ready" : "scanning",
		updatedAt: Date.now(),
	});
	if (done) {
		await ctx.db.patch("commerce_wishlists", task.wishlistId, {
			itemCountReady: true,
		});
		return null;
	}
	return taskFor({ ...state, frontierTime, frontierId });
}

export async function insertCountedWishlist(
	ctx: Context,
	value: WithoutSystemFields<Doc<"commerce_wishlists">>,
) {
	const id = await ctx.db.insert("commerce_wishlists", {
		...value,
		itemCountReady: undefined,
	});
	await beginWishlistCountRepairInternal(ctx, id);
	await adjustOwnerSummary(
		ctx,
		null,
		await captureWishlistContribution(ctx, id),
	);
	return id;
}
export async function patchCountedWishlist(
	ctx: Context,
	id: Id<"commerce_wishlists">,
	value: Partial<WithoutSystemFields<Doc<"commerce_wishlists">>>,
) {
	const before = await captureWishlistContribution(ctx, id);
	const { itemCountReady: _ignored, ...fields } = value;
	await ctx.db.patch("commerce_wishlists", id, fields);
	if (fields.userId !== undefined) {
		const state = await stateFor(ctx, id);
		if (state)
			await ctx.db.patch("commerce_wishlist_counts", state._id, {
				ownerId: fields.userId,
			});
	}
	await adjustOwnerSummary(
		ctx,
		before,
		await captureWishlistContribution(ctx, id),
	);
}
export async function deleteCountedWishlist(
	ctx: Context,
	id: Id<"commerce_wishlists">,
) {
	const before = await captureWishlistContribution(ctx, id);
	const state = await stateFor(ctx, id);
	await ctx.db.delete("commerce_wishlists", id);
	if (state) await ctx.db.delete("commerce_wishlist_counts", state._id);
	await adjustOwnerSummary(ctx, before, null);
}

export async function adjustWishlistItemCount(
	ctx: Context,
	previous: Entry | null,
	next: Entry | null,
) {
	const ids = [
		...new Set(
			[previous?.wishlistId, next?.wishlistId].filter(
				(id): id is Id<"commerce_wishlists"> => !!id,
			),
		),
	];
	const before = await Promise.all(
		ids.map((id) => captureWishlistContribution(ctx, id)),
	);
	await adjustWishlistItemCountInternal(ctx, previous, next);
	for (let i = 0; i < ids.length; i++)
		await adjustOwnerSummary(
			ctx,
			before[i],
			await captureWishlistContribution(ctx, ids[i]),
		);
}
export async function beginWishlistCountRepair(
	ctx: Context,
	wishlistId: Id<"commerce_wishlists">,
	force = false,
): Promise<WishlistCountTask | null> {
	const before = await captureWishlistContribution(ctx, wishlistId);
	const task = await beginWishlistCountRepairInternal(ctx, wishlistId, force);
	await adjustOwnerSummary(
		ctx,
		before,
		await captureWishlistContribution(ctx, wishlistId),
	);
	return task;
}
export async function advanceWishlistCountRepair(
	ctx: Context,
	task: WishlistCountTask,
): Promise<WishlistCountTask | null> {
	const before = await captureWishlistContribution(ctx, task.wishlistId);
	const next = await advanceWishlistCountRepairInternal(ctx, task);
	await adjustOwnerSummary(
		ctx,
		before,
		await captureWishlistContribution(ctx, task.wishlistId),
	);
	return next;
}
