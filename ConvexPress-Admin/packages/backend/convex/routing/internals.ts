/**
 * Routing System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Website middleware (redirect resolution)
 *   - Event handlers (slug changes, permalink changes, content publication)
 *   - Scheduled jobs (404 log cleanup)
 *   - Cross-system internal calls
 *
 * Functions:
 *   resolveRedirect          - Look up a redirect by URL (middleware, 3-tier: exact -> prefix -> regex)
 *   generateSlugRedirect     - Auto-create redirect when a post/page slug changes
 *   batchCreateRedirects     - Batch insert redirect records (for permalink changes)
 *   recordRedirectHit        - Increment hit counter on a redirect (fire-and-forget)
 *   log404                   - Log or aggregate a 404 hit
 *   cleanup404Log            - Scheduled cleanup of old/low-hit 404 entries
 *   clearNotFoundForUrl      - Remove 404 entry for a URL (when content is published there)
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import {
  resolveRedirectArgs,
  generateSlugRedirectArgs,
  batchCreateRedirectsArgs,
  recordRedirectHitArgs,
  log404Args,
  MAX_NOT_FOUND_RECORDS,
  RESOLVED_CLEANUP_DAYS,
  UNRESOLVED_LOW_HIT_CLEANUP_DAYS,
  UNRESOLVED_MIN_HITS,
  MAX_BATCH_SIZE,
} from "./validators";

// ─── Resolve Redirect ───────────────────────────────────────────────────────

/**
 * Look up a redirect by URL for the website middleware.
 *
 * 3-tier matching strategy (in priority order):
 *   1. Exact match: Query by_source_url index, filter enabled
 *   2. Prefix match: Query all enabled prefix redirects, longest prefix wins
 *   3. Regex match: Query all enabled regex redirects, test each pattern
 *
 * Returns the matching redirect record or null.
 *
 * Performance targets:
 *   - Exact match: < 5ms (index lookup)
 *   - Prefix match: < 10ms (filtered scan)
 *   - Regex match: < 20ms (pattern testing, max 50 regex redirects)
 */
export const resolveRedirect = internalQuery({
  args: resolveRedirectArgs,
  handler: async (ctx, args) => {
    const url = args.url;

    // ── Tier 1: Exact match ──────────────────────────────────────────────
    const exactMatches = await ctx.db
      .query("redirects")
      .withIndex("by_source_url", (q) => q.eq("sourceUrl", url))
      .collect();

    const exactMatch = exactMatches.find(
      (r) => r.enabled && r.matchType === "exact",
    );

    if (exactMatch) {
      return exactMatch;
    }

    // ── Tier 2: Prefix match ─────────────────────────────────────────────
    // Get all enabled prefix redirects and find the longest matching prefix
    const enabledRedirects = await ctx.db
      .query("redirects")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    const prefixMatches = enabledRedirects
      .filter(
        (r) => r.matchType === "prefix" && url.startsWith(r.sourceUrl),
      )
      .sort((a, b) => b.sourceUrl.length - a.sourceUrl.length); // Longest prefix wins

    if (prefixMatches.length > 0) {
      const bestPrefix = prefixMatches[0];
      // For prefix redirects, replace the matched prefix in the URL
      const remainder = url.slice(bestPrefix.sourceUrl.length);
      return {
        ...bestPrefix,
        // Compute effective target: targetUrl + remainder of URL after prefix
        _resolvedTargetUrl: bestPrefix.targetUrl + remainder,
      };
    }

    // ── Tier 3: Regex match ──────────────────────────────────────────────
    const regexRedirects = enabledRedirects.filter(
      (r) => r.matchType === "regex",
    );

    for (const redirect of regexRedirects) {
      try {
        const regex = new RegExp(redirect.sourceUrl);
        if (regex.test(url)) {
          // For regex redirects, apply regex replacement if target contains $1, $2, etc.
          const resolvedTarget = url.replace(regex, redirect.targetUrl);
          return {
            ...redirect,
            _resolvedTargetUrl: resolvedTarget,
          };
        }
      } catch {
        // Invalid regex -- skip (should have been validated on creation)
        continue;
      }
    }

    // ── No match ─────────────────────────────────────────────────────────
    return null;
  },
});

// ─── Generate Slug Redirect ─────────────────────────────────────────────────

/**
 * Auto-create a 301 redirect when a post or page slug changes.
 *
 * Triggered by:
 *   - `post.slug_changed` event (via Event Dispatcher)
 *   - `page.slug_changed` event (via Event Dispatcher)
 *
 * Behavior:
 *   1. Compute old and new URLs based on content type
 *   2. Create 301 redirect: old -> new with source "slug_change"
 *   3. Update all existing redirects targeting old URL to point to new URL (chain flatten)
 *   4. Remove 404 entry for the new URL if one exists
 */
export const generateSlugRedirect = internalMutation({
  args: generateSlugRedirectArgs,
  handler: async (ctx, args) => {
    // Compute old and new URLs
    // For pages, it's always /{slug}/
    // For posts, it depends on permalink structure, but we use the slug directly
    // since the calling system provides the full slug context
    const oldUrl = `/${args.oldSlug}/`;
    const newUrl = `/${args.newSlug}/`;

    // Don't create redirect if URLs are the same
    if (oldUrl === newUrl) return;

    const now = Date.now();

    // ── Check if a redirect already exists for the old URL ───────────────
    const existingRedirects = await ctx.db
      .query("redirects")
      .withIndex("by_source_url", (q) => q.eq("sourceUrl", oldUrl))
      .collect();

    const existingActiveRedirect = existingRedirects.find(
      (r) => r.enabled && r.matchType === "exact",
    );

    if (existingActiveRedirect) {
      // Update existing redirect to point to the new URL
      await ctx.db.patch("redirects", existingActiveRedirect._id, {
        targetUrl: newUrl,
        updatedAt: now,
      });
    } else {
      // Create new redirect
      await ctx.db.insert("redirects", {
        sourceUrl: oldUrl,
        targetUrl: newUrl,
        statusCode: 301,
        source: "slug_change",
        matchType: "exact",
        contentType: args.contentType,
        contentId: args.contentId,
        enabled: true,
        hitCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ── Flatten chains ───────────────────────────────────────────────────
    // Update any existing redirects pointing to the old URL to point to new URL
    // Uses the by_target_url index for efficient lookup instead of full table scan
    const chainingRedirects = await ctx.db
      .query("redirects")
      .withIndex("by_target_url", (q) => q.eq("targetUrl", oldUrl))
      .collect();

    for (const redirect of chainingRedirects) {
      if (redirect.enabled) {
        await ctx.db.patch("redirects", redirect._id, {
          targetUrl: newUrl,
          updatedAt: now,
        });
      }
    }

    // ── Clear 404 entry for the new URL ──────────────────────────────────
    const notFoundEntries = await ctx.db
      .query("notFound")
      .withIndex("by_url", (q) => q.eq("url", newUrl))
      .collect();

    for (const entry of notFoundEntries) {
      await ctx.db.delete("notFound", entry._id);
    }
  },
});

// ─── Batch Create Redirects ─────────────────────────────────────────────────

/**
 * Batch insert redirect records.
 *
 * Used by:
 *   - `generatePermalinkRedirects` action (when permalink structure changes)
 *   - Bulk import operations
 *
 * Inserts up to MAX_BATCH_SIZE redirect records in a single mutation.
 * Each record gets statusCode 301, enabled: true, hitCount: 0.
 */
export const batchCreateRedirects = internalMutation({
  args: batchCreateRedirectsArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    // Limit batch size
    const batch = args.redirects.slice(0, MAX_BATCH_SIZE);

    for (const redirect of batch) {
      // Skip if source === target
      if (redirect.sourceUrl === redirect.targetUrl) {
        skipped++;
        continue;
      }

      // Skip if a redirect already exists for this source URL
      const existing = await ctx.db
        .query("redirects")
        .withIndex("by_source_url", (q) =>
          q.eq("sourceUrl", redirect.sourceUrl),
        )
        .collect();

      const activeExisting = existing.find(
        (r) => r.enabled && r.matchType === "exact",
      );

      if (activeExisting) {
        // Update existing redirect to point to new target (chain flatten)
        if (activeExisting.targetUrl !== redirect.targetUrl) {
          await ctx.db.patch("redirects", activeExisting._id, {
            targetUrl: redirect.targetUrl,
            updatedAt: now,
          });
          created++;
        } else {
          skipped++;
        }
        continue;
      }

      await ctx.db.insert("redirects", {
        sourceUrl: redirect.sourceUrl,
        targetUrl: redirect.targetUrl,
        statusCode: 301,
        source: args.source,
        matchType: "exact",
        enabled: true,
        hitCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      created++;
    }

    return { created, skipped };
  },
});

// ─── Record Redirect Hit ────────────────────────────────────────────────────

/**
 * Increment the hit counter on a redirect.
 *
 * Called as fire-and-forget from the website middleware after a redirect match.
 * This is an internalMutation because it's called from server-side middleware,
 * not from client-side code.
 */
export const recordRedirectHit = internalMutation({
  args: recordRedirectHitArgs,
  handler: async (ctx, args) => {
    const redirect = await ctx.db.get("redirects", args.redirectId);
    if (!redirect) return;

    await ctx.db.patch("redirects", args.redirectId, {
      hitCount: redirect.hitCount + 1,
      lastHitAt: Date.now(),
    });
  },
});

// ─── Log 404 ────────────────────────────────────────────────────────────────

/**
 * Log or aggregate a 404 hit.
 *
 * Called as fire-and-forget from the website 404 handler.
 *
 * Behavior:
 *   1. Check notFound table for existing entry with same URL
 *   2. If exists: increment hitCount, update lastHitAt, referrer, userAgent
 *   3. If not exists: insert new record with hitCount: 1, resolved: false
 */
export const log404 = internalMutation({
  args: log404Args,
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing entry
    const existing = await ctx.db
      .query("notFound")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .unique();

    if (existing) {
      // Aggregate: increment hit count and update metadata
      const patch: Record<string, unknown> = {
        hitCount: existing.hitCount + 1,
        lastHitAt: now,
      };

      // Update referrer and userAgent with most recent values
      if (args.referrer) patch.referrer = args.referrer;
      if (args.userAgent) patch.userAgent = args.userAgent;

      await ctx.db.patch("notFound", existing._id, patch);
    } else {
      // New 404 entry
      await ctx.db.insert("notFound", {
        url: args.url,
        referrer: args.referrer,
        userAgent: args.userAgent,
        hitCount: 1,
        lastHitAt: now,
        resolved: false,
      });
    }
  },
});

// ─── Cleanup 404 Log ────────────────────────────────────────────────────────

/**
 * Scheduled cleanup of old/low-hit 404 entries.
 *
 * Rules:
 *   1. Delete resolved entries older than 90 days
 *   2. Delete unresolved entries with hitCount < 3 older than 30 days
 *   3. If total records > 10,000, prune oldest low-hit entries until under limit
 *
 * This function is designed to be called by a Convex cron job.
 */
export const cleanup404Log = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const resolvedCutoff = now - RESOLVED_CLEANUP_DAYS * 24 * 60 * 60 * 1000;
    const unresolvedCutoff =
      now - UNRESOLVED_LOW_HIT_CLEANUP_DAYS * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    // ── Rule 1: Delete resolved entries older than 90 days ───────────────
    const resolvedEntries = await ctx.db
      .query("notFound")
      .withIndex("by_resolved", (q) => q.eq("resolved", true))
      .take(500);

    for (const entry of resolvedEntries) {
      if (entry.resolvedAt && entry.resolvedAt < resolvedCutoff) {
        await ctx.db.delete("notFound", entry._id);
        deletedCount++;
      }
    }

    // ── Rule 2: Delete unresolved low-hit entries older than 30 days ────
    const unresolvedEntries = await ctx.db
      .query("notFound")
      .withIndex("by_resolved", (q) => q.eq("resolved", false))
      .take(500);

    for (const entry of unresolvedEntries) {
      if (
        entry.hitCount < UNRESOLVED_MIN_HITS &&
        entry.lastHitAt < unresolvedCutoff
      ) {
        await ctx.db.delete("notFound", entry._id);
        deletedCount++;
      }
    }

    // ── Rule 3: Enforce max record count ─────────────────────────────────
    const remainingEntries = await ctx.db.query("notFound").take(500);

    if (remainingEntries.length > MAX_NOT_FOUND_RECORDS) {
      // Sort by hit count ascending, then by lastHitAt ascending (least valuable first)
      const sortedByValue = [...remainingEntries].sort((a, b) => {
        if (a.hitCount !== b.hitCount) return a.hitCount - b.hitCount;
        return a.lastHitAt - b.lastHitAt;
      });

      const excess = sortedByValue.length - MAX_NOT_FOUND_RECORDS;
      for (let i = 0; i < excess; i++) {
        await ctx.db.delete("notFound", sortedByValue[i]._id);
        deletedCount++;
      }
    }

    return { deletedCount };
  },
});

// ─── Clear NotFound For URL ─────────────────────────────────────────────────

/**
 * Remove 404 entry for a URL when content is published at that URL.
 *
 * Called when:
 *   - A post is published (the post's URL no longer 404s)
 *   - A page is published
 *   - A redirect is created that covers this URL
 */
export const clearNotFoundForUrl = internalMutation({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("notFound")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete("notFound", entry._id);
    }
  },
});
