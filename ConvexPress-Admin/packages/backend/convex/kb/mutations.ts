import { makeFunctionReference } from "convex/server";
import { requireAssignableCategory } from "./helpers/categoryHierarchy";
/**
 * Knowledge Base System - Article Mutations
 *
 * All write operations for the KB article lifecycle:
 *   create           - Create a new article (draft)
 *   update           - Update an existing article
 *   publish          - Publish an article (immediate or scheduled)
 *   unpublish        - Revert a published article to draft
 *   archive          - Archive an article
 *   remove           - Permanently delete an article and related data
 *   toggleFeatured   - Toggle the featured flag
 *   createVersion    - Create a version snapshot
 *
 * Authorization:
 *   - create: kb.create
 *   - update: kb.edit (any) or kb.editOwn (own only)
 *   - publish/unpublish: kb.publish
 *   - archive/remove: kb.delete
 *   - toggleFeatured: kb.publish
 *   - createVersion: kb.edit or kb.editOwn
 */

import { assertMediaAttachments, deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import { articleDoc, prepareArticleContent } from "./helpers/content";
import { recordPublishedSlug, requireArticleEditor, resolveArticleSlug, snapshotArticle } from "./helpers/editing";
import { kbExcerpt } from "./content/derive";
import { helpContextKeys, removeArticleContexts, setArticleContexts } from "./helpers/help";
import { articleSearchText } from "./helpers/searchText";
import {
  createArticleArgs,
  updateArticleArgs,
  publishArticleArgs,
  unpublishArticleArgs,
  archiveArticleArgs,
  removeArticleArgs,
  toggleFeaturedArgs,
  createVersionArgs,
  markReviewedArgs,
  MAX_KB_TITLE_LENGTH,
  MAX_KB_EXCERPT_LENGTH,
  MAX_KEYWORDS,
} from "./validators";
import { requirePluginEnabled } from "../helpers/plugins";
import { isInternalKbArticle, kbArticleVisibility, storedKbAudiences, storedKbVisibility } from "./helpers/visibility";
import { applyKbPublicCounts } from "./helpers/publicCounts";
import { withdrawInternalKbArticle } from "./visibilityTransitions";

import { v } from "convex/values";
// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createArticleArgs,
  returns: v.id("kb_articles"),
  handler: async (ctx, args): Promise<import("../_generated/dataModel").Id<"kb_articles">> => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.create");

    const title = (args.title ?? "").trim();
    if (!title || title.length === 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Title is required" });
    }
    if (title.length > MAX_KB_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${MAX_KB_TITLE_LENGTH} characters or fewer`,
      });
    }

    if (args.excerpt && args.excerpt.length > MAX_KB_EXCERPT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Excerpt must be ${MAX_KB_EXCERPT_LENGTH} characters or fewer`,
      });
    }

    if (args.keywords && args.keywords.length > MAX_KEYWORDS) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Maximum ${MAX_KEYWORDS} keywords allowed`,
      });
    }

    const audiences = args.audiences === undefined ? undefined : storedKbAudiences(args.audiences);
    const helpContexts = args.helpContexts === undefined ? undefined : helpContextKeys(args.helpContexts);

    const slug = (await resolveArticleSlug(ctx, { title, ...(args.slug !== undefined ? { slug: args.slug } : {}) }))!;
    let source = args.content;

    // A template supplies the body when the caller didn't write one.
    if (args.templateId) {
      const template = await ctx.db.get("kb_templates", args.templateId);
      if (template) {
        await patchWithMediaReferences<"kb_templates">(ctx, "kb_templates", args.templateId, {
          usageCount: template.usageCount + 1,
          updatedAt: Date.now(),
        });
        if (!args.content && template.content) source = template.content;
      }
    }

    // The body is normalized and everything else is derived from it here;
    // writers never supply plain text, outline or reading time.
    const body = prepareArticleContent(ctx, source);
    const excerpt = args.excerpt ?? body.excerpt;

    if (args.categoryId) await requireAssignableCategory(ctx, args.categoryId);
    const now = Date.now();
    const articleId: import("../_generated/dataModel").Id<"kb_articles"> = await insertWithMediaReferences<"kb_articles">(ctx, "kb_articles", {
      title: title || "Untitled Article",
      slug,
      excerpt,
      content: body.content,
      contentVersion: body.contentVersion,
      contentPlainText: body.contentPlainText,
      outline: body.outline,
      linkedArticleIds: body.linkedArticleIds,
      searchText: articleSearchText(title || "Untitled Article", args.keywords ?? [], body.contentPlainText),
      status: "draft",
      authorId: user._id,
      contributors: [],
      categoryId: args.categoryId,
      parentArticleId: args.parentArticleId,
      metaTitle: args.metaTitle,
      metaDescription: args.metaDescription,
      keywords: args.keywords ?? [],
      featuredImageId: args.featuredImageId,
      scheduledAt: undefined,
      publishedAt: undefined,
      viewCount: 0,
      uniqueViewCount: 0,
      helpfulVotes: 0,
      notHelpfulVotes: 0,
      readingTimeMinutes: body.readingTimeMinutes,
      version: 1,
      lastMajorUpdate: undefined,
      isFeatured: false,
      sortOrder: 0,
      visibility: storedKbVisibility(args.visibility ?? "public"),
      audiences,
      meilisearchSynced: false,
      meilisearchSyncedAt: undefined,
      ragSynced: false,
      ragSyncedAt: undefined,
      createdAt: now,
      updatedAt: now,
    }, undefined, undefined, body.mediaIds);
    if (helpContexts?.length) await setArticleContexts(ctx, articleId, helpContexts);

    await emitEvent(ctx, KB_EVENTS.ARTICLE_CREATED, SYSTEM.KB, {
      articleId,
      title: title || "Untitled Article",
      authorId: user._id,
    });

    return articleId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateArticleArgs,
  returns: v.id("kb_articles"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }
    const user = await requireArticleEditor(ctx, article);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    let mediaIds: Id<"media">[] | undefined;

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length > MAX_KB_TITLE_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Title must be ${MAX_KB_TITLE_LENGTH} characters or fewer`,
        });
      }
      updates.title = title;
    }
    const slug = await resolveArticleSlug(ctx, { ...(args.title !== undefined ? { title: args.title.trim() } : {}), ...(args.slug !== undefined ? { slug: args.slug } : {}) }, article);
    if (slug !== undefined && slug !== article.slug) {
      await recordPublishedSlug(ctx, article, slug);
      updates.slug = slug;
    }

    if (args.excerpt !== undefined) {
      if (args.excerpt.length > MAX_KB_EXCERPT_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Excerpt must be ${MAX_KB_EXCERPT_LENGTH} characters or fewer`,
        });
      }
      updates.excerpt = args.excerpt;
    }

    let bodyChanged = false;
    if (args.content !== undefined) {
      const body = prepareArticleContent(ctx, args.content, args.articleId);
      bodyChanged = body.content !== article.content;
      updates.content = body.content;
      updates.contentVersion = body.contentVersion;
      updates.contentPlainText = body.contentPlainText;
      updates.outline = body.outline;
      updates.linkedArticleIds = body.linkedArticleIds;
      updates.readingTimeMinutes = body.readingTimeMinutes;
      mediaIds = body.mediaIds;
      // An excerpt nobody wrote follows the body.
      if (args.excerpt === undefined && (!article.excerpt || article.excerpt === kbExcerpt(articleDoc(article)))) {
        updates.excerpt = body.excerpt;
      }
      if (bodyChanged) {
        updates.meilisearchSynced = false;
        updates.ragSynced = false;
        // Rewriting the body is a review.
        updates.lastReviewedAt = Date.now();
        updates.reviewedBy = user._id;
      }
    }

    if (args.categoryId !== undefined) {
      await requireAssignableCategory(ctx, args.categoryId);
      updates.categoryId = args.categoryId;
    }

    const wasInternal = isInternalKbArticle(article);
    const visibility = args.visibility ?? kbArticleVisibility(article);
    if (args.visibility !== undefined) updates.visibility = storedKbVisibility(args.visibility);
    if (args.audiences !== undefined) updates.audiences = storedKbAudiences(args.audiences);
    // Making a published or scheduled internal article public publishes it to
    // the website, which needs publishing authority, not just edit rights.
    if (wasInternal && visibility === "public" && (article.status === "published" || article.scheduledAt !== undefined)) {
      await requireCan(ctx, "kb.publish");
    }
    if (wasInternal !== (visibility === "internal")) {
      updates.meilisearchSynced = false;
      updates.ragSynced = false;
    }
    if (args.parentArticleId !== undefined) updates.parentArticleId = args.parentArticleId;
    if (args.ownerId !== undefined) {
      if (args.ownerId !== null && !(await ctx.db.get("users", args.ownerId))) throw new ConvexError({ code: "NOT_FOUND", message: "The owner isn't a user of this site." });
      updates.ownerId = args.ownerId ?? undefined;
    }
    if (args.reviewIntervalDays !== undefined) {
      if (args.reviewIntervalDays !== null && (!Number.isInteger(args.reviewIntervalDays) || args.reviewIntervalDays < 1 || args.reviewIntervalDays > 3650)) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Review every 1 to 3,650 days." });
      }
      updates.reviewIntervalDays = args.reviewIntervalDays ?? undefined;
    }
    if (args.metaTitle !== undefined) updates.metaTitle = args.metaTitle;
    if (args.metaDescription !== undefined) updates.metaDescription = args.metaDescription;
    if (args.featuredImageId !== undefined) updates.featuredImageId = args.featuredImageId;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;

    if (args.keywords !== undefined) {
      if (args.keywords.length > MAX_KEYWORDS) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Maximum ${MAX_KEYWORDS} keywords allowed`,
        });
      }
      updates.keywords = args.keywords;
    }

    // Track contributors
    if (!article.contributors.includes(user._id) && user._id !== article.authorId) {
      updates.contributors = [...article.contributors, user._id];
    }

    // Search reads title, keywords and body together.
    if (updates.title !== undefined || updates.keywords !== undefined || updates.contentPlainText !== undefined || article.searchText === undefined) {
      updates.searchText = articleSearchText(
        typeof updates.title === "string" ? updates.title : article.title,
        Array.isArray(updates.keywords) ? (updates.keywords as string[]) : article.keywords,
        typeof updates.contentPlainText === "string" ? updates.contentPlainText : article.contentPlainText,
      );
    }

    // Each saved change to the body or title keeps the previous text.
    if (bodyChanged || (updates.title !== undefined && updates.title !== article.title)) {
      await snapshotArticle(ctx, article, user._id, args.changeSummary?.trim() || "Saved");
      updates.version = article.version + 1;
    }

    // Every image in a new body must still be usable in the library.
    if (mediaIds?.length) await assertMediaAttachments(ctx, "kb_articles", {}, undefined, mediaIds);
    await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", args.articleId, updates);
    if (args.helpContexts !== undefined) await setArticleContexts(ctx, args.articleId, args.helpContexts);
    await applyKbPublicCounts(ctx, args.articleId, article, {
      status: article.status, visibility: storedKbVisibility(visibility), categoryId: args.categoryId ?? article.categoryId,
    });
    if (!wasInternal && visibility === "internal") {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
      await withdrawInternalKbArticle(ctx, article, { subject: identity.subject, issuer: identity.issuer, tokenIdentifier: identity.tokenIdentifier });
    }

    await emitEvent(ctx, KB_EVENTS.ARTICLE_UPDATED, SYSTEM.KB, {
      articleId: args.articleId,
      title: updates.title ?? article.title,
      authorId: user._id,
    });

    return args.articleId;
  },
});

// ─── Publish ────────────────────────────────────────────────────────────────

export const publish = mutation({
  args: publishArticleArgs,
  returns: v.id("kb_articles"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (article.status === "published") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article is already published" });
    }

    if (!article.content || article.contentPlainText.trim().length === 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Cannot publish an article with no content" });
    }

    if (args.scheduledAt !== undefined && (!Number.isSafeInteger(args.scheduledAt) || args.scheduledAt <= 0 || args.scheduledAt > 8_640_000_000_000_000)) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Scheduled publication requires a valid timestamp in whole milliseconds." });
    }
    const now = Date.now();
    const updates: Record<string, unknown> = {
      status: "published" as const,
      publishedAt: args.scheduledAt ?? now,
      scheduledAt: args.scheduledAt ?? undefined,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    };

    // If scheduled for the future, don't set status to published yet
    if (args.scheduledAt && args.scheduledAt > now) {
      updates.status = "draft";
      updates.publishedAt = undefined;
      // Schedule the publish via internal function
      // (actual scheduling handled by the internals cron)
    } else {
      // Immediate publish: clear scheduledAt so it doesn't linger
      updates.scheduledAt = undefined;
    }

    await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", args.articleId, updates);

    // Public counts change only when publishing immediately (not scheduling for future)
    if (!args.scheduledAt || args.scheduledAt <= now) {
      await applyKbPublicCounts(ctx, args.articleId, article, { ...article, status: "published" });
    }

    if (updates.status === "draft") {
      await emitEvent(ctx, KB_EVENTS.ARTICLE_SCHEDULED, SYSTEM.KB, {
        articleId: args.articleId, title: article.title, authorId: user._id, scheduledAt: args.scheduledAt,
      });
    } else {
      await emitEvent(ctx, KB_EVENTS.ARTICLE_PUBLISHED, SYSTEM.KB, {
        articleId: args.articleId, title: article.title, authorId: user._id, publishedAt: updates.publishedAt ?? now,
      });
    }

    return args.articleId;
  },
});

// ─── Unpublish ──────────────────────────────────────────────────────────────

export const unpublish = mutation({
  args: unpublishArticleArgs,
  returns: v.id("kb_articles"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (article.status !== "published") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article is not published" });
    }

    const now = Date.now();
    await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", args.articleId, {
      status: "draft",
      publishedAt: undefined,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    await applyKbPublicCounts(ctx, args.articleId, article, { ...article, status: "draft" });

    await emitEvent(ctx, KB_EVENTS.ARTICLE_UNPUBLISHED, SYSTEM.KB, {
      articleId: args.articleId,
      title: article.title,
    });

    return args.articleId;
  },
});

// ─── Archive ────────────────────────────────────────────────────────────────

export const archive = mutation({
  args: archiveArticleArgs,
  returns: v.id("kb_articles"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.delete");

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const now = Date.now();

    await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", args.articleId, {
      status: "archived",
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    await applyKbPublicCounts(ctx, args.articleId, article, { ...article, status: "archived" });

    await emitEvent(ctx, KB_EVENTS.ARTICLE_ARCHIVED, SYSTEM.KB, {
      articleId: args.articleId,
      title: article.title,
      authorId: user._id,
    });

    return args.articleId;
  },
});

// ─── Remove (Permanent Delete) ──────────────────────────────────────────────

export const remove = mutation({
  args: removeArticleArgs,
  returns: v.id("kb_articles"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.delete");

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Public counts read the tag and collection links, so settle them first.
    await applyKbPublicCounts(ctx, args.articleId, article, null);

    // Delete all related data
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const at of articleTags) {
      // Decrement tag article count
      const tag = await ctx.db.get("kb_tags", at.tagId);
      if (tag && tag.articleCount > 0) {
        await ctx.db.patch("kb_tags", at.tagId, { articleCount: tag.articleCount - 1, updatedAt: Date.now() });
      }
      await ctx.db.delete("kb_articleTags", at._id);
    }

    const relatedFrom = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_source", (q) => q.eq("sourceArticleId", args.articleId))
      .take(1000);
    for (const r of relatedFrom) await ctx.db.delete("kb_relatedArticles", r._id);

    const relatedTo = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_related", (q) => q.eq("relatedArticleId", args.articleId))
      .take(1000);
    for (const r of relatedTo) await ctx.db.delete("kb_relatedArticles", r._id);
    await removeArticleContexts(ctx, args.articleId);
    const slugHistory = await ctx.db.query("kb_articleSlugHistory").withIndex("by_article", (q) => q.eq("articleId", args.articleId)).take(200);
    for (const row of slugHistory) await ctx.db.delete("kb_articleSlugHistory", row._id);

    const versions = await ctx.db
      .query("kb_articleVersions")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const v of versions) await deleteWithMediaReferences<"kb_articleVersions">(ctx, "kb_articleVersions", v._id);

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const ca of collectionArticles) {
      const collection = await ctx.db.get("kb_collections", ca.collectionId);
      if (collection && collection.articleCount > 0) {
        await patchWithMediaReferences<"kb_collections">(ctx, "kb_collections", ca.collectionId, {
          articleCount: collection.articleCount - 1,
          updatedAt: Date.now(),
        });
      }
      await ctx.db.delete("kb_collectionArticles", ca._id);
    }

    const feedback = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const f of feedback) await ctx.db.delete("kb_articleFeedback", f._id);

    const bookmarks = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const b of bookmarks) await ctx.db.delete("kb_bookmarks", b._id);

    const progress = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const p of progress) await ctx.db.delete("kb_userProgress", p._id);

    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const pv of views) await ctx.db.delete("kb_pageViews", pv._id);

    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const c of comments) {
      const votes = await ctx.db
        .query("kb_commentVotes")
        .withIndex("by_comment", (q) => q.eq("commentId", c._id))
        .take(1000);
      for (const cv of votes) await ctx.db.delete("kb_commentVotes", cv._id);
      await ctx.db.delete("kb_comments", c._id);
    }

    const ragChunks = await ctx.db
      .query("kb_ragChunks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const rc of ragChunks) await ctx.db.delete("kb_ragChunks", rc._id);

    // Clean up article workflows
    const articleWorkflows = await ctx.db
      .query("kb_articleWorkflows")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);
    for (const aw of articleWorkflows) {
      await ctx.db.delete("kb_articleWorkflows", aw._id);
    }

    await deleteWithMediaReferences<"kb_articles">(ctx, "kb_articles", args.articleId);
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation", { articleId: import("../_generated/dataModel").Id<"kb_articles"> }, null>("kb/categoryAccess:cleanupDeletedArticle"), { articleId: args.articleId });

    await emitEvent(ctx, KB_EVENTS.ARTICLE_DELETED, SYSTEM.KB, { articleId: args.articleId });

    return args.articleId;
  },
});

// ─── Toggle Featured ────────────────────────────────────────────────────────

export const toggleFeatured = mutation({
  args: toggleFeaturedArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", args.articleId, {
      isFeatured: !article.isFeatured,
      updatedAt: Date.now(),
    });

    return !article.isFeatured;
  },
});

// ─── Create Version ─────────────────────────────────────────────────────────

export const createVersion = mutation({
  args: createVersionArgs,
  returns: v.id("kb_articleVersions"),
  handler: async (ctx, args): Promise<import("../_generated/dataModel").Id<"kb_articleVersions">> => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }
    const user = await requireArticleEditor(ctx, article);

    const now = Date.now();
    const versionId = await snapshotArticle(ctx, article, user._id, args.changeSummary);

    await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", args.articleId, {
      version: article.version + 1,
      lastMajorUpdate: now,
      updatedAt: now,
    });

    return versionId;
  },
});

// ─── Mark Reviewed ──────────────────────────────────────────────────────────

/** An editor confirms the article is still right without changing it. */
export const markReviewed = mutation({
  args: markReviewedArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    const user = await requireArticleEditor(ctx, article);
    await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", article._id, { lastReviewedAt: Date.now(), reviewedBy: user._id });
    return null;
  },
});
