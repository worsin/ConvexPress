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
import { internal } from "../_generated/api";
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

// ─── rollupDailyAnalytics ───────────────────────────────────────────────────

/**
 * Aggregate yesterday's raw pageEvents into pageAnalyticsDaily rollups.
 * Scheduled via cron at 00:05 UTC daily.
 *
 * Groups events by (path, referrerDomain, deviceType, country) and computes:
 *   - pageviews, uniqueVisitors, sessions
 *   - avgTimeOnPageMs, avgEngagedTimeMs, bounceRate
 *   - scrollDepth distribution
 *   - internalClicks, topClickTargets
 */
export const rollupDailyAnalytics = internalMutation({
  args: {
    date: v.optional(v.string()), // Override date for backfills, defaults to yesterday
  },
  handler: async (ctx, args) => {
    // Determine target date
    const targetDate =
      args.date ??
      (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      })();

    // Time boundaries for the target date (UTC)
    const startMs = new Date(targetDate + "T00:00:00Z").getTime();
    const endMs = new Date(targetDate + "T23:59:59.999Z").getTime();

    // Fetch all events for the target date
    const events = await ctx.db
      .query("pageEvents")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", startMs).lte("timestamp", endMs),
      )
      .collect();

    if (events.length === 0) return;

    // Group events by (path, referrerDomain, deviceType, country)
    const groups = new Map<string, typeof events>();
    for (const e of events) {
      const key = [
        e.path,
        e.referrerDomain ?? "__direct__",
        e.deviceType,
        e.country ?? "__unknown__",
      ].join("|");

      const group = groups.get(key) ?? [];
      group.push(e);
      groups.set(key, group);
    }

    // Process each group into a rollup
    for (const [, groupEvents] of groups) {
      const first = groupEvents[0];
      const path = first.path;
      const referrerDomain = first.referrerDomain ?? undefined;
      const deviceType = first.deviceType;
      const country = first.country ?? undefined;

      // Count pageviews
      const pageviewEvents = groupEvents.filter(
        (e) => e.eventType === "pageview",
      );
      const pageviews = pageviewEvents.length;
      if (pageviews === 0) continue; // Skip groups with no pageviews

      // Unique visitors and sessions
      const visitorIds = new Set(pageviewEvents.map((e) => e.visitorId));
      const sessionIds = new Set(pageviewEvents.map((e) => e.sessionId));

      // Time on page from exit events
      const exitEvents = groupEvents.filter(
        (e) => e.eventType === "exit" && e.payload?.timeOnPageMs != null,
      );
      let avgTimeOnPageMs = 0;
      let avgEngagedTimeMs = 0;
      if (exitEvents.length > 0) {
        avgTimeOnPageMs =
          exitEvents.reduce(
            (sum, e) => sum + (e.payload?.timeOnPageMs ?? 0),
            0,
          ) / exitEvents.length;
        avgEngagedTimeMs =
          exitEvents.reduce(
            (sum, e) => sum + (e.payload?.engagedTimeMs ?? 0),
            0,
          ) / exitEvents.length;
      }

      // Bounce rate: sessions with exactly 1 pageview
      const sessionPageviews = new Map<string, number>();
      for (const e of pageviewEvents) {
        sessionPageviews.set(
          e.sessionId,
          (sessionPageviews.get(e.sessionId) ?? 0) + 1,
        );
      }
      const bouncedSessions = Array.from(sessionPageviews.values()).filter(
        (count) => count === 1,
      ).length;
      const bounceRate =
        sessionPageviews.size > 0
          ? bouncedSessions / sessionPageviews.size
          : 0;

      // Scroll depth distribution
      const scrollEvents = groupEvents.filter(
        (e) => e.eventType === "scroll_depth" && e.payload?.section,
      );
      const sectionNames = [
        "hero",
        "topic-1",
        "topic-2",
        "topic-3",
        "topic-4",
        "topic-5",
        "summary",
        "sources",
        "comments",
      ];
      const sectionKeys: Array<
        keyof {
          hero: number;
          topic1: number;
          topic2: number;
          topic3: number;
          topic4: number;
          topic5: number;
          summary: number;
          sources: number;
          comments: number;
        }
      > = [
        "hero",
        "topic1",
        "topic2",
        "topic3",
        "topic4",
        "topic5",
        "summary",
        "sources",
        "comments",
      ];

      // Track which sections each visitor reached
      const visitorSections = new Map<string, Set<string>>();
      for (const e of scrollEvents) {
        const sections =
          visitorSections.get(e.visitorId) ?? new Set<string>();
        sections.add(e.payload!.section!);
        visitorSections.set(e.visitorId, sections);
      }

      const scrollDepth = {
        hero: 1.0, // Everyone sees the hero
        topic1: 0,
        topic2: 0,
        topic3: 0,
        topic4: 0,
        topic5: 0,
        summary: 0,
        sources: 0,
        comments: 0,
      };

      if (pageviews > 0) {
        for (let i = 0; i < sectionNames.length; i++) {
          const sectionName = sectionNames[i];
          const sectionKey = sectionKeys[i];
          if (sectionKey === "hero") continue; // Always 1.0

          let reached = 0;
          for (const sections of visitorSections.values()) {
            if (sections.has(sectionName)) reached++;
          }
          scrollDepth[sectionKey] = reached / pageviews;
        }
      }

      // Click metrics
      const clickEvents = groupEvents.filter(
        (e) => e.eventType === "click",
      );
      const internalClicks = clickEvents.length;

      const clickTargetMap = new Map<string, number>();
      for (const e of clickEvents) {
        if (e.payload?.targetPath) {
          clickTargetMap.set(
            e.payload.targetPath,
            (clickTargetMap.get(e.payload.targetPath) ?? 0) + 1,
          );
        }
      }
      const topClickTargets = Array.from(clickTargetMap.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([targetPath, count]) => ({ targetPath, count }));

      // Check if a rollup already exists for this key
      const existingRollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date_path", (q) =>
          q.eq("date", targetDate).eq("path", path),
        )
        .collect();

      const existing = existingRollups.find(
        (r) =>
          (r.referrerDomain ?? undefined) === referrerDomain &&
          r.deviceType === deviceType &&
          (r.country ?? undefined) === country,
      );

      const postId = first.postId ?? undefined;

      if (existing) {
        // Update existing rollup
        await ctx.db.patch(existing._id, {
          pageviews,
          uniqueVisitors: visitorIds.size,
          sessions: sessionIds.size,
          avgTimeOnPageMs,
          avgEngagedTimeMs,
          bounceRate,
          scrollDepth,
          internalClicks,
          topClickTargets,
        });
      } else {
        // Create new rollup
        await ctx.db.insert("pageAnalyticsDaily", {
          date: targetDate,
          path,
          postId,
          referrerDomain,
          deviceType,
          country,
          pageviews,
          uniqueVisitors: visitorIds.size,
          sessions: sessionIds.size,
          avgTimeOnPageMs,
          avgEngagedTimeMs,
          bounceRate,
          scrollDepth,
          internalClicks,
          topClickTargets,
        });
      }
    }
  },
});

// ─── purgeExpiredEvents ─────────────────────────────────────────────────────

/**
 * Delete pageEvents older than the retention period.
 * Scheduled via cron at 01:00 UTC daily.
 * Processes in batches to stay within Convex mutation time limits.
 * Reschedules itself if more events remain.
 */
export const purgeExpiredEvents = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 1000;

    // Read retention days from settings (default 90)
    const retentionSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) =>
        q.eq("key", "analytics_retention_days"),
      )
      .unique();
    const retentionDays =
      retentionSetting && typeof retentionSetting.value === "number"
        ? retentionSetting.value
        : 90;

    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // Fetch a batch of expired events
    const expired = await ctx.db
      .query("pageEvents")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffMs))
      .take(batchSize);

    // Delete the batch
    for (const event of expired) {
      await ctx.db.delete(event._id);
    }

    // If we got a full batch, there may be more -- reschedule
    if (expired.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.analytics.internals.purgeExpiredEvents,
        { batchSize },
      );
    }
  },
});
