/**
 * Knowledge Base System - one-time conversion of stored bodies to KbDoc
 *
 * Articles written before KbDoc hold TipTap JSON, HTML or plain text. Reads
 * already convert them on the fly (kb/content readKbDoc); this migration
 * stores the converted document and its derived fields so search, RAG and
 * the outline come from the same document the reader sees.
 *
 *   npx convex run kb/contentMigration:run '{}'
 *
 * It runs in batches and schedules itself until no legacy article or
 * template remains, then reports. Converting a body is not an edit:
 * `updatedAt`, versions and authored excerpts are left alone, and a site
 * setup receipt that matched the article before still matches after.
 */

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { patchWithMediaReferences } from "../media/attachmentGuard";
import { readKbDoc } from "./content";
import { KB_DOC_VERSION } from "./content/model";
import { prepareArticleContent, type PreparedArticleContent } from "./helpers/content";
import { articleDigest } from "./siteSetup";

const BATCH = 25;

function prepareLegacy(ctx: MutationCtx, article: Doc<"kb_articles">): PreparedArticleContent {
  try {
    return prepareArticleContent(ctx, article.content, article._id);
  } catch {
    // A body that can't be kept as written (an image id from another table,
    // too long): keep what the reader sees today.
    const doc = readKbDoc(article.content);
    const withoutForeignImages = {
      ...doc,
      content: doc.content.filter((block) => block.type !== "figure" || block.attrs.mediaId === null || ctx.db.normalizeId("media", block.attrs.mediaId) !== null),
    };
    return prepareArticleContent(ctx, JSON.stringify(withoutForeignImages), article._id);
  }
}

async function migrateArticle(ctx: MutationCtx, article: Doc<"kb_articles">) {
  const before = articleDigest(article);
  const body = prepareLegacy(ctx, article);
  await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", article._id, {
    content: body.content,
    contentVersion: body.contentVersion,
    contentPlainText: body.contentPlainText,
    outline: body.outline,
    linkedArticleIds: body.linkedArticleIds,
    readingTimeMinutes: body.readingTimeMinutes,
    ...(article.excerpt.trim() ? {} : { excerpt: body.excerpt }),
    ...(body.contentPlainText !== article.contentPlainText ? { meilisearchSynced: false, ragSynced: false } : {}),
  });
  const receipts = await ctx.db.query("kb_setupReceipts").withIndex("by_record", (q) => q.eq("recordId", article._id)).take(10);
  const after = await ctx.db.get("kb_articles", article._id);
  for (const receipt of receipts) {
    if (receipt.kind === "article" && receipt.acceptedDigest === before && after) {
      await ctx.db.patch("kb_setupReceipts", receipt._id, { acceptedDigest: articleDigest(after), updatedAt: Date.now() });
    }
  }
}

export const run = internalMutation({
  args: {},
  returns: v.object({ articles: v.number(), templates: v.number(), done: v.boolean() }),
  handler: async (ctx) => {
    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_content_version", (q) => q.eq("contentVersion", undefined))
      .take(BATCH);
    for (const article of articles) await migrateArticle(ctx, article);

    let templates = 0;
    if (articles.length < BATCH) {
      for await (const template of ctx.db.query("kb_templates")) {
        if (templates >= BATCH) break;
        const doc = readKbDoc(template.content);
        const content = JSON.stringify(doc);
        if (content === template.content) continue;
        await patchWithMediaReferences<"kb_templates">(ctx, "kb_templates", template._id, { content });
        templates++;
      }
    }

    const done = articles.length < BATCH && templates < BATCH;
    if (!done) await ctx.scheduler.runAfter(0, internal.kb.contentMigration.run, {});
    return { articles: articles.length, templates, done };
  },
});

/** Articles still stored in a legacy format (for operators; 0 when migrated). */
export const remaining = internalQuery({
  args: {},
  returns: v.object({ legacyArticles: v.number(), version: v.number() }),
  handler: async (ctx) => {
    let legacyArticles = 0;
    for await (const article of ctx.db.query("kb_articles").withIndex("by_content_version", (q) => q.eq("contentVersion", undefined))) {
      void article;
      if (++legacyArticles >= 10_000) break;
    }
    return { legacyArticles, version: KB_DOC_VERSION };
  },
});
