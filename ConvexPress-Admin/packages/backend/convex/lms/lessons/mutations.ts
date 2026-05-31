/**
 * Lesson System - mutations (leaf content: body, video, materials, settings).
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { textToDoc, detectVideoProvider } from "./helpers";
import { lmsDripModeValidator } from "../../schema/lms";
import { requireNodeCourseAuthorOrEditor } from "../access";

export const updateLessonContent = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    title: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    materialsText: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    videoMediaId: v.optional(v.id("media")),
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
    const { user, node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId);
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
    if (args.videoMediaId !== undefined) patch.videoMediaId = args.videoMediaId;
    if (args.isPreview !== undefined) patch.isPreview = args.isPreview;
    if (args.requireVideoWatch !== undefined) patch.requireVideoWatch = args.requireVideoWatch;
    if (args.autoComplete !== undefined) patch.autoComplete = args.autoComplete;
    if (args.completionDelaySec !== undefined) patch.completionDelaySec = args.completionDelaySec;
    if (args.minTimeSeconds !== undefined) patch.minTimeSeconds = args.minTimeSeconds;
    if (args.showMarkComplete !== undefined) patch.showMarkComplete = args.showMarkComplete;
    if (args.dripMode !== undefined) patch.lessonDripMode = args.dripMode;
    if (args.dripOffsetDays !== undefined) patch.lessonDripOffsetDays = args.dripOffsetDays;
    if (args.dripDate !== undefined) patch.lessonDripDate = args.dripDate;

    if (args.bodyText !== undefined && node.bodyDoc !== undefined) {
      await ctx.db.insert("lms_lessonVersions", {
        nodeId: args.nodeId,
        bodyDoc: node.bodyDoc,
        editedBy: user._id,
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(args.nodeId, patch as never);
    await emitEvent(ctx, LMS_EVENTS.LESSON_UPDATED, SYSTEM.LMS, {
      nodeId: args.nodeId,
      courseId: node.courseId,
    });
    return args.nodeId;
  },
});

export const restoreLessonVersion = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    versionId: v.id("lms_lessonVersions"),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { user, node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId);
    if (node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Node is not a lesson" });
    }
    const version = await ctx.db.get(args.versionId);
    if (!version || version.nodeId !== args.nodeId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Lesson version not found" });
    }
    if (node.bodyDoc !== undefined) {
      await ctx.db.insert("lms_lessonVersions", {
        nodeId: args.nodeId,
        bodyDoc: node.bodyDoc,
        editedBy: user._id,
        createdAt: Date.now(),
      });
    }
    await ctx.db.patch(args.nodeId, {
      bodyDoc: version.bodyDoc,
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, LMS_EVENTS.LESSON_VERSION_RESTORED, SYSTEM.LMS, {
      nodeId: args.nodeId,
      versionId: args.versionId,
      courseId: node.courseId,
    });
    return args.nodeId;
  },
});
