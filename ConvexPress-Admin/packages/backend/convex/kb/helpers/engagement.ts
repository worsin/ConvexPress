/**
 * Knowledge Base System - Engagement Recording
 *
 * Shared cores for helpful/not-helpful feedback and page views. Callers decide
 * which articles qualify before calling:
 *   - the public mutations (kb/feedback.ts, kb/analytics.ts) pass only an
 *     article that passed the public gate (requirePublicKbArticle);
 *   - kb/trustedConsumers.ts passes any published article, internal ones
 *     included, for an integrator's own authorized server code.
 * Validation, upserts and denormalized counters live only here, so both
 * entry points behave identically.
 */

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { emitEvent } from "../../helpers/events";
import { KB_EVENTS, SYSTEM } from "../../events/constants";
import { patchWithMediaReferences } from "../../media/attachmentGuard";
import { PAGE_VIEW_DEDUP_WINDOW_MS } from "../validators";

const MAX_SESSION_ID_LENGTH = 128;
const MAX_FEEDBACK_COMMENT = 1000;

export function assertKbSessionId(sessionId: string): void {
  if (!sessionId || sessionId.length > MAX_SESSION_ID_LENGTH) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid session ID" });
  }
}

export type KbHelpfulFeedbackInput = { sessionId: string; isHelpful: boolean; comment?: string; userId?: Id<"users"> };

/**
 * Record helpful/not-helpful feedback, once per session and article. A repeat
 * from the same session updates its feedback and moves the article's helpful
 * counters only when the answer changed.
 */
export async function recordKbHelpfulFeedback(
  ctx: MutationCtx, article: Doc<"kb_articles">, input: KbHelpfulFeedbackInput,
): Promise<Id<"kb_articleFeedback">> {
  assertKbSessionId(input.sessionId);
  if (input.comment && input.comment.length > MAX_FEEDBACK_COMMENT) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment too long" });
  }

  const existing = await ctx.db
    .query("kb_articleFeedback")
    .withIndex("by_session_article", (q) => q.eq("sessionId", input.sessionId).eq("articleId", article._id))
    .first();

  if (existing) {
    await ctx.db.patch("kb_articleFeedback", existing._id, { isHelpful: input.isHelpful, comment: input.comment });
    if (existing.isHelpful !== input.isHelpful) {
      await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", article._id, input.isHelpful
        ? { helpfulVotes: article.helpfulVotes + 1, notHelpfulVotes: Math.max(0, article.notHelpfulVotes - 1) }
        : { helpfulVotes: Math.max(0, article.helpfulVotes - 1), notHelpfulVotes: article.notHelpfulVotes + 1 });
    }
    return existing._id;
  }

  const feedbackId = await ctx.db.insert("kb_articleFeedback", {
    articleId: article._id,
    userId: input.userId,
    sessionId: input.sessionId,
    isHelpful: input.isHelpful,
    comment: input.comment,
    createdAt: Date.now(),
  });
  await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", article._id, input.isHelpful
    ? { helpfulVotes: article.helpfulVotes + 1 }
    : { notHelpfulVotes: article.notHelpfulVotes + 1 });

  await emitEvent(ctx, KB_EVENTS.FEEDBACK_SUBMITTED, SYSTEM.KB, {
    feedbackId,
    articleId: article._id,
    isHelpful: input.isHelpful,
  });
  return feedbackId;
}

export type KbPageViewInput = { sessionId: string; referrer?: string; userAgent?: string; userId?: Id<"users">; durationSeconds?: number };

/**
 * Record a page view. A view within PAGE_VIEW_DEDUP_WINDOW_MS of the same
 * session's latest view of the article is deduplicated to that view; a
 * session's first-ever view of the article also counts as a unique view. A supplied
 * duration is stored on whichever view is returned.
 */
export async function recordKbPageView(
  ctx: MutationCtx, article: Doc<"kb_articles">, input: KbPageViewInput,
): Promise<{ viewId: Id<"kb_pageViews">; deduplicated: boolean }> {
  assertKbSessionId(input.sessionId);
  const now = Date.now();

  // The session's latest view of this article, if it ever viewed it. (The
  // window compares against the latest view, not the first one ever.)
  const priorView = await ctx.db
    .query("kb_pageViews")
    .withIndex("by_session_article", (q) => q.eq("sessionId", input.sessionId).eq("articleId", article._id))
    .order("desc")
    .first();

  if (priorView && now - priorView.createdAt < PAGE_VIEW_DEDUP_WINDOW_MS) {
    if (input.durationSeconds !== undefined) await ctx.db.patch("kb_pageViews", priorView._id, { duration: input.durationSeconds });
    return { viewId: priorView._id, deduplicated: true };
  }

  const viewId = await ctx.db.insert("kb_pageViews", {
    articleId: article._id,
    userId: input.userId,
    sessionId: input.sessionId,
    referrer: input.referrer,
    userAgent: input.userAgent,
    duration: input.durationSeconds,
    createdAt: now,
  });
  await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", article._id, {
    viewCount: article.viewCount + 1,
    uniqueViewCount: priorView ? article.uniqueViewCount : article.uniqueViewCount + 1,
  });
  return { viewId, deduplicated: false };
}
