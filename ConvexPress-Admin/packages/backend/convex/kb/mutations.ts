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

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import {
  generateArticleSlug,
  extractPlainText,
  calculateReadingTime,
  generateExcerpt,
} from "./helpers/utils";
import {
  createArticleArgs,
  updateArticleArgs,
  publishArticleArgs,
  unpublishArticleArgs,
  archiveArticleArgs,
  removeArticleArgs,
  toggleFeaturedArgs,
  createVersionArgs,
  MAX_KB_TITLE_LENGTH,
  MAX_KB_EXCERPT_LENGTH,
  MAX_KEYWORDS,
} from "./validators";

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createArticleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.create");

    const title = (args.title ?? "").trim();
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

    const slug = await generateArticleSlug(ctx, title || "untitled");
    const content = args.content ?? "";
    const plainText = args.contentPlainText ?? extractPlainText(content);
    const excerpt = args.excerpt ?? generateExcerpt(plainText);
    const readingTime = calculateReadingTime(plainText);

    // If a template was specified, increment its usage count
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template) {
        await ctx.db.patch(args.templateId, {
          usageCount: template.usageCount + 1,
          updatedAt: Date.now(),
        });
      }
    }

    const now = Date.now();
    const articleId = await ctx.db.insert("kb_articles", {
      title: title || "Untitled Article",
      slug,
      excerpt,
      content,
      contentPlainText: plainText,
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
      readingTimeMinutes: readingTime,
      version: 1,
      lastMajorUpdate: undefined,
      isFeatured: false,
      sortOrder: 0,
      meilisearchSynced: false,
      meilisearchSyncedAt: undefined,
      ragSynced: false,
      ragSyncedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

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
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Check edit permission: kb.edit for any article, kb.editOwn for own articles
    const isOwner = article.authorId === user._id;
    if (!isOwner) {
      await requireCan(ctx, "kb.edit");
    } else {
      await requireCan(ctx, "kb.editOwn");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length > MAX_KB_TITLE_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Title must be ${MAX_KB_TITLE_LENGTH} characters or fewer`,
        });
      }
      updates.title = title;
      updates.slug = await generateArticleSlug(ctx, title, args.articleId);
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

    if (args.content !== undefined) {
      updates.content = args.content;
      const plainText = args.contentPlainText ?? extractPlainText(args.content);
      updates.contentPlainText = plainText;
      updates.readingTimeMinutes = calculateReadingTime(plainText);
      // Mark search sync as stale
      updates.meilisearchSynced = false;
      updates.ragSynced = false;
    }

    if (args.categoryId !== undefined) {
      updates.categoryId = args.categoryId;
      // Update category article counts if category changed and article is published
      if (article.status === "published" && args.categoryId !== article.categoryId) {
        const now = Date.now();
        // Decrement old category count
        if (article.categoryId) {
          const oldCategory = await ctx.db.get(article.categoryId);
          if (oldCategory && oldCategory.articleCount > 0) {
            await ctx.db.patch(article.categoryId, {
              articleCount: oldCategory.articleCount - 1,
              updatedAt: now,
            });
          }
        }
        // Increment new category count
        if (args.categoryId) {
          const newCategory = await ctx.db.get(args.categoryId);
          if (newCategory) {
            await ctx.db.patch(args.categoryId, {
              articleCount: newCategory.articleCount + 1,
              updatedAt: now,
            });
          }
        }
      }
    }
    if (args.parentArticleId !== undefined) updates.parentArticleId = args.parentArticleId;
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

    await ctx.db.patch(args.articleId, updates);

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
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (article.status === "published") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article is already published" });
    }

    const now = Date.now();
    const updates: Record<string, any> = {
      status: "published" as const,
      publishedAt: args.scheduledAt ?? now,
      scheduledAt: args.scheduledAt,
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
    }

    await ctx.db.patch(args.articleId, updates);

    // Update category article count only when publishing immediately (not scheduling for future)
    if (!args.scheduledAt || args.scheduledAt <= now) {
      if (article.categoryId) {
        const category = await ctx.db.get(article.categoryId);
        if (category) {
          await ctx.db.patch(article.categoryId, {
            articleCount: category.articleCount + 1,
            updatedAt: now,
          });
        }
      }
    }

    await emitEvent(ctx, KB_EVENTS.ARTICLE_PUBLISHED, SYSTEM.KB, {
      articleId: args.articleId,
      title: article.title,
      authorId: user._id,
      publishedAt: updates.publishedAt ?? now,
    });

    return args.articleId;
  },
});

// ─── Unpublish ──────────────────────────────────────────────────────────────

export const unpublish = mutation({
  args: unpublishArticleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (article.status !== "published") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article is not published" });
    }

    const now = Date.now();
    await ctx.db.patch(args.articleId, {
      status: "draft",
      publishedAt: undefined,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    // Decrement category article count
    if (article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category && category.articleCount > 0) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount - 1,
          updatedAt: now,
        });
      }
    }

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
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.delete");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const wasPublished = article.status === "published";
    const now = Date.now();

    await ctx.db.patch(args.articleId, {
      status: "archived",
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    // Decrement category count if was published
    if (wasPublished && article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category && category.articleCount > 0) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount - 1,
          updatedAt: now,
        });
      }
    }

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
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.delete");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Delete all related data
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const at of articleTags) {
      // Decrement tag article count
      const tag = await ctx.db.get(at.tagId);
      if (tag && tag.articleCount > 0) {
        await ctx.db.patch(at.tagId, { articleCount: tag.articleCount - 1, updatedAt: Date.now() });
      }
      await ctx.db.delete(at._id);
    }

    const relatedFrom = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_source", (q) => q.eq("sourceArticleId", args.articleId))
      .collect();
    for (const r of relatedFrom) await ctx.db.delete(r._id);

    const relatedTo = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_related", (q) => q.eq("relatedArticleId", args.articleId))
      .collect();
    for (const r of relatedTo) await ctx.db.delete(r._id);

    const versions = await ctx.db
      .query("kb_articleVersions")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const v of versions) await ctx.db.delete(v._id);

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const ca of collectionArticles) {
      const collection = await ctx.db.get(ca.collectionId);
      if (collection && collection.articleCount > 0) {
        await ctx.db.patch(ca.collectionId, {
          articleCount: collection.articleCount - 1,
          updatedAt: Date.now(),
        });
      }
      await ctx.db.delete(ca._id);
    }

    const feedback = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const f of feedback) await ctx.db.delete(f._id);

    const bookmarks = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const b of bookmarks) await ctx.db.delete(b._id);

    const progress = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const p of progress) await ctx.db.delete(p._id);

    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const pv of views) await ctx.db.delete(pv._id);

    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const c of comments) {
      const votes = await ctx.db
        .query("kb_commentVotes")
        .withIndex("by_comment", (q) => q.eq("commentId", c._id))
        .collect();
      for (const cv of votes) await ctx.db.delete(cv._id);
      await ctx.db.delete(c._id);
    }

    const ragChunks = await ctx.db
      .query("kb_ragChunks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const rc of ragChunks) await ctx.db.delete(rc._id);

    // Clean up article workflows
    const articleWorkflows = await ctx.db
      .query("kb_articleWorkflows")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const aw of articleWorkflows) {
      await ctx.db.delete(aw._id);
    }

    // Decrement category article count if was published
    if (article.status === "published" && article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category && category.articleCount > 0) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount - 1,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.articleId);

    await emitEvent(ctx, KB_EVENTS.ARTICLE_DELETED, SYSTEM.KB, { articleId: args.articleId });

    return args.articleId;
  },
});

// ─── Toggle Featured ────────────────────────────────────────────────────────

export const toggleFeatured = mutation({
  args: toggleFeaturedArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    await ctx.db.patch(args.articleId, {
      isFeatured: !article.isFeatured,
      updatedAt: Date.now(),
    });

    return !article.isFeatured;
  },
});

// ─── Create Version ─────────────────────────────────────────────────────────

export const createVersion = mutation({
  args: createVersionArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const isOwner = article.authorId === user._id;
    if (!isOwner) {
      await requireCan(ctx, "kb.edit");
    } else {
      await requireCan(ctx, "kb.editOwn");
    }

    const now = Date.now();
    const versionId = await ctx.db.insert("kb_articleVersions", {
      articleId: args.articleId,
      version: article.version,
      title: article.title,
      content: article.content,
      changeSummary: args.changeSummary,
      authorId: user._id,
      createdAt: now,
    });

    await ctx.db.patch(args.articleId, {
      version: article.version + 1,
      lastMajorUpdate: now,
      updatedAt: now,
    });

    return versionId;
  },
});
