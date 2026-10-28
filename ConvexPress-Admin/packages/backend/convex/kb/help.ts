/**
 * Knowledge Base System - in-app help reads for trusted integrations
 *
 * The help panel of another application (an app's "?" next to a screen, a
 * field or a status) reads through these internal queries. They can return
 * internal articles, so they are never public: the integrator calls them from
 * its own authorized server code, vouching for its signed-in user's audience
 * labels and whether that user may see internal articles (kb/helpers/help.ts).
 *
 *   spot          a help spot's summary and its articles, in the order editors chose
 *   article       one readable article, rendered, with its outline and related reading
 *   search        readable articles matching words, titles first
 *   suggestions   featured, then most-read readable articles (the panel's empty state)
 *
 * Article bodies come back as HTML from the shared renderer. A link to another
 * article the reader can read points at `#kb-article/<id>[/<anchor>]` and carries
 * `data-kb-article`, so the panel opens it in place; links to anything else the
 * reader can't read are plain text.
 */

import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { kbOutlineEntryValidator } from "../schema/kb";
import { articleDoc, articleOutline, renderArticleBody } from "./helpers/content";
import { articleContextKeys, helpContextKey, helpReader, helpReaderArgs, readableBy, type HelpReader } from "./helpers/help";
import { PUBLIC_VISIBILITY_KEY } from "./helpers/visibility";
import { isPluginEnabled } from "../helpers/plugins";

const helpListItem = v.object({
  _id: v.id("kb_articles"),
  title: v.string(),
  slug: v.string(),
  excerpt: v.string(),
  readingTimeMinutes: v.number(),
  updatedAt: v.number(),
});
type HelpListItem = typeof helpListItem.type;

const helpSpot = v.object({ key: v.string(), label: v.string(), summary: v.optional(v.string()), routeHint: v.optional(v.string()) });

function listItem(article: Doc<"kb_articles">): HelpListItem {
  return { _id: article._id, title: article.title, slug: article.slug, excerpt: article.excerpt, readingTimeMinutes: article.readingTimeMinutes, updatedAt: article.updatedAt };
}

function clamp(limit: number | undefined, fallback: number, max: number): number {
  return limit === undefined || !Number.isFinite(limit) ? fallback : Math.max(1, Math.min(Math.floor(limit), max));
}

async function spotRow(ctx: Pick<QueryCtx, "db">, key: string) {
  return await ctx.db.query("kb_help_contexts").withIndex("by_key", (q) => q.eq("key", key)).first();
}

async function spotArticles(ctx: Pick<QueryCtx, "db">, key: string, reader: HelpReader, limit: number): Promise<Doc<"kb_articles">[]> {
  const pins = await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", key)).take(100);
  const articles: Doc<"kb_articles">[] = [];
  for (const pin of pins) {
    const article = await ctx.db.get("kb_articles", pin.articleId);
    if (readableBy(article, reader)) articles.push(article);
    if (articles.length >= limit) break;
  }
  return articles;
}

export const spot = internalQuery({
  args: { key: v.string(), limit: v.optional(v.number()), ...helpReaderArgs },
  returns: v.object({ spot: v.union(v.null(), helpSpot), articles: v.array(helpListItem) }),
  handler: async (ctx, args) => {
    const key = helpContextKey(args.key);
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return { spot: null, articles: [] };
    const reader = helpReader(args);
    const row = await spotRow(ctx, key);
    const articles = await spotArticles(ctx, key, reader, clamp(args.limit, 10, 50));
    return {
      spot: row ? { key: row.key, label: row.label, ...(row.summary ? { summary: row.summary } : {}), ...(row.routeHint ? { routeHint: row.routeHint } : {}) } : null,
      articles: articles.map(listItem),
    };
  },
});

export const article = internalQuery({
  args: { articleId: v.optional(v.id("kb_articles")), slug: v.optional(v.string()), ...helpReaderArgs },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("kb_articles"),
      title: v.string(),
      slug: v.string(),
      excerpt: v.string(),
      html: v.string(),
      outline: v.array(kbOutlineEntryValidator),
      readingTimeMinutes: v.number(),
      updatedAt: v.number(),
      spots: v.array(v.object({ key: v.string(), label: v.string() })),
      related: v.array(helpListItem),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const reader = helpReader(args);
    let found: Doc<"kb_articles"> | null = null;
    if (args.articleId) found = await ctx.db.get("kb_articles", args.articleId);
    else if (args.slug) {
      const slug = args.slug;
      found = await ctx.db.query("kb_articles").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
      if (!found) {
        const earlier = await ctx.db.query("kb_articleSlugHistory").withIndex("by_slug", (q) => q.eq("slug", slug)).order("desc").first();
        found = earlier ? await ctx.db.get("kb_articles", earlier.articleId) : null;
      }
    }
    if (!readableBy(found, reader)) return null;
    const current = found;

    const html = await renderArticleBody(ctx, articleDoc(current), (target, anchor) =>
      readableBy(target, reader) ? `#kb-article/${target._id}${anchor ? `/${anchor}` : ""}` : null,
    );

    const keys = await articleContextKeys(ctx, current._id);
    const spots: Array<{ key: string; label: string }> = [];
    for (const key of keys) {
      const row = await spotRow(ctx, key);
      if (row) spots.push({ key, label: row.label });
    }

    // Related reading: the editor's own links first, then neighbours in the same spots.
    const related = new Map<Id<"kb_articles">, Doc<"kb_articles">>();
    const links = await ctx.db.query("kb_relatedArticles").withIndex("by_source", (q) => q.eq("sourceArticleId", current._id)).take(20);
    for (const link of links) {
      const target = await ctx.db.get("kb_articles", link.relatedArticleId);
      if (readableBy(target, reader) && target._id !== current._id) related.set(target._id, target);
    }
    for (const key of keys) {
      if (related.size >= 6) break;
      for (const neighbour of await spotArticles(ctx, key, reader, 6)) {
        if (neighbour._id !== current._id && !related.has(neighbour._id)) related.set(neighbour._id, neighbour);
        if (related.size >= 6) break;
      }
    }

    return {
      ...listItem(current),
      html,
      outline: articleOutline(current),
      spots,
      related: [...related.values()].slice(0, 6).map(listItem),
    };
  },
});

export const search = internalQuery({
  args: { query: v.string(), limit: v.optional(v.number()), ...helpReaderArgs },
  returns: v.array(helpListItem),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    const reader = helpReader(args);
    const query = args.query.trim().slice(0, 200);
    const limit = clamp(args.limit, 20, 50);
    if (query.length < 2) return [];
    const found = new Map<Id<"kb_articles">, Doc<"kb_articles">>();
    // Titles first: a reader who types a page's name wants that article.
    const byTitle = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_article_titles", (q) => q.search("title", query).eq("status", "published"))
      .take(100);
    const byBody = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_articles", (q) => {
        const base = q.search("contentPlainText", query).eq("status", "published");
        return reader.includeInternal ? base : base.eq("visibility", PUBLIC_VISIBILITY_KEY);
      })
      .take(200);
    for (const article of [...byTitle, ...byBody]) {
      if (found.size >= limit) break;
      if (!found.has(article._id) && readableBy(article, reader)) found.set(article._id, article);
    }
    return [...found.values()].map(listItem);
  },
});

export const suggestions = internalQuery({
  args: { limit: v.optional(v.number()), ...helpReaderArgs },
  returns: v.array(helpListItem),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    const reader = helpReader(args);
    const limit = clamp(args.limit, 8, 30);
    const found = new Map<Id<"kb_articles">, Doc<"kb_articles">>();
    for (const article of await ctx.db.query("kb_articles").withIndex("by_featured", (q) => q.eq("isFeatured", true)).take(200)) {
      if (found.size >= limit) break;
      if (readableBy(article, reader)) found.set(article._id, article);
    }
    if (found.size < limit) {
      for (const article of await ctx.db.query("kb_articles").withIndex("by_views").order("desc").take(300)) {
        if (found.size >= limit) break;
        if (!found.has(article._id) && readableBy(article, reader)) found.set(article._id, article);
      }
    }
    return [...found.values()].map(listItem);
  },
});
