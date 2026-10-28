/**
 * Knowledge Base System - content health
 *
 * One report of what needs an editor's attention:
 *   due for review     published articles past their review date (owner, interval, last review)
 *   not helping        published articles readers mostly say didn't help, with their reasons
 *   searches that fail what readers searched for in the last 30 days and found nothing
 *   help spots empty   in-app help spots with no published article
 *   broken links       published articles linking to articles that are gone or unpublished
 *   images without alt published articles with figures that have no description
 *
 * Reads are bounded (the most recent 2,000 published articles, 2,000 feedback
 * rows, 5,000 searches); `truncated` says when a list may be incomplete.
 */

import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled } from "../helpers/plugins";
import { enrichUser } from "./helpers/enrichUser";
import { articleDoc } from "./helpers/content";

export const DEFAULT_REVIEW_INTERVAL_DAYS = 180;
const DAY = 24 * 60 * 60 * 1000;
const ARTICLE_SCAN = 2_000;
const FEEDBACK_SCAN = 2_000;
const SEARCH_SCAN = 5_000;
const MIN_VOTES = 5;

const articleRef = { _id: v.id("kb_articles"), title: v.string() };
const person = v.union(v.null(), v.object({ _id: v.id("users"), displayName: v.string(), avatarUrl: v.optional(v.string()) }));
const reasonCounts = v.object({ outdated: v.number(), incorrect: v.number(), unclear: v.number(), incomplete: v.number(), other: v.number() });

/** When an article is next due for review. */
export function reviewDueAt(article: Pick<Doc<"kb_articles">, "lastReviewedAt" | "publishedAt" | "createdAt" | "reviewIntervalDays">): number {
  const from = article.lastReviewedAt ?? article.publishedAt ?? article.createdAt;
  return from + (article.reviewIntervalDays ?? DEFAULT_REVIEW_INTERVAL_DAYS) * DAY;
}

function missingAltFigures(article: Doc<"kb_articles">): number {
  let count = 0;
  const visit = (blocks: ReturnType<typeof articleDoc>["content"]) => {
    for (const block of blocks) {
      if (block.type === "figure" && !block.attrs.alt) count++;
      else if (block.type === "bulletList" || block.type === "orderedList") for (const item of block.content) visit(item.content);
      else if (block.type === "blockquote" || block.type === "callout" || block.type === "details") visit(block.content);
      else if (block.type === "table") for (const row of block.content) for (const cell of row.content) visit(cell.content);
    }
  };
  visit(articleDoc(article).content);
  return count;
}

export const report = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      generatedAt: v.number(),
      truncated: v.boolean(),
      publishedCount: v.number(),
      dueForReview: v.array(v.object({ ...articleRef, owner: person, dueAt: v.number(), lastReviewedAt: v.optional(v.number()) })),
      notHelping: v.array(v.object({ ...articleRef, helpfulVotes: v.number(), notHelpfulVotes: v.number(), reasons: reasonCounts, comments: v.array(v.string()) })),
      failedSearches: v.array(v.object({ query: v.string(), count: v.number(), lastSearchedAt: v.number() })),
      emptyHelpSpots: v.array(v.object({ key: v.string(), label: v.string(), surface: v.optional(v.string()) })),
      brokenLinks: v.array(v.object({ ...articleRef, targets: v.array(v.object({ _id: v.id("kb_articles"), title: v.optional(v.string()), problem: v.union(v.literal("missing"), v.literal("unpublished")) })) })),
      imagesWithoutAlt: v.array(v.object({ ...articleRef, figures: v.number() })),
    }),
  ),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    await requireCan(ctx, "kb.viewAnalytics");
    const now = Date.now();
    const published = await ctx.db.query("kb_articles").withIndex("by_status_updated", (q) => q.eq("status", "published")).order("desc").take(ARTICLE_SCAN + 1);
    let truncated = published.length > ARTICLE_SCAN;
    const articles = published.slice(0, ARTICLE_SCAN);
    const byId = new Map<Id<"kb_articles">, Doc<"kb_articles">>(articles.map((article) => [article._id, article]));

    // Due for review, earliest first.
    const due = articles
      .map((article) => ({ article, dueAt: reviewDueAt(article) }))
      .filter((row) => row.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt)
      .slice(0, 50);
    const dueForReview = [];
    for (const { article, dueAt } of due) {
      const owner = await ctx.db.get("users", article.ownerId ?? article.authorId);
      dueForReview.push({ _id: article._id, title: article.title, owner: enrichUser(owner), dueAt, ...(article.lastReviewedAt !== undefined ? { lastReviewedAt: article.lastReviewedAt } : {}) });
    }

    // Not helping: enough votes, mostly "no".
    const feedback = await ctx.db.query("kb_articleFeedback").withIndex("by_date").order("desc").take(FEEDBACK_SCAN + 1);
    truncated ||= feedback.length > FEEDBACK_SCAN;
    const reasons = new Map<Id<"kb_articles">, { counts: { outdated: number; incorrect: number; unclear: number; incomplete: number; other: number }; comments: string[] }>();
    for (const row of feedback.slice(0, FEEDBACK_SCAN)) {
      if (row.isHelpful) continue;
      const entry = reasons.get(row.articleId) ?? { counts: { outdated: 0, incorrect: 0, unclear: 0, incomplete: 0, other: 0 }, comments: [] };
      if (row.reason) entry.counts[row.reason]++;
      if (row.comment && entry.comments.length < 5) entry.comments.push(row.comment);
      reasons.set(row.articleId, entry);
    }
    const notHelping = articles
      .filter((article) => article.helpfulVotes + article.notHelpfulVotes >= MIN_VOTES && article.notHelpfulVotes > article.helpfulVotes)
      .sort((a, b) => b.notHelpfulVotes / (b.helpfulVotes + b.notHelpfulVotes) - a.notHelpfulVotes / (a.helpfulVotes + a.notHelpfulVotes))
      .slice(0, 30)
      .map((article) => ({
        _id: article._id,
        title: article.title,
        helpfulVotes: article.helpfulVotes,
        notHelpfulVotes: article.notHelpfulVotes,
        reasons: reasons.get(article._id)?.counts ?? { outdated: 0, incorrect: 0, unclear: 0, incomplete: 0, other: 0 },
        comments: reasons.get(article._id)?.comments ?? [],
      }));

    // Searches with no results in the last 30 days, grouped by normalized text.
    const searches = await ctx.db.query("kb_searchQueries").withIndex("by_date", (q) => q.gte("createdAt", now - 30 * DAY)).order("desc").take(SEARCH_SCAN + 1);
    truncated ||= searches.length > SEARCH_SCAN;
    const failed = new Map<string, { query: string; count: number; lastSearchedAt: number }>();
    for (const search of searches.slice(0, SEARCH_SCAN)) {
      if (search.resultCount > 0) continue;
      const key = search.query.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key) continue;
      const entry = failed.get(key) ?? { query: search.query.trim(), count: 0, lastSearchedAt: search.createdAt };
      entry.count++;
      entry.lastSearchedAt = Math.max(entry.lastSearchedAt, search.createdAt);
      failed.set(key, entry);
    }
    const failedSearches = [...failed.values()].sort((a, b) => b.count - a.count || b.lastSearchedAt - a.lastSearchedAt).slice(0, 30);

    // Help spots with no published article.
    const spots = await ctx.db.query("kb_help_contexts").take(2_000);
    const emptyHelpSpots = [];
    for (const spot of spots) {
      const pins = await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", spot.key)).take(50);
      let covered = false;
      for (const pin of pins) {
        const article = byId.get(pin.articleId) ?? (await ctx.db.get("kb_articles", pin.articleId));
        if (article?.status === "published") {
          covered = true;
          break;
        }
      }
      if (!covered) emptyHelpSpots.push({ key: spot.key, label: spot.label, ...(spot.surface ? { surface: spot.surface } : {}) });
    }

    // Links from published articles to articles that are gone or unpublished.
    const brokenLinks = [];
    for (const article of articles) {
      const targets = [];
      for (const targetId of article.linkedArticleIds ?? []) {
        const target = byId.get(targetId) ?? (await ctx.db.get("kb_articles", targetId));
        if (!target) targets.push({ _id: targetId, problem: "missing" as const });
        else if (target.status !== "published") targets.push({ _id: targetId, title: target.title, problem: "unpublished" as const });
      }
      if (targets.length) brokenLinks.push({ _id: article._id, title: article.title, targets });
      if (brokenLinks.length >= 50) break;
    }

    const imagesWithoutAlt = [];
    for (const article of articles) {
      const figures = missingAltFigures(article);
      if (figures) imagesWithoutAlt.push({ _id: article._id, title: article.title, figures });
      if (imagesWithoutAlt.length >= 50) break;
    }

    return { generatedAt: now, truncated, publishedCount: articles.length, dueForReview, notHelping, failedSearches, emptyHelpSpots, brokenLinks, imagesWithoutAlt };
  },
});
