/**
 * Lesson System - mutations (leaf content: body, video, settings).
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { textToDoc, detectVideoProvider } from "./helpers";

export const updateLessonContent = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    title: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    isPreview: v.optional(v.boolean()),
    requireVideoWatch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 60);

    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new ConvexError({ code: "NOT_FOUND", message: "Lesson not found" });
    if (node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Node is not a lesson" });
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim() || "Untitled";
    if (args.bodyText !== undefined) patch.bodyDoc = textToDoc(args.bodyText);
    if (args.videoUrl !== undefined) {
      patch.videoUrl = args.videoUrl;
      patch.videoProvider = args.videoUrl ? detectVideoProvider(args.videoUrl) : undefined;
    }
    if (args.isPreview !== undefined) patch.isPreview = args.isPreview;
    if (args.requireVideoWatch !== undefined) patch.requireVideoWatch = args.requireVideoWatch;

    await ctx.db.patch(args.nodeId, patch as never);
    return args.nodeId;
  },
});
