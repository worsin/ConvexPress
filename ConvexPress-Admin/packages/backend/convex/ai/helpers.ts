/**
 * AI Content Generation - Queries & Mutations (Convex runtime)
 *
 * These run in the default Convex runtime (NOT Node.js).
 * Actions that call external APIs are in internals.ts.
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Fetch post data needed for AI generation.
 */
export const getPostForAi = internalQuery({
  args: { postId: v.id("posts"), callerSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    // Determine if the caller can edit this post
    let callerCanEdit = false;
    if (args.callerSubject) {
      const callerUser = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("clerkUserId"), args.callerSubject))
        .first();
      if (callerUser?.roleId) {
        const role = await ctx.db.get(callerUser.roleId);
        const level = role?.level ?? 0;
        // Editor+ (level 80+) can edit anyone's posts
        // Author (level 60+) can edit their own posts
        callerCanEdit = level >= 80 || (level >= 60 && post.authorId === args.callerSubject);
      }
    }

    return {
      type: post.type,
      title: post.title,
      authorId: post.authorId,
      callerCanEdit,
      pagePrompt: post.pagePrompt,
      hero: post.hero,
      topics: post.topics,
      summary: post.summary,
      sources: post.sources,
      tableOfContents: post.tableOfContents,
    };
  },
});

/**
 * Save AI-generated content back to the post.
 * Only updates provided fields (partial update).
 */
export const saveGeneratedContent = internalMutation({
  args: {
    postId: v.id("posts"),
    title: v.optional(v.string()),
    hero: v.optional(v.object({
      title: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      content: v.optional(v.string()),
    })),
    topics: v.optional(v.array(v.object({
      title: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      content: v.optional(v.string()),
    }))),
    summary: v.optional(v.object({
      title: v.optional(v.string()),
      content: v.optional(v.string()),
    })),
    sources: v.optional(v.string()),
    tableOfContents: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { postId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.hero !== undefined) patch.hero = fields.hero;
    if (fields.topics !== undefined) patch.topics = fields.topics;
    if (fields.summary !== undefined) patch.summary = fields.summary;
    if (fields.sources !== undefined) patch.sources = fields.sources;
    if (fields.tableOfContents !== undefined) patch.tableOfContents = fields.tableOfContents;
    await ctx.db.patch(postId, patch);
  },
});
