/**
 * Knowledge Base System - Trusted Consumers
 *
 * Server-side entry points for integrators that render KB articles, internal
 * ones included, inside their own authenticated applications (for example an
 * in-app help panel). Every function here is an internal mutation: only the
 * integrator's own Convex functions, or a server holding the deployment's
 * admin key, can call them, after that code has authenticated and authorized
 * its own user. None is reachable from a browser or a website visitor.
 *
 *   recordHelpfulFeedback - helpful/not-helpful feedback (kb/feedback:submitHelpful's core)
 *   recordPageView        - page view (kb/analytics:trackPageView's core)
 *   recordSearch          - a search and how many articles it found (kb/analytics:trackSearch)
 *
 * They accept a published article of any visibility. Draft, review, archived
 * and scheduled articles are "not found", as they are publicly. The
 * integrator's users are not ConvexPress users, so no userId is recorded.
 * Validation, deduplication and counters are shared with the public
 * mutations (kb/helpers/engagement.ts), so both update counters identically.
 */

import type { RegisteredMutation } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type QueryCtx } from "../_generated/server";
import { requirePluginEnabled } from "../helpers/plugins";
import { recordKbHelpfulFeedback, recordKbPageView, type KbFeedbackReason } from "./helpers/engagement";
import { kbFeedbackReasonValidator } from "../schema/kb";

/** Longest page-view duration accepted: one hour, as updateDuration allows. */
const MAX_PAGE_VIEW_DURATION_MS = 3_600_000;
/** Longest search accepted, as trackSearch allows. */
const MAX_SEARCH_LENGTH = 500;

async function requirePublishedKbArticle(ctx: QueryCtx, articleId: Id<"kb_articles">): Promise<Doc<"kb_articles">> {
  const article = await ctx.db.get("kb_articles", articleId);
  if (!article || article.status !== "published") throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
  return article;
}

type HelpfulFeedbackArgs = { articleId: Id<"kb_articles">; sessionId: string; isHelpful: boolean; reason?: KbFeedbackReason; comment?: string };
export const recordHelpfulFeedback: RegisteredMutation<"internal", HelpfulFeedbackArgs, { feedbackId: Id<"kb_articleFeedback"> }> = internalMutation({
  args: { articleId: v.id("kb_articles"), sessionId: v.string(), isHelpful: v.boolean(), reason: v.optional(kbFeedbackReasonValidator), comment: v.optional(v.string()) },
  returns: v.object({ feedbackId: v.id("kb_articleFeedback") }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const article = await requirePublishedKbArticle(ctx, args.articleId);
    const feedbackId = await recordKbHelpfulFeedback(ctx, article, { sessionId: args.sessionId, isHelpful: args.isHelpful, reason: args.reason, comment: args.comment });
    return { feedbackId };
  },
});

type PageViewArgs = { articleId: Id<"kb_articles">; sessionId: string; referrer?: string; durationMs?: number };
/**
 * `durationMs` is stored on the page view in whole seconds, the unit
 * kb/analytics:updateDuration uses. On a deduplicated view it updates the
 * earlier view's duration.
 */
export const recordPageView: RegisteredMutation<"internal", PageViewArgs, { viewId: Id<"kb_pageViews">; deduplicated: boolean }> = internalMutation({
  args: { articleId: v.id("kb_articles"), sessionId: v.string(), referrer: v.optional(v.string()), durationMs: v.optional(v.number()) },
  returns: v.object({ viewId: v.id("kb_pageViews"), deduplicated: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    if (args.durationMs !== undefined && (!Number.isFinite(args.durationMs) || args.durationMs < 0 || args.durationMs > MAX_PAGE_VIEW_DURATION_MS)) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: `Duration must be between 0 and ${MAX_PAGE_VIEW_DURATION_MS} milliseconds` });
    }
    const article = await requirePublishedKbArticle(ctx, args.articleId);
    return recordKbPageView(ctx, article, {
      sessionId: args.sessionId,
      referrer: args.referrer,
      durationSeconds: args.durationMs === undefined ? undefined : Math.round(args.durationMs / 1000),
    });
  },
});

type SearchArgs = { query: string; resultCount: number; clickedArticleId?: Id<"kb_articles"> };
/**
 * A search a reader ran in the integrator's help panel, so search analytics
 * and content health (searches that find nothing) include it. The query is
 * stored with its whitespace collapsed.
 */
export const recordSearch: RegisteredMutation<"internal", SearchArgs, { searchId: Id<"kb_searchQueries"> }> = internalMutation({
  args: { query: v.string(), resultCount: v.number(), clickedArticleId: v.optional(v.id("kb_articles")) },
  returns: v.object({ searchId: v.id("kb_searchQueries") }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const query = args.query.trim().replace(/\s+/g, " ");
    if (!query || query.length > MAX_SEARCH_LENGTH) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: `Query must be non-empty and at most ${MAX_SEARCH_LENGTH} characters` });
    }
    if (!Number.isInteger(args.resultCount) || args.resultCount < 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Result count must be a whole number of at least 0" });
    }
    const searchId = await ctx.db.insert("kb_searchQueries", {
      query,
      resultCount: args.resultCount,
      ...(args.clickedArticleId ? { clickedArticleId: args.clickedArticleId } : {}),
      source: "convex",
      createdAt: Date.now(),
    });
    return { searchId };
  },
});
