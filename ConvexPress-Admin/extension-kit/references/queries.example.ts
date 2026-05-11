/**
 * REFERENCE — Extension queries (v2 Layer 2)
 *
 * Example uses the "events" extension. Substitute names for yours.
 *
 * Path in real code (pick one based on distribution scope):
 *   Official:  packages/backend/convex/extensions/<id>/queries.ts
 *   Local:     packages/backend/convex/extensions.local/<id>/queries.ts
 *
 * The Convex API path exposed at runtime is:
 *   api.extensions.<id>.queries.*
 *
 * Note the helper import paths use `../../helpers/...` (two levels up)
 * because extensions live two folders below `convex/`.
 *
 * What this reference demonstrates:
 *   1. Public-safe `listPublished` (filters by status, projects fields)
 *   2. Admin `list` (paginated, returns everything)
 *   3. `getBySlug` for the public single-page query
 *   4. `counts` for the admin dashboard summary
 *   5. Pagination using `paginationOpts`
 *   6. Indexed reads — every query uses an index, no full scans
 */

import { query } from "../../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── Public-safe: events that visitors can see ────────────────────────────────

export const listPublished = query({
	args: {
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, { paginationOpts }) => {
		// Use the composite index for status + startsAt, so future-events
		// queries are cheap.
		const page = await ctx.db
			.query("events")
			.withIndex("by_status_startsAt", (q) =>
				q.eq("status", "published"),
			)
			.order("desc")
			.paginate(paginationOpts);

		// Project to public-safe shape. Never return raw docs from a public
		// query — strip any internal/admin-only fields.
		return {
			...page,
			page: page.page.map((e) => ({
				_id: e._id,
				title: e.title,
				slug: e.slug,
				description: e.description,
				startsAt: e.startsAt,
				endsAt: e.endsAt,
				venue: e.venue,
				venueAddress: e.venueAddress,
				registrationUrl: e.registrationUrl,
				featuredImageAlt: e.featuredImageAlt,
				// featuredImageStorageId resolved to a URL by the Website caller
				// or via a related media query — don't expose storage ids
				// blindly.
			})),
		};
	},
});

// ─── Public-safe: single event by slug ────────────────────────────────────────

export const getBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();

		// Only published events are publicly visible.
		if (!event || event.status !== "published") return null;

		return {
			_id: event._id,
			title: event.title,
			slug: event.slug,
			description: event.description,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			venue: event.venue,
			venueAddress: event.venueAddress,
			registrationUrl: event.registrationUrl,
			capacity: event.capacity,
			attendeeCount: event.attendeeCount,
			featuredImageAlt: event.featuredImageAlt,
		};
	},
});

// ─── Admin: paginated list of every event regardless of status ───────────────

export const list = query({
	args: {
		paginationOpts: paginationOptsValidator,
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("scheduled"),
				v.literal("published"),
				v.literal("archived"),
			),
		),
	},
	handler: async (ctx, { paginationOpts, status }) => {
		// requireAuth/requireCan would normally check admin access; queries
		// can also be gated. Here we let admin UI's route guards handle the
		// capability check and just authenticate the read.
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return { page: [], isDone: true, continueCursor: null };

		if (status) {
			return ctx.db
				.query("events")
				.withIndex("by_status", (q) => q.eq("status", status))
				.order("desc")
				.paginate(paginationOpts);
		}

		// All statuses
		return ctx.db.query("events").order("desc").paginate(paginationOpts);
	},
});

// ─── Admin: single event by id (admin can see drafts/archived) ───────────────

export const get = query({
	args: { id: v.id("events") },
	handler: async (ctx, { id }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		return ctx.db.get(id);
	},
});

// ─── Admin: counts for dashboard widget ──────────────────────────────────────

export const counts = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		// Count each status separately via the by_status index.
		const [drafts, scheduled, published, archived] = await Promise.all([
			ctx.db
				.query("events")
				.withIndex("by_status", (q) => q.eq("status", "draft"))
				.collect()
				.then((r) => r.length),
			ctx.db
				.query("events")
				.withIndex("by_status", (q) => q.eq("status", "scheduled"))
				.collect()
				.then((r) => r.length),
			ctx.db
				.query("events")
				.withIndex("by_status", (q) => q.eq("status", "published"))
				.collect()
				.then((r) => r.length),
			ctx.db
				.query("events")
				.withIndex("by_status", (q) => q.eq("status", "archived"))
				.collect()
				.then((r) => r.length),
		]);

		return { drafts, scheduled, published, archived };
	},
});
