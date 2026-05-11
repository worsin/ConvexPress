/**
 * REFERENCE — Extension schema (v2 Layer 1)
 *
 * Example uses a hypothetical "events" extension. Substitute names for
 * your actual extension.
 *
 * Path it lives at in real code (pick one based on distribution scope):
 *   Official:  packages/backend/convex/extensions/<id>/schema.ts
 *   Local:     packages/backend/convex/extensions.local/<id>/schema.ts
 *
 * Export shape: a single named export `tables` (a record of
 * `defineTable(...)` calls). The codegen script
 * `packages/backend/scripts/generate-extension-index.mjs` scans both
 * extension roots, imports your `tables` export, and merges it into
 * the schema hub. **You do NOT edit packages/backend/convex/schema.ts.**
 *
 * What this reference demonstrates:
 *   1. The v2 named export convention: `tables` (the codegen script
 *      imports this exact name)
 *   2. Typed validators for every field (no v.any unless justified)
 *   3. Explicit indexes for every query path the queries.ts will use
 *   4. Cross-system references via v.id("users")
 *   5. Soft-delete via a status union, not an isDeleted boolean
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const tables = {
	events: defineTable({
		// ── Core fields ──────────────────────────────────────────────────────
		title: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),

		// ── Event-specific fields (the reason this CPT exists) ──────────────
		startsAt: v.number(),                  // unix ms
		endsAt: v.number(),                    // unix ms
		venue: v.optional(v.string()),
		venueAddress: v.optional(v.string()),
		registrationUrl: v.optional(v.string()),
		capacity: v.optional(v.number()),
		attendeeCount: v.number(),             // running counter

		// ── Standard content fields ─────────────────────────────────────────
		featuredImageStorageId: v.optional(v.id("_storage")),
		featuredImageAlt: v.optional(v.string()),

		// ── Lifecycle ───────────────────────────────────────────────────────
		// Soft-delete via status union, NOT an isDeleted boolean. This lets
		// `commerce_subscription_templates` and other systems reference the
		// row without the FK breaking when an admin "deletes" it.
		status: v.union(
			v.literal("draft"),
			v.literal("scheduled"),
			v.literal("published"),
			v.literal("archived"),
		),
		publishedAt: v.optional(v.number()),

		// ── Ownership / audit ───────────────────────────────────────────────
		createdBy: v.id("users"),
		updatedBy: v.optional(v.id("users")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		// Indexes — one per query path the queries.ts file will use.
		// Naming convention: by_<column> or by_<a>_<b> for composite.
		.index("by_slug", ["slug"])
		.index("by_status", ["status"])
		.index("by_status_startsAt", ["status", "startsAt"])
		.index("by_createdBy", ["createdBy"]),

	// Optional second table — events can have RSVPs (attendees). Each table
	// the extension owns lives in this same exported object.
	eventAttendees: defineTable({
		eventId: v.id("events"),
		userId: v.optional(v.id("users")),  // null if guest RSVP
		guestEmail: v.optional(v.string()),
		guestName: v.optional(v.string()),
		status: v.union(
			v.literal("registered"),
			v.literal("waitlist"),
			v.literal("cancelled"),
			v.literal("attended"),
		),
		registeredAt: v.number(),
	})
		.index("by_eventId", ["eventId"])
		.index("by_eventId_status", ["eventId", "status"])
		.index("by_userId", ["userId"]),
};

/**
 * After saving this file, the v2 codegen does the rest:
 *
 *   cd ConvexPress-Admin/packages/backend
 *   bun run codegen:extensions
 *
 * The script discovers your `tables` export and rewrites
 *   convex/schema/_extensionsIndex.generated.ts
 * which the main schema.ts imports and spreads into `defineSchema`.
 *
 * Codegen also runs automatically as a `predev` / `predeploy` hook,
 * so in normal flows you don't need to run it by hand.
 *
 * **Do not** edit packages/backend/convex/schema.ts or the generated
 * index file. The kit's WORKFLOW.md covers this as Phase 3.
 */
