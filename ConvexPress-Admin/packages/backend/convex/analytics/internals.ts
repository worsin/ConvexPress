/**
 * Analytics System - Internal Functions
 *
 * Not callable from clients. Used by:
 *   - HTTP action (ingestEvents, resolvePostFromPath)
 *   - Cron jobs (rollupDailyAnalytics, purgeExpiredEvents)
 *
 * These are the workhorses of the analytics pipeline.
 */

import {
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";

// ─── resolvePostFromPath ────────────────────────────────────────────────────

/**
 * Look up a published post by its URL path.
 * Returns the post _id if found, undefined otherwise.
 *
 * Supports paths like:
 *   /blog/my-post-slug  -> looks up slug "my-post-slug"
 *   /my-page-slug       -> looks up slug "my-page-slug" (pages)
 */
export const resolvePostFromPath = internalQuery({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    // Extract slug from path
    let slug: string;
    if (args.path.startsWith("/blog/")) {
      slug = args.path.slice(6);
    } else if (args.path.startsWith("/")) {
      slug = args.path.slice(1);
    } else {
      slug = args.path;
    }

    // Remove any remaining slashes (e.g., nested page paths)
    // For pages with hierarchy, use the last segment
    const segments = slug.split("/").filter(Boolean);
    if (segments.length === 0) return undefined;
    slug = segments[segments.length - 1];

    // Look up post by slug
    const post = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (post && post.status === "publish") {
      return post._id;
    }

    return undefined;
  },
});

// ─── ingestEvents ───────────────────────────────────────────────────────────

/**
 * Write validated, normalized events to the pageEvents table.
 * Called by the HTTP action after validation and normalization.
 *
 * Uses v.any() for the events array since the HTTP action has already
 * validated the shape. This avoids duplicating the full validator at
 * the internal boundary.
 */
export const ingestEvents = internalMutation({
  args: {
    events: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    for (const event of args.events) {
      await ctx.db.insert("pageEvents", {
        eventType: event.eventType,
        timestamp: event.timestamp,
        path: event.path,
        postId: event.postId,
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        referrer: event.referrer,
        referrerDomain: event.referrerDomain,
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        deviceType: event.deviceType,
        browser: event.browser,
        os: event.os,
        country: event.country,
        region: event.region,
        payload: event.payload,
      });
    }
  },
});
