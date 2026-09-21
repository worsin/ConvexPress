import { streamQuery } from "convex-helpers/server/pagination";
import { getDocumentSize } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import schema from "../schema";
type Context = Pick<MutationCtx, "db">;
type State = Doc<"commerce_wishlist_owner_totals">;
export type OwnerSummaryTask = {
	ownerId: Id<"users">;
	generation: number;
	afterTime: number | null;
	afterId: string | null;
};
export type OwnerSummary =
	| { state: "ready"; totalLists: number; totalItems: number }
	| { state: "preparing"; totalLists: null; totalItems: null };
export type WishlistContribution = {
	_id: Id<"commerce_wishlists">;
	_creationTime: number;
	ownerId: Id<"users">;
	items: number | null;
};
const pending: OwnerSummary = {
	state: "preparing",
	totalLists: null,
	totalItems: null,
};
const baseline = (ownerId: Id<"users">) => ({
	ownerId,
	phase: "pending" as const,
	generation: 0,
	totalLists: 0,
	totalItems: 0,
	pendingCounts: 0,
	updatedAt: Date.now(),
	frontierTime: null,
	frontierId: null,
	horizonTime: null,
	horizonId: null,
});
const taskFor = (
	s: Pick<State, "ownerId" | "generation" | "frontierTime" | "frontierId">,
): OwnerSummaryTask => ({
	ownerId: s.ownerId,
	generation: s.generation,
	afterTime: s.frontierTime,
	afterId: s.frontierId,
});
async function stateFor(ctx: Pick<QueryCtx, "db">, ownerId: Id<"users">) {
	return ctx.db
		.query("commerce_wishlist_owner_totals")
		.withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
		.unique();
}
function completed(state: Doc<"commerce_wishlist_counts"> | null) {
	return state?.phase === "ready" &&
		Number.isSafeInteger(state.count) &&
		state.count >= 0
		? state.count
		: null;
}
/** Cache only immutable list coordinates and explicitly maintained ownership in
 * the small count row. Item batches need not repeatedly load a large list body. */
export async function captureWishlistContribution(
	ctx: Context,
	id: Id<"commerce_wishlists">,
): Promise<WishlistContribution | null> {
	const count = await ctx.db
		.query("commerce_wishlist_counts")
		.withIndex("by_wishlist", (q) => q.eq("wishlistId", id))
		.unique();
	if (count?.ownerId !== undefined && count.listCreatedAt !== undefined)
		return {
			_id: id,
			_creationTime: count.listCreatedAt,
			ownerId: count.ownerId,
			items: completed(count),
		};
	const list = await ctx.db.get("commerce_wishlists", id);
	if (!list) return null;
	if (count)
		await ctx.db.patch("commerce_wishlist_counts", count._id, {
			ownerId: list.userId,
			listCreatedAt: list._creationTime,
		});
	return {
		_id: id,
		_creationTime: list._creationTime,
		ownerId: list.userId,
		items: completed(count),
	};
}
function compare(e: WishlistContribution, time: number, id: string) {
	return e._creationTime === time
		? e._id === id
			? 0
			: e._id < id
				? -1
				: 1
		: e._creationTime < time
			? -1
			: 1;
}
function included(
	s: State,
	e: WishlistContribution | null,
	ownerId: Id<"users">,
) {
	if (!e || e.ownerId !== ownerId) return false;
	if (s.phase === "ready") return true;
	if (s.phase !== "scanning") return false;
	return (
		(s.frontierTime !== null &&
			s.frontierId !== null &&
			compare(e, s.frontierTime, s.frontierId) <= 0) ||
		(s.horizonTime !== null &&
			s.horizonId !== null &&
			compare(e, s.horizonTime, s.horizonId) > 0)
	);
}
export async function adjustOwnerSummary(
	ctx: Context,
	old: WishlistContribution | null,
	next: WishlistContribution | null,
) {
	if (
		old?._id === next?._id &&
		old?.ownerId === next?.ownerId &&
		old?.items === next?.items
	)
		return;
	const owners = new Set(
		[old?.ownerId, next?.ownerId].filter((id): id is Id<"users"> => !!id),
	);
	for (const ownerId of owners) {
		const s = await stateFor(ctx, ownerId);
		if (!s) {
			if (await ctx.db.get("users", ownerId))
				await ctx.db.insert(
					"commerce_wishlist_owner_totals",
					baseline(ownerId),
				);
			continue;
		}
		const before = included(s, old, ownerId) ? old : null,
			after = included(s, next, ownerId) ? next : null;
		const totals = {
			totalLists: s.totalLists + Number(!!after) - Number(!!before),
			totalItems: s.totalItems + (after?.items ?? 0) - (before?.items ?? 0),
			pendingCounts:
				s.pendingCounts +
				Number(!!after && after.items === null) -
				Number(!!before && before.items === null),
		};
		if (Object.values(totals).some((n) => !Number.isSafeInteger(n) || n < 0))
			await ctx.db.patch("commerce_wishlist_owner_totals", s._id, {
				phase: "pending",
				generation: s.generation + 1,
				updatedAt: Date.now(),
			});
		else if (
			totals.totalLists !== s.totalLists ||
			totals.totalItems !== s.totalItems ||
			totals.pendingCounts !== s.pendingCounts
		)
			await ctx.db.patch("commerce_wishlist_owner_totals", s._id, totals);
	}
}
function validTotals(s: State) {
	return (
		[s.totalLists, s.totalItems, s.pendingCounts].every(
			(n) => Number.isSafeInteger(n) && n >= 0,
		) && s.pendingCounts <= s.totalLists
	);
}
export async function readOwnerSummary(
	ctx: Pick<QueryCtx, "db">,
	ownerId: Id<"users">,
): Promise<OwnerSummary> {
	const s = await stateFor(ctx, ownerId);
	if (!s) {
		const first = await ctx.db
			.query("commerce_wishlists")
			.withIndex("by_user", (q) => q.eq("userId", ownerId))
			.first();
		return first ? pending : { state: "ready", totalLists: 0, totalItems: 0 };
	}
	return s.phase === "ready" && s.pendingCounts === 0 && validTotals(s)
		? { state: "ready", totalLists: s.totalLists, totalItems: s.totalItems }
		: pending;
}
export async function beginOwnerSummaryRepair(
	ctx: Context,
	ownerId: Id<"users">,
	force = false,
): Promise<OwnerSummaryTask | null> {
	const s = await stateFor(ctx, ownerId);
	if (!(await ctx.db.get("users", ownerId))) {
		if (s) await ctx.db.delete("commerce_wishlist_owner_totals", s._id);
		return null;
	}
	if (s?.phase === "ready" && validTotals(s) && !force) return null;
	if (s?.phase === "scanning" && !force) return taskFor(s);
	const horizon = await ctx.db
		.query("commerce_wishlists")
		.withIndex("by_user", (q) => q.eq("userId", ownerId))
		.order("desc")
		.first();
	const next = {
		...baseline(ownerId),
		phase: horizon ? ("scanning" as const) : ("ready" as const),
		generation: (s?.generation ?? 0) + 1,
		horizonTime: horizon?._creationTime ?? null,
		horizonId: horizon?._id ?? null,
	};
	if (s) await ctx.db.patch("commerce_wishlist_owner_totals", s._id, next);
	else await ctx.db.insert("commerce_wishlist_owner_totals", next);
	return horizon ? taskFor(next) : null;
}
export async function advanceOwnerSummaryRepair(
	ctx: Context,
	task: OwnerSummaryTask,
): Promise<OwnerSummaryTask | null> {
	const s = await stateFor(ctx, task.ownerId);
	if (
		!s ||
		s.phase !== "scanning" ||
		s.generation !== task.generation ||
		s.frontierTime !== task.afterTime ||
		s.frontierId !== task.afterId
	)
		return null;
	if (!(await ctx.db.get("users", task.ownerId))) {
		await ctx.db.delete("commerce_wishlist_owner_totals", s._id);
		return null;
	}
	if (s.horizonTime === null || s.horizonId === null)
		throw Error("Missing owner summary horizon");
	if (task.afterTime === s.horizonTime && task.afterId === s.horizonId) {
		await ctx.db.patch("commerce_wishlist_owner_totals", s._id, {
			phase: "ready",
			updatedAt: Date.now(),
		});
		return null;
	}
	const stream = streamQuery(ctx, {
		schema,
		table: "commerce_wishlists",
		index: "by_user",
		order: "asc",
		startIndexKey:
			task.afterTime === null
				? [task.ownerId]
				: [task.ownerId, task.afterTime, task.afterId!],
		startInclusive: task.afterTime === null,
		endIndexKey: [task.ownerId, s.horizonTime, s.horizonId],
		endInclusive: true,
	});
	let rows = 0,
		bytes = 0,
		done = false,
		totalLists = s.totalLists,
		totalItems = s.totalItems,
		pendingCounts = s.pendingCounts,
		frontierTime = s.frontierTime,
		frontierId = s.frontierId;
	try {
		while (rows < 24 && bytes < 512 * 1024) {
			const result = await stream.next();
			if (result.done) {
				done = true;
				break;
			}
			const list = result.value[0];
			rows++;
			bytes += getDocumentSize(list);
			const count = await ctx.db
				.query("commerce_wishlist_counts")
				.withIndex("by_wishlist", (q) => q.eq("wishlistId", list._id))
				.unique();
			const items = completed(count);
			totalLists++;
			if (items === null) pendingCounts++;
			else totalItems += items;
			frontierTime = list._creationTime;
			frontierId = list._id;
		}
	} finally {
		await stream.return(undefined);
	}
	if (
		[totalLists, totalItems, pendingCounts].some(
			(n) => !Number.isSafeInteger(n) || n < 0,
		)
	)
		throw Error("Wishlist totals exceed supported integer range");
	await ctx.db.patch("commerce_wishlist_owner_totals", s._id, {
		totalLists,
		totalItems,
		pendingCounts,
		frontierTime,
		frontierId,
		phase: done ? "ready" : "scanning",
		updatedAt: Date.now(),
	});
	return done ? null : taskFor({ ...s, frontierTime, frontierId });
}
