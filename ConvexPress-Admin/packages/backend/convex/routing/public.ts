/**
 * Routing System - Public Website Functions
 *
 * Website middleware uses these public functions because Convex HTTP clients
 * cannot call internal functions. Only enabled redirect rules are exposed.
 */

import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { redirectMatchTypeValidator, redirectStatusCodeValidator } from "../schema/routing";

/** The public projection of a matched rule. Never the stored document: hit
 * counts, notes and authorship stay private. `_resolvedTargetUrl` is present
 * for prefix and regex matches. */
const resolvedRedirectValidator = v.object({
  _id: v.id("redirects"),
  sourceUrl: v.string(),
  targetUrl: v.string(),
  statusCode: redirectStatusCodeValidator,
  matchType: redirectMatchTypeValidator,
  _resolvedTargetUrl: v.optional(v.string()),
});

function publicRedirect(rule: Doc<"redirects">, resolvedTargetUrl?: string) {
  return {
    _id: rule._id,
    sourceUrl: rule.sourceUrl,
    targetUrl: rule.targetUrl,
    statusCode: rule.statusCode,
    matchType: rule.matchType,
    ...(resolvedTargetUrl === undefined ? {} : { _resolvedTargetUrl: resolvedTargetUrl }),
  };
}

export const resolveRedirect = query({
  args: {
    url: v.string(),
  },
  returns: v.union(v.null(), resolvedRedirectValidator),
  handler: async (ctx, args) => {
    const url = args.url;

    const exactMatches = await ctx.db
      .query("redirects")
      .withIndex("by_source_url", (q) =>
        q.eq("sourceUrl", url),
      )
      .collect();

    const exactMatch = exactMatches.find(
      (r) => r.enabled && r.matchType === "exact",
    );
    if (exactMatch) return publicRedirect(exactMatch);

    const enabledRedirects = await ctx.db
      .query("redirects")
      .withIndex("by_enabled", (q) =>
        q.eq("enabled", true),
      )
      .collect();

    const prefixMatches = enabledRedirects
      .filter((r) => r.matchType === "prefix" && url.startsWith(r.sourceUrl))
      .sort((a, b) => b.sourceUrl.length - a.sourceUrl.length);

    if (prefixMatches.length > 0) {
      const bestPrefix = prefixMatches[0];
      const remainder = url.slice(bestPrefix.sourceUrl.length);
      return publicRedirect(bestPrefix, bestPrefix.targetUrl + remainder);
    }

    const regexRedirects = enabledRedirects.filter(
      (r) => r.matchType === "regex",
    );
    for (const redirect of regexRedirects) {
      try {
        const regex = new RegExp(redirect.sourceUrl);
        if (regex.test(url)) {
          return publicRedirect(redirect, url.replace(regex, redirect.targetUrl));
        }
      } catch {
        continue;
      }
    }

    return null;
  },
});

export const recordRedirectHit = mutation({
  args: {
    redirectId: v.id("redirects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const redirect = await ctx.db.get(args.redirectId);
    if (!redirect) return;

    await ctx.db.patch("redirects", args.redirectId, {
      hitCount: (redirect.hitCount ?? 0) + 1,
      lastHitAt: Date.now(),
    });
  },
});
