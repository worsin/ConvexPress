/**
 * REFERENCE — Extension mutations (v2 Layer 3)
 *
 * Example uses the "events" extension.
 *
 * Path in real code (pick one based on distribution scope):
 *   Official:  packages/backend/convex/extensions/<id>/mutations.ts
 *   Local:     packages/backend/convex/extensions.local/<id>/mutations.ts
 *
 * The Convex API path exposed at runtime is:
 *   api.extensions.<id>.mutations.*
 *
 * Note the helper import paths use `../../helpers/...` (two levels up)
 * because extensions live two folders below `convex/`.
 *
 * What this reference demonstrates:
 *   1. requireCan(ctx, "<capability>") at the TOP of every handler
 *   2. emitEvent(...) for state-changing operations (audit trail)
 *   3. Soft-delete via status, not row removal
 *   4. Input validation with v.* validators
 *   5. Returning the created/updated doc so the client doesn't re-fetch
 */

import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
// Event/system constants — if these don't exist for your domain yet,
// add them to convex/events/constants.ts following existing naming.
// import { EVENT_EVENTS, SYSTEM } from "../events/constants";

// ─── Create ──────────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		startsAt: v.number(),
		endsAt: v.number(),
		venue: v.optional(v.string()),
		venueAddress: v.optional(v.string()),
		registrationUrl: v.optional(v.string()),
		capacity: v.optional(v.number()),
		featuredImageStorageId: v.optional(v.id("_storage")),
		featuredImageAlt: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// 1. Authorize. REQUIRED for every mutation, no exceptions.
		const user = await requireCan(ctx, "event.create");

		// 2. Validate business rules beyond the type check.
		if (args.endsAt < args.startsAt) {
			throw new ConvexError(
				"Event end time must be after start time.",
			);
		}

		// Confirm slug is unique. With an index on `by_slug`, this is cheap.
		const existing = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();
		if (existing) {
			throw new ConvexError(
				`An event with slug "${args.slug}" already exists.`,
			);
		}

		// 3. Insert.
		const now = Date.now();
		const eventId = await ctx.db.insert("events", {
			title: args.title,
			slug: args.slug,
			description: args.description,
			startsAt: args.startsAt,
			endsAt: args.endsAt,
			venue: args.venue,
			venueAddress: args.venueAddress,
			registrationUrl: args.registrationUrl,
			capacity: args.capacity,
			attendeeCount: 0,
			featuredImageStorageId: args.featuredImageStorageId,
			featuredImageAlt: args.featuredImageAlt,
			status: "draft",
			createdBy: user._id,
			createdAt: now,
			updatedAt: now,
		});

		// 4. Emit event. Picked up by audit log, notifications, sync.
		// If event/system constants don't exist yet, add them in
		// convex/events/constants.ts following the existing pattern, e.g.:
		//   export const EVENT_EVENTS = { CREATED: "event.created", ... };
		// await emitEvent(ctx, EVENT_EVENTS.CREATED, SYSTEM.EVENTS, {
		// 	eventId,
		// 	title: args.title,
		// });

		// 5. Return the created doc (so the client can navigate without
		// refetching).
		return await ctx.db.get(eventId);
	},
});

// ─── Update ──────────────────────────────────────────────────────────────────

export const update = mutation({
	args: {
		id: v.id("events"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		startsAt: v.optional(v.number()),
		endsAt: v.optional(v.number()),
		venue: v.optional(v.string()),
		venueAddress: v.optional(v.string()),
		registrationUrl: v.optional(v.string()),
		capacity: v.optional(v.number()),
		featuredImageStorageId: v.optional(v.id("_storage")),
		featuredImageAlt: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireCan(ctx, "event.update");

		const existing = await ctx.db.get(args.id);
		if (!existing) throw new ConvexError("Event not found.");

		// Partial update — only the fields passed get written.
		const { id, ...fields } = args;
		await ctx.db.patch(id, {
			...fields,
			updatedBy: user._id,
			updatedAt: Date.now(),
		});

		// await emitEvent(ctx, EVENT_EVENTS.UPDATED, SYSTEM.EVENTS, { eventId: id });

		return await ctx.db.get(id);
	},
});

// ─── Publish / unpublish (status transitions) ────────────────────────────────

export const publish = mutation({
	args: { id: v.id("events") },
	handler: async (ctx, { id }) => {
		const user = await requireCan(ctx, "event.publish");

		const existing = await ctx.db.get(id);
		if (!existing) throw new ConvexError("Event not found.");
		if (existing.status === "published") return existing;

		await ctx.db.patch(id, {
			status: "published",
			publishedAt: Date.now(),
			updatedBy: user._id,
			updatedAt: Date.now(),
		});

		// await emitEvent(ctx, EVENT_EVENTS.PUBLISHED, SYSTEM.EVENTS, { eventId: id });

		return await ctx.db.get(id);
	},
});

// ─── Soft delete (archive) ──────────────────────────────────────────────────

export const archive = mutation({
	args: { id: v.id("events") },
	handler: async (ctx, { id }) => {
		const user = await requireCan(ctx, "event.delete");

		const existing = await ctx.db.get(id);
		if (!existing) throw new ConvexError("Event not found.");

		// Soft delete via status, preserving the row so other systems'
		// references stay valid. Hard delete is rarely correct for content
		// that other systems may have linked.
		await ctx.db.patch(id, {
			status: "archived",
			updatedBy: user._id,
			updatedAt: Date.now(),
		});

		// await emitEvent(ctx, EVENT_EVENTS.ARCHIVED, SYSTEM.EVENTS, { eventId: id });

		return { success: true };
	},
});
