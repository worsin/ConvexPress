/**
 * Lesson System - mutations (leaf content: body, video, materials, settings).
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { textToDoc, detectVideoProvider } from "./helpers";
import { lmsDripModeValidator } from "../../schema/lms";

export const updateLessonContent = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    title: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    materialsText: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    isPreview: v.optional(v.boolean()),
    requireVideoWatch: v.optional(v.boolean()),
    autoComplete: v.optional(v.boolean()),
    completionDelaySec: v.optional(v.number()),
    minTimeSeconds: v.optional(v.number()),
    showMarkComplete: v.optional(v.boolean()),
    dripMode: v.optional(lmsDripModeValidator),
    dripOffsetDays: v.optional(v.number()),
    dripDate: v.optional(v.number()),
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
    if (args.materialsText !== undefined) patch.materialsDoc = textToDoc(args.materialsText);
    if (args.videoUrl !== undefined) {
      patch.videoUrl = args.videoUrl;
      patch.videoProvider = args.videoUrl ? detectVideoProvider(args.videoUrl) : undefined;
    }
    if (args.isPreview !== undefined) patch.isPreview = args.isPreview;
    if (args.requireVideoWatch !== undefined) patch.requireVideoWatch = args.requireVideoWatch;
    if (args.autoComplete !== undefined) patch.autoComplete = args.autoComplete;
    if (args.completionDelaySec !== undefined) patch.completionDelaySec = args.completionDelaySec;
    if (args.minTimeSeconds !== undefined) patch.minTimeSeconds = args.minTimeSeconds;
    if (args.showMarkComplete !== undefined) patch.showMarkComplete = args.showMarkComplete;
    if (args.dripMode !== undefined) patch.lessonDripMode = args.dripMode;
    if (args.dripOffsetDays !== undefined) patch.lessonDripOffsetDays = args.dripOffsetDays;
    if (args.dripDate !== undefined) patch.lessonDripDate = args.dripDate;

    await ctx.db.patch(args.nodeId, patch as never);
    await emitEvent(ctx, "lms.lesson_updated", "lms", {
      nodeId: args.nodeId,
      courseId: node.courseId,
    });
    return args.nodeId;
  },
});
