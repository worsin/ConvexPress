/**
 * Knowledge Base System - Tag Functions
 *
 * CRUD and article tagging operations:
 *   list             - All tags (public)
 *   getBySlug        - Single tag by slug (public)
 *   create           - Create a new tag
 *   update           - Update an existing tag
 *   remove           - Delete a tag and all article associations
 *   addToArticle     - Tag an article
 *   removeFromArticle - Untag an article
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateTagSlug } from "./helpers/utils";
import {
  createTagArgs,
  updateTagArgs,
  removeTagArgs,
  addTagToArticleArgs,
  removeTagFromArticleArgs,
  getTagBySlugArgs,
} from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── List (Public) ──────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    return ctx.db.query("kb_tags").take(500);
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getTagBySlugArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    return ctx.db
      .query("kb_tags")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createTagArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageTags");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Tag name is required" });
    }

    const slug = await generateTagSlug(ctx, name);
    const now = Date.now();

    const tagId = await ctx.db.insert("kb_tags", {
      name,
      slug,
      description: args.description,
      color: args.color,
      articleCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return tagId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateTagArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageTags");

    const tag = await ctx.db.get("kb_tags", args.tagId);
    if (!tag) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tag not found" });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Tag name is required" });
      }
      updates.name = name;
      updates.slug = await generateTagSlug(ctx, name, args.tagId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.color !== undefined) updates.color = args.color;

    await ctx.db.patch("kb_tags", args.tagId, updates);
    return args.tagId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeTagArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageTags");

    const tag = await ctx.db.get("kb_tags", args.tagId);
    if (!tag) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tag not found" });
    }

    // Delete all article-tag associations
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .take(1000);
    for (const at of articleTags) {
      await ctx.db.delete("kb_articleTags", at._id);
    }

    await ctx.db.delete("kb_tags", args.tagId);
    return args.tagId;
  },
});

// ─── Add To Article ─────────────────────────────────────────────────────────

export const addToArticle = mutation({
  args: addTagToArticleArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    // Check for existing association
    const existing = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article_tag", (q) =>
        q.eq("articleId", args.articleId).eq("tagId", args.tagId),
      )
      .first();

    if (existing) return existing._id; // Already tagged

    const linkId = await ctx.db.insert("kb_articleTags", {
      articleId: args.articleId,
      tagId: args.tagId,
      createdAt: Date.now(),
    });

    // Increment tag article count
    const tag = await ctx.db.get("kb_tags", args.tagId);
    if (tag) {
      await ctx.db.patch("kb_tags", args.tagId, {
        articleCount: tag.articleCount + 1,
        updatedAt: Date.now(),
      });
    }

    return linkId;
  },
});

// ─── Remove From Article ────────────────────────────────────────────────────

export const removeFromArticle = mutation({
  args: removeTagFromArticleArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existing = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article_tag", (q) =>
        q.eq("articleId", args.articleId).eq("tagId", args.tagId),
      )
      .first();

    if (!existing) return null; // Not tagged

    await ctx.db.delete("kb_bookmarks", existing._id);

    // Decrement tag article count
    const tag = await ctx.db.get("kb_tags", args.tagId);
    if (tag && tag.articleCount > 0) {
      await ctx.db.patch("kb_tags", args.tagId, {
        articleCount: tag.articleCount - 1,
        updatedAt: Date.now(),
      });
    }

    return existing._id;
  },
});
