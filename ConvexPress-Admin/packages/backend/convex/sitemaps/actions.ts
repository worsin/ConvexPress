/**
 * Sitemap System - Actions
 *
 * Actions:
 *   generate - Public authenticated wrapper for manual sitemap regeneration (admin only)
 *   _generateInternal - Internal implementation (not client-callable)
 *
 * Auth model:
 *   - generate: Requires `seo.generate_sitemap` capability (Administrator only)
 *
 * The public generate action authenticates the caller and delegates to
 * the internal implementation, which handles the full generation pipeline:
 *   - Content gathering
 *   - XML generation with content hash comparison
 *   - Cache upsert
 *   - Search engine pinging
 *   - Generation logging
 *   - Event emission
 *
 * Usage:
 *   const generate = useAction(api.sitemaps.actions.generate);
 *   await generate({ force: true });
 */

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { generateArgs } from "./validators";
import type { ContentSitemapType } from "./validators";

// ─── _generateInternal (INTERNAL) ───────────────────────────────────────────

/**
 * Internal sitemap generation implementation. Not client-callable.
 *
 * Auth is enforced by the public wrapper — this function trusts its caller.
 *
 * @param force - If true, regenerates all sitemaps regardless of content hash
 * @param types - Optional array of content types to regenerate
 * @param triggeredByUserId - The user identifier of the triggering user
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const _generateInternal = internalAction({
  args: generateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.runAction(internal.sitemaps.internals.regenerateStale, {
      triggeredBy: "manual",
      triggeredByUserId: "system",
      force: args.force ?? false,
      types: args.types as ContentSitemapType[] | undefined,
    });
  },
});

// ─── generate (PUBLIC, AUTHENTICATED) ───────────────────────────────────────

/**
 * Manually trigger sitemap regeneration.
 *
 * Called by the admin "Regenerate Now" button on the Sitemap Settings page.
 * Authenticates the user, verifies the `seo.generate_sitemap` capability,
 * then delegates to the internal regeneration pipeline.
 *
 * @param force - If true, regenerates all sitemaps regardless of content hash (default: false)
 * @param types - Optional array of content types to regenerate (default: all enabled types)
 * @returns Summary of what was generated
 *
 * @throws UNAUTHORIZED if not authenticated
 * @throws FORBIDDEN if user lacks seo.generate_sitemap capability
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const generate = action({
  args: generateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required to generate sitemaps",
      });
    }

    // 2. Verify capability via internal query (actions can't access ctx.db directly)
    const userId = identity.subject;
    await ctx.runQuery(
      internal.sitemaps.helpers.auth.checkCapability,
      {
        userId,
        capability: "seo.generate_sitemap",
      },
    );

    // 3. Delegate to internal regeneration pipeline
    const startTime = Date.now();

    await ctx.runAction(internal.sitemaps.internals.regenerateStale, {
      triggeredBy: "manual",
      triggeredByUserId: userId,
      force: args.force ?? false,
      types: args.types as ContentSitemapType[] | undefined,
    });

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      durationMs,
      triggeredBy: "manual" as const,
    };
  },
});
