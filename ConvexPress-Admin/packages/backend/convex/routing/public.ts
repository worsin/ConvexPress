/**
 * Routing System - Public Website Functions
 *
 * Website middleware uses these public functions because Convex HTTP clients
 * cannot call internal functions. Only enabled redirect rules are exposed.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

type RedirectResult = {
  _id: string;
  sourceUrl: string;
  targetUrl: string;
  statusCode: number;
  matchType: "exact" | "prefix" | "regex";
  _resolvedTargetUrl?: string;
} | null;

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const resolveRedirect = query({
  args: {
    url: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<RedirectResult> => {
    const url = args.url;

    const exactMatches = await ctx.db
      .query("redirects")
      .withIndex("by_source_url", (q: ConvexQueryBuilder) =>
        q.eq("sourceUrl", url),
      )
      .collect();

    const exactMatch = exactMatches.find(
      (r: any) => r.enabled && r.matchType === "exact",
    );
    if (exactMatch) return exactMatch;

    const enabledRedirects = await ctx.db
      .query("redirects")
      .withIndex("by_enabled", (q: ConvexQueryBuilder) =>
        q.eq("enabled", true),
      )
      .collect();

    const prefixMatches = enabledRedirects
      .filter((r: any) => r.matchType === "prefix" && url.startsWith(r.sourceUrl))
      .sort((a: any, b: any) => b.sourceUrl.length - a.sourceUrl.length);

    if (prefixMatches.length > 0) {
      const bestPrefix = prefixMatches[0];
      const remainder = url.slice(bestPrefix.sourceUrl.length);
      return {
        ...bestPrefix,
        _resolvedTargetUrl: bestPrefix.targetUrl + remainder,
      };
    }

    const regexRedirects = enabledRedirects.filter(
      (r: any) => r.matchType === "regex",
    );
    for (const redirect of regexRedirects) {
      try {
        const regex = new RegExp(redirect.sourceUrl);
        if (regex.test(url)) {
          return {
            ...redirect,
            _resolvedTargetUrl: url.replace(regex, redirect.targetUrl),
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordRedirectHit = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    redirectId: v.id("redirects"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const redirect = await ctx.db.get(args.redirectId);
    if (!redirect) return;

    await ctx.db.patch(args.redirectId, {
      hitCount: (redirect.hitCount ?? 0) + 1,
      lastHitAt: Date.now(),
    });
  },
});
