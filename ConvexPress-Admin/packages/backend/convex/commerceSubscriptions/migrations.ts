/**
 * Commerce Subscriptions — one-off data repairs.
 *
 * endItemsOfEndedContracts: before upstream PR 028 a contract that was
 * cancelled or expired kept its items `active`. This ends them the way the
 * lifecycle now does (the contract's status, with its `cancelledAt`). Safe to
 * re-run; it pages through ended contracts and schedules itself until done.
 *
 * Run from the dashboard or CLI:
 *   internal.commerceSubscriptions.migrations.endItemsOfEndedContracts {}
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

const BATCH = 100;

export const endItemsOfEndedContracts = internalMutation({
	args: {
		status: v.optional(v.union(v.literal("cancelled"), v.literal("expired"))),
		cursor: v.optional(v.union(v.string(), v.null())),
		itemsEnded: v.optional(v.number()),
	},
	returns: v.object({ itemsEnded: v.number(), done: v.boolean() }),
	handler: async (ctx, args) => {
		const status = args.status ?? "cancelled";
		const page = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q) => q.eq("status", status))
			.paginate({ numItems: BATCH, cursor: args.cursor ?? null });

		let itemsEnded = args.itemsEnded ?? 0;
		for (const contract of page.page) {
			const endedAt = contract.cancelledAt ?? contract.updatedAt;
			const items = await ctx.db
				.query("commerce_subscription_items")
				.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
				.collect();
			for (const item of items) {
				if (item.status === "cancelled" || item.status === "expired") continue;
				await ctx.db.patch("commerce_subscription_items", item._id, { status, cancelledAt: endedAt, updatedAt: Date.now() });
				itemsEnded++;
			}
		}

		if (!page.isDone) {
			await ctx.scheduler.runAfter(0, internal.commerceSubscriptions.migrations.endItemsOfEndedContracts, {
				status,
				cursor: page.continueCursor,
				itemsEnded,
			});
			return { itemsEnded, done: false };
		}
		if (status === "cancelled") {
			await ctx.scheduler.runAfter(0, internal.commerceSubscriptions.migrations.endItemsOfEndedContracts, {
				status: "expired",
				cursor: null,
				itemsEnded,
			});
			return { itemsEnded, done: false };
		}
		console.log(`[commerceSubscriptions.migrations] endItemsOfEndedContracts: ${itemsEnded} item(s) ended`);
		return { itemsEnded, done: true };
	},
});
