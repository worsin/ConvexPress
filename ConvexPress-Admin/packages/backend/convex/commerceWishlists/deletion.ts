import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteDynamicWithMediaReferences } from "../media/attachmentGuard";
import {
	getActiveWishlistUser,
	requireCommerceWishlistsEnabled,
} from "./helpers";

export type DeletionTask = {
	jobId: Id<"commerce_wishlist_deletions">;
	generation: number;
};
export type DeletionProgress = {
	deleted: number;
	state: "pending" | "complete" | "blocked" | "obsolete";
};
const pageRef = makeFunctionReference<
	"mutation",
	DeletionTask,
	DeletionProgress
>("commerceWishlists/cleanup:page");
const BATCH_SIZE = 32;
const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Access disappears in the same transaction that durably records the cleanup.
 * Retrying an acknowledged-or-uncertain deletion reuses the owner's receipt. */
export async function beginWishlistDeletion(
	ctx: MutationCtx,
	args: { wishlistId: Id<"commerce_wishlists"> },
): Promise<Id<"commerce_wishlists">> {
	await requireCommerceWishlistsEnabled(ctx);
	const user = await getActiveWishlistUser(ctx);
	if (!user)
		throw new ConvexError({
			code: "auth_required",
			message: "Authentication required.",
		});
	const wishlist = await ctx.db.get("commerce_wishlists", args.wishlistId);
	const previous = await ctx.db
		.query("commerce_wishlist_deletions")
		.withIndex("by_wishlist", (q) => q.eq("wishlistId", args.wishlistId))
		.unique();
	if (!wishlist) {
		if (!previous || previous.requestedBy !== user._id)
			throw new ConvexError({
				code: "not_found",
				message: "Wishlist not found.",
			});
		if (previous.state === "blocked") {
			const task = { jobId: previous._id, generation: previous.generation + 1 };
			await ctx.db.patch("commerce_wishlist_deletions", previous._id, {
				generation: task.generation,
				state: "pending",
				deletedItems: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await advanceWishlistDeletion(ctx, task);
		} else if (previous.state === "pending") {
			await ctx.scheduler.runAfter(0, pageRef, {
				jobId: previous._id,
				generation: previous.generation,
			});
		}
		return args.wishlistId;
	}
	if (wishlist.userId !== user._id)
		throw new ConvexError({
			code: "unauthorized",
			message: "You do not own this wishlist.",
		});
	const generation = (previous?.generation ?? 0) + 1,
		now = Date.now();
	const value = {
		wishlistId: wishlist._id,
		requestedBy: user._id,
		generation,
		state: "pending" as const,
		deletedItems: 0,
		createdAt: now,
		updatedAt: now,
	};
	const jobId =
		previous?._id ??
		(await ctx.db.insert("commerce_wishlist_deletions", value));
	if (previous) await ctx.db.patch("commerce_wishlist_deletions", jobId, value);
	await deleteDynamicWithMediaReferences(ctx, wishlist._id);
	await advanceWishlistDeletion(ctx, { jobId, generation });
	return wishlist._id;
}

/** Restarting at the first remaining index entry makes duplicate deliveries safe.
 * Every deletion and its progress/continuation commit in a single transaction. */
export async function advanceWishlistDeletion(
	ctx: MutationCtx,
	task: DeletionTask,
): Promise<DeletionProgress> {
	const job = await ctx.db.get("commerce_wishlist_deletions", task.jobId);
	if (!job || job.generation !== task.generation)
		return { deleted: 0, state: "obsolete" };
	if (job.state !== "pending") return { deleted: 0, state: job.state };
	// A restore may put the same ID back. Never continue destructive work against
	// a live list; a subsequent authorized delete starts a new generation.
	if (await ctx.db.get("commerce_wishlists", job.wishlistId)) {
		await ctx.db.patch("commerce_wishlist_deletions", job._id, {
			state: "blocked",
			updatedAt: Date.now(),
		});
		return { deleted: 0, state: "blocked" };
	}
	const result = await ctx.db
		.query("commerce_wishlist_items")
		.withIndex("by_wishlist", (q) => q.eq("wishlistId", job.wishlistId))
		.paginate({
			cursor: null,
			numItems: BATCH_SIZE,
			maximumRowsRead: BATCH_SIZE,
			maximumBytesRead: 2 * 1024 * 1024,
		});
	for (const item of result.page)
		await deleteDynamicWithMediaReferences(ctx, item._id);
	const state = result.isDone ? "complete" : "pending";
	await ctx.db.patch("commerce_wishlist_deletions", job._id, {
		state,
		deletedItems: job.deletedItems + result.page.length,
		updatedAt: Date.now(),
	});
	if (!result.isDone) await ctx.scheduler.runAfter(0, pageRef, task);
	return { deleted: result.page.length, state };
}

/** A persisted pending job survives an interrupted/lost continuation. Recovery
 * does not require a still-active user session or an enabled Wishlist plugin. */
export async function recoverWishlistDeletions(
	ctx: MutationCtx,
): Promise<{ resumed: number; pruned: number }> {
	const now = Date.now();
	const stalled = await ctx.db
		.query("commerce_wishlist_deletions")
		.withIndex("by_state_updated_at", (q) =>
			q.eq("state", "pending").lt("updatedAt", now - 60_000),
		)
		.take(16);
	for (const job of stalled) {
		await ctx.db.patch("commerce_wishlist_deletions", job._id, {
			updatedAt: now,
		});
		await ctx.scheduler.runAfter(0, pageRef, {
			jobId: job._id,
			generation: job.generation,
		});
	}
	const expired = await ctx.db
		.query("commerce_wishlist_deletions")
		.withIndex("by_state_updated_at", (q) =>
			q.eq("state", "complete").lt("updatedAt", now - RECEIPT_RETENTION_MS),
		)
		.take(64);
	for (const job of expired)
		await ctx.db.delete("commerce_wishlist_deletions", job._id);
	return { resumed: stalled.length, pruned: expired.length };
}
