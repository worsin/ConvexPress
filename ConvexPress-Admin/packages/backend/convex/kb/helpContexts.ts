/**
 * Knowledge Base System - in-app help spots (admin and manifests)
 *
 *   list         every spot with its coverage, plus keys articles use that no app registered
 *   get          one spot and its articles in order
 *   save         create or edit a spot's label, summary, surface and route hint
 *                (a registered spot's summary only)
 *   remove       delete a spot and its pins
 *   setArticles  the articles a spot shows, in order
 *   forArticle   the spots an article shows in
 *   syncManifest an application registers its spots (internal; apps call it from setup/deploy)
 *
 * Reading needs kb.view; changing spots needs kb.manageHelp. Which spots an
 * article shows in is part of the article, so the article mutations set it
 * with article edit rights (kb/mutations.ts `helpContexts`).
 */

import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { kbArticleVisibilityValidator } from "./helpers/visibility";
import { helpContextKey, MAX_ARTICLES_PER_HELP_CONTEXT, MAX_HELP_SUMMARY_LENGTH } from "./helpers/help";

const MAX_SPOTS = 2_000;
const MAX_LABEL = 120;
const MAX_SURFACE = 60;
const MAX_ROUTE = 200;

function text(value: string | undefined, max: number, field: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length > max) throw new ConvexError({ code: "VALIDATION_ERROR", message: `${field} is at most ${max} characters.` });
  return trimmed || undefined;
}

const spotSummary = v.object({
  key: v.string(),
  label: v.string(),
  summary: v.optional(v.string()),
  surface: v.optional(v.string()),
  routeHint: v.optional(v.string()),
  source: v.union(v.literal("editor"), v.literal("manifest")),
  registered: v.boolean(),
  articleCount: v.number(),
  publishedCount: v.number(),
});

export const list = query({
  args: {},
  returns: v.array(spotSummary),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    await requireCan(ctx, "kb.view");
    const spots = await ctx.db.query("kb_help_contexts").withIndex("by_surface_key").take(MAX_SPOTS);
    const counts = new Map<string, { articleCount: number; publishedCount: number }>();
    const pins = await ctx.db.query("kb_article_contexts").take(10_000);
    const articles = new Map<Id<"kb_articles">, Doc<"kb_articles"> | null>();
    for (const pin of pins) {
      if (!articles.has(pin.articleId)) articles.set(pin.articleId, await ctx.db.get("kb_articles", pin.articleId));
      const article = articles.get(pin.articleId);
      if (!article) continue;
      const count = counts.get(pin.contextKey) ?? { articleCount: 0, publishedCount: 0 };
      count.articleCount++;
      if (article.status === "published") count.publishedCount++;
      counts.set(pin.contextKey, count);
    }
    const registered = new Set(spots.map((spot) => spot.key));
    const rows = spots.map((spot) => ({
      key: spot.key,
      label: spot.label,
      ...(spot.summary ? { summary: spot.summary } : {}),
      ...(spot.surface ? { surface: spot.surface } : {}),
      ...(spot.routeHint ? { routeHint: spot.routeHint } : {}),
      source: spot.source,
      registered: true,
      ...(counts.get(spot.key) ?? { articleCount: 0, publishedCount: 0 }),
    }));
    // Keys editors typed on articles that no application registered.
    for (const [key, count] of counts) {
      if (!registered.has(key)) rows.push({ key, label: key, source: "editor", registered: false, ...count });
    }
    return rows;
  },
});

export const get = query({
  args: { key: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      spot: v.union(v.null(), spotSummary),
      articles: v.array(v.object({
        _id: v.id("kb_articles"),
        title: v.string(),
        status: v.union(v.literal("draft"), v.literal("review"), v.literal("published"), v.literal("archived")),
        visibility: kbArticleVisibilityValidator,
        audiences: v.array(v.string()),
        rank: v.number(),
      })),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    await requireCan(ctx, "kb.view");
    const key = helpContextKey(args.key);
    const row = await ctx.db.query("kb_help_contexts").withIndex("by_key", (q) => q.eq("key", key)).first();
    const pins = await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", key)).take(MAX_ARTICLES_PER_HELP_CONTEXT + 10);
    const articles = [];
    for (const pin of pins) {
      const article = await ctx.db.get("kb_articles", pin.articleId);
      if (!article) continue;
      articles.push({ _id: article._id, title: article.title, status: article.status, visibility: article.visibility === "internal" ? ("internal" as const) : ("public" as const), audiences: article.audiences ?? [], rank: pin.rank });
    }
    const published = articles.filter((article) => article.status === "published").length;
    return {
      spot: row
        ? {
            key: row.key,
            label: row.label,
            ...(row.summary ? { summary: row.summary } : {}),
            ...(row.surface ? { surface: row.surface } : {}),
            ...(row.routeHint ? { routeHint: row.routeHint } : {}),
            source: row.source,
            registered: true,
            articleCount: articles.length,
            publishedCount: published,
          }
        : null,
      articles,
    };
  },
});

export const save = mutation({
  /** Omitted optional fields keep their current value; an empty string clears one. */
  args: { key: v.string(), label: v.string(), summary: v.optional(v.string()), surface: v.optional(v.string()), routeHint: v.optional(v.string()) },
  returns: v.id("kb_help_contexts"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    await requireCan(ctx, "kb.manageHelp");
    const key = helpContextKey(args.key);
    const label = text(args.label, MAX_LABEL, "A label");
    if (!label) throw new ConvexError({ code: "VALIDATION_ERROR", message: "A help spot needs a label." });
    const now = Date.now();
    const existing = await ctx.db.query("kb_help_contexts").withIndex("by_key", (q) => q.eq("key", key)).first();
    // An application owns the label, surface and route of a spot it registered
    // (its next sync would overwrite an edit); editors own the summary. On any
    // other spot, an omitted field keeps its value and an empty string clears it.
    const registered = existing?.source === "manifest" ? existing : null;
    const fields = {
      label: registered ? registered.label : label,
      summary: args.summary === undefined ? existing?.summary : text(args.summary, MAX_HELP_SUMMARY_LENGTH, "A summary"),
      surface: registered ? registered.surface : args.surface === undefined ? existing?.surface : text(args.surface, MAX_SURFACE, "A surface"),
      routeHint: registered ? registered.routeHint : args.routeHint === undefined ? existing?.routeHint : text(args.routeHint, MAX_ROUTE, "A route"),
    };
    if (existing) {
      await ctx.db.patch("kb_help_contexts", existing._id, {
        ...fields,
        ...(fields.summary !== existing.summary ? { summaryEditedAt: now } : {}),
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("kb_help_contexts", { key, ...fields, source: "editor", ...(fields.summary ? { summaryEditedAt: now } : {}), createdAt: now, updatedAt: now });
  },
});

export const remove = mutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    await requireCan(ctx, "kb.manageHelp");
    const key = helpContextKey(args.key);
    const row = await ctx.db.query("kb_help_contexts").withIndex("by_key", (q) => q.eq("key", key)).first();
    if (row) await ctx.db.delete("kb_help_contexts", row._id);
    const pins = await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", key)).take(MAX_ARTICLES_PER_HELP_CONTEXT + 50);
    for (const pin of pins) await ctx.db.delete("kb_article_contexts", pin._id);
    return null;
  },
});

export const setArticles = mutation({
  args: { key: v.string(), articleIds: v.array(v.id("kb_articles")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    await requireCan(ctx, "kb.manageHelp");
    const key = helpContextKey(args.key);
    const ordered = [...new Set(args.articleIds)];
    if (ordered.length > MAX_ARTICLES_PER_HELP_CONTEXT) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: `A help spot shows at most ${MAX_ARTICLES_PER_HELP_CONTEXT} articles.` });
    }
    for (const articleId of ordered) {
      if (!(await ctx.db.get("kb_articles", articleId))) throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }
    const pins = await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", key)).take(MAX_ARTICLES_PER_HELP_CONTEXT + 50);
    const byArticle = new Map(pins.map((pin) => [pin.articleId, pin]));
    for (const pin of pins) if (!ordered.includes(pin.articleId)) await ctx.db.delete("kb_article_contexts", pin._id);
    const now = Date.now();
    for (const [rank, articleId] of ordered.entries()) {
      const pin = byArticle.get(articleId);
      if (pin) {
        if (pin.rank !== rank) await ctx.db.patch("kb_article_contexts", pin._id, { rank });
      } else await ctx.db.insert("kb_article_contexts", { articleId, contextKey: key, rank, createdAt: now });
    }
    return null;
  },
});

export const forArticle = query({
  args: { articleId: v.id("kb_articles") },
  returns: v.array(v.object({ key: v.string(), label: v.string(), registered: v.boolean() })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    await requireCan(ctx, "kb.view");
    const pins = await ctx.db.query("kb_article_contexts").withIndex("by_article", (q) => q.eq("articleId", args.articleId)).take(100);
    const rows = [];
    for (const pin of pins) {
      const row = await ctx.db.query("kb_help_contexts").withIndex("by_key", (q) => q.eq("key", pin.contextKey)).first();
      rows.push({ key: pin.contextKey, label: row?.label ?? pin.contextKey, registered: row !== null });
    }
    return rows;
  },
});

const manifestSpot = v.object({ key: v.string(), label: v.string(), summary: v.optional(v.string()), routeHint: v.optional(v.string()) });

/**
 * An application registers the help spots its code uses. Labels and routes
 * follow the manifest; a summary an editor wrote is kept. With `prune`, spots
 * this surface registered before that the manifest no longer lists are
 * removed (with their pins).
 */
export const syncManifest = internalMutation({
  args: { surface: v.string(), spots: v.array(manifestSpot), prune: v.optional(v.boolean()) },
  returns: v.object({ created: v.number(), updated: v.number(), unchanged: v.number(), pruned: v.number() }),
  handler: async (ctx, args) => {
    const surface = text(args.surface, MAX_SURFACE, "A surface");
    if (!surface) throw new ConvexError({ code: "VALIDATION_ERROR", message: "A manifest names its surface." });
    if (args.spots.length > MAX_SPOTS) throw new ConvexError({ code: "VALIDATION_ERROR", message: `A manifest lists at most ${MAX_SPOTS} spots.` });
    const now = Date.now();
    const seen = new Set<string>();
    let created = 0, updated = 0, unchanged = 0, pruned = 0;
    for (const entry of args.spots) {
      const key = helpContextKey(entry.key);
      if (seen.has(key)) throw new ConvexError({ code: "VALIDATION_ERROR", message: `The manifest lists "${key}" twice.` });
      seen.add(key);
      const label = text(entry.label, MAX_LABEL, "A label") ?? key;
      const summary = text(entry.summary, MAX_HELP_SUMMARY_LENGTH, "A summary");
      const routeHint = text(entry.routeHint, MAX_ROUTE, "A route");
      const existing = await ctx.db.query("kb_help_contexts").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (!existing) {
        await ctx.db.insert("kb_help_contexts", { key, label, ...(summary ? { summary } : {}), surface, ...(routeHint ? { routeHint } : {}), source: "manifest", manifestSeenAt: now, createdAt: now, updatedAt: now });
        created++;
        continue;
      }
      const next = {
        label,
        surface,
        routeHint,
        // An editor's summary wins over the manifest's.
        summary: existing.summaryEditedAt !== undefined ? existing.summary : summary,
      };
      const changed = next.label !== existing.label || next.surface !== existing.surface || next.routeHint !== existing.routeHint || next.summary !== existing.summary;
      await ctx.db.patch("kb_help_contexts", existing._id, { ...next, manifestSeenAt: now, ...(changed ? { updatedAt: now } : {}) });
      if (changed) updated++;
      else unchanged++;
    }
    if (args.prune) {
      const ours = await ctx.db.query("kb_help_contexts").withIndex("by_surface_key", (q) => q.eq("surface", surface)).take(MAX_SPOTS);
      for (const row of ours) {
        if (row.source !== "manifest" || seen.has(row.key)) continue;
        const pins = await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", row.key)).take(MAX_ARTICLES_PER_HELP_CONTEXT + 50);
        for (const pin of pins) await ctx.db.delete("kb_article_contexts", pin._id);
        await ctx.db.delete("kb_help_contexts", row._id);
        pruned++;
      }
    }
    return { created, updated, unchanged, pruned };
  },
});
