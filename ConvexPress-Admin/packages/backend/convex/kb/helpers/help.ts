/**
 * Knowledge Base System - in-app help: keys, readers and pins
 *
 * A help spot key names a place in an application (`doctor.cases.list`,
 * `doctor.case.status`). Keys are lowercase letters, digits and `. _ : -`,
 * start with a letter or digit, and are at most 100 characters.
 *
 * A reader is what an integrator vouches for when it calls the trusted help
 * reads: the audience labels its signed-in user holds, and whether it may see
 * internal articles at all. An article is readable when it is published, is
 * public or the reader may see internal articles, and either has no
 * audiences or shares one with the reader.
 */

import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { isInternalKbArticle, storedKbAudiences } from "./visibility";

export const HELP_CONTEXT_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
export const MAX_HELP_CONTEXTS_PER_ARTICLE = 50;
export const MAX_ARTICLES_PER_HELP_CONTEXT = 50;
export const MAX_HELP_SUMMARY_LENGTH = 500;

export function helpContextKey(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!HELP_CONTEXT_KEY_PATTERN.test(key)) {
    throw new ConvexError({ code: "INVALID_HELP_CONTEXT", message: `"${raw}" isn't a help spot key: use lowercase letters, digits and . _ : - (at most 100).` });
  }
  return key;
}

export function helpContextKeys(raw: readonly string[]): string[] {
  const keys = [...new Set(raw.map(helpContextKey))];
  if (keys.length > MAX_HELP_CONTEXTS_PER_ARTICLE) {
    throw new ConvexError({ code: "INVALID_HELP_CONTEXT", message: `An article can show in at most ${MAX_HELP_CONTEXTS_PER_ARTICLE} help spots.` });
  }
  return keys;
}

export const helpReaderArgs = {
  /** Audience labels the integrator's signed-in user holds (e.g. "doctor"). */
  audiences: v.array(v.string()),
  /** Whether this reader may see internal articles. Public-only readers pass false. */
  includeInternal: v.boolean(),
};
export type HelpReader = { audiences: string[]; includeInternal: boolean };

export function helpReader(args: HelpReader): HelpReader {
  return { audiences: storedKbAudiences(args.audiences) ?? [], includeInternal: args.includeInternal };
}

export function readableBy(article: Doc<"kb_articles"> | null, reader: HelpReader): article is Doc<"kb_articles"> {
  if (!article || article.status !== "published") return false;
  if (isInternalKbArticle(article) && !reader.includeInternal) return false;
  const audiences = article.audiences ?? [];
  return audiences.length === 0 || audiences.some((audience) => reader.audiences.includes(audience));
}

export async function articleContextKeys(ctx: Pick<QueryCtx, "db">, articleId: Id<"kb_articles">): Promise<string[]> {
  const pins = await ctx.db.query("kb_article_contexts").withIndex("by_article", (q) => q.eq("articleId", articleId)).take(MAX_HELP_CONTEXTS_PER_ARTICLE + 10);
  return pins.map((pin) => pin.contextKey);
}

async function nextRank(ctx: Pick<QueryCtx, "db">, contextKey: string): Promise<number> {
  const last = await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", contextKey)).order("desc").first();
  return last ? last.rank + 1 : 0;
}

/** Make an article show in exactly these spots; a new spot lists it last. */
export async function setArticleContexts(ctx: MutationCtx, articleId: Id<"kb_articles">, keys: readonly string[]): Promise<void> {
  const wanted = new Set(helpContextKeys(keys));
  const pins = await ctx.db.query("kb_article_contexts").withIndex("by_article", (q) => q.eq("articleId", articleId)).take(MAX_HELP_CONTEXTS_PER_ARTICLE + 10);
  for (const pin of pins) {
    if (wanted.has(pin.contextKey)) wanted.delete(pin.contextKey);
    else await ctx.db.delete("kb_article_contexts", pin._id);
  }
  for (const contextKey of wanted) {
    const count = (await ctx.db.query("kb_article_contexts").withIndex("by_context_rank", (q) => q.eq("contextKey", contextKey)).take(MAX_ARTICLES_PER_HELP_CONTEXT + 1)).length;
    if (count >= MAX_ARTICLES_PER_HELP_CONTEXT) {
      throw new ConvexError({ code: "INVALID_HELP_CONTEXT", message: `The help spot "${contextKey}" already shows ${MAX_ARTICLES_PER_HELP_CONTEXT} articles.` });
    }
    await ctx.db.insert("kb_article_contexts", { articleId, contextKey, rank: await nextRank(ctx, contextKey), createdAt: Date.now() });
  }
}

export async function removeArticleContexts(ctx: MutationCtx, articleId: Id<"kb_articles">): Promise<void> {
  const pins = await ctx.db.query("kb_article_contexts").withIndex("by_article", (q) => q.eq("articleId", articleId)).take(MAX_HELP_CONTEXTS_PER_ARTICLE + 10);
  for (const pin of pins) await ctx.db.delete("kb_article_contexts", pin._id);
}
