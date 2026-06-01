/**
 * AI Course Generation - public mutations.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { mutation } from "../../_generated/server";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { normalizeOutline } from "./helpers";
import { requireCourseAuthorOrEditor, requireNodeCourseAuthorOrEditor } from "../access";
import { textToDoc } from "../lessons/helpers";

export const approveOutline = mutation({
  args: { generationId: v.id("lms_ai_generations") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const generation = await ctx.db.get(args.generationId);
    if (!generation || generation.stage !== "outline" || generation.targetType !== "course") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Outline generation not found" });
    }
    if (generation.reviewStatus === "reviewed") {
      throw new ConvexError({ code: "ALREADY_APPROVED", message: "Outline already approved" });
    }
    const course = await ctx.db.get(generation.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    const { user } = await requireCourseAuthorOrEditor(ctx, generation.courseId, "lms.ai.generate");

    const outline = normalizeOutline((generation.briefJson as any)?.outline);
    const now = Date.now();
    const existingTopics = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course_kind", (q) =>
        q.eq("courseId", generation.courseId).eq("kind", "topic"),
      )
      .collect();
    const existingLessons = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course_kind", (q) =>
        q.eq("courseId", generation.courseId).eq("kind", "lesson"),
      )
      .collect();

    let tPos = Math.max(0, ...existingTopics.map((node) => node.position)) + 1;
    let topicCount = 0;
    let lessonCount = 0;
    for (const topic of outline.topics) {
      const topicId = await ctx.db.insert("lms_nodes", {
        courseId: generation.courseId,
        kind: "topic",
        title: topic.title || "Untitled topic",
        position: tPos++,
        description: topic.summary,
        createdAt: now,
        updatedAt: now,
      });
      topicCount++;
      let lPos = 1;
      for (const lesson of topic.lessons) {
        const lessonId = await ctx.db.insert("lms_nodes", {
          courseId: generation.courseId,
          parentId: topicId,
          kind: "lesson",
          title: lesson.title || "Untitled lesson",
          position: lPos++,
          materialsDoc: lesson.brief
            ? {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: lesson.brief }],
                  },
                ],
              }
            : undefined,
          showMarkComplete: true,
          createdAt: now,
          updatedAt: now,
        });
        lessonCount++;
        await ctx.db.insert("lms_jobs", {
          courseId: generation.courseId,
          generationId: args.generationId,
          kind: "lesson_body",
          targetId: String(lessonId),
          status: "queued",
          progress: 0,
          createdAt: now,
        });
      }
    }

    await ctx.db.patch(generation.courseId, {
      topicCount: existingTopics.length + topicCount,
      lessonCount: existingLessons.length + lessonCount,
      updatedAt: now,
    });
    await ctx.db.patch(args.generationId, {
      reviewStatus: "reviewed",
      reviewedBy: user._id,
      reviewedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      (internal as any).lms.ai.internalActions.generateLessonBodies,
      { generationId: args.generationId },
    );
    return { topicCount, lessonCount };
  },
});

export const applyLessonGeneration = mutation({
  args: {
    generationId: v.id("lms_ai_generations"),
    nodeId: v.optional(v.id("lms_nodes")),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const generation = await ctx.db.get(args.generationId);
    if (!generation || generation.stage !== "lesson_body" || generation.targetType !== "node") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Lesson generation not found" });
    }
    if (generation.reviewStatus === "reviewed") {
      throw new ConvexError({ code: "ALREADY_APPLIED", message: "AI draft already applied" });
    }
    const nodeId = args.nodeId ?? (generation.targetId as any);
    if (String(nodeId) !== generation.targetId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Generation does not belong to this lesson.",
      });
    }
    const { user, node } = await requireNodeCourseAuthorOrEditor(ctx, nodeId, "lms.ai.generate");
    if (node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Node is not a lesson" });
    }
    const generatedBody = String((generation.briefJson as any)?.generatedBody ?? "").trim();
    if (!generatedBody) {
      throw new ConvexError({
        code: "EMPTY_GENERATION",
        message: "This AI draft does not contain lesson body content.",
      });
    }

    const now = Date.now();
    await ctx.db.insert("lms_lessonVersions", {
      nodeId,
      bodyDoc: node.bodyDoc ?? textToDoc(""),
      snapshotJson: lessonSnapshot(node),
      editedBy: user._id,
      createdAt: now,
    });
    await ctx.db.patch(nodeId, {
      bodyDoc: textToDoc(generatedBody),
      updatedAt: now,
    });
    await ctx.db.patch(args.generationId, {
      reviewStatus: "reviewed",
      reviewedBy: user._id,
      reviewedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.LESSON_UPDATED, SYSTEM.LMS, {
      courseId: node.courseId,
      nodeId,
      source: "ai_generation",
      generationId: args.generationId,
      changedFields: ["bodyDoc"],
    });
    return { ok: true, updatedAt: now, changedFields: ["bodyDoc"] };
  },
});

function lessonSnapshot(node: any) {
  const snapshot = {
    title: node.title,
    bodyDoc: node.bodyDoc,
    materialsDoc: node.materialsDoc,
    videoUrl: node.videoUrl,
    videoProvider: node.videoProvider,
    videoMediaId: node.videoMediaId,
    isPreview: node.isPreview,
    requireVideoWatch: node.requireVideoWatch,
    autoComplete: node.autoComplete,
    completionDelaySec: node.completionDelaySec,
    minTimeSeconds: node.minTimeSeconds,
    showMarkComplete: node.showMarkComplete,
    lessonDripMode: node.lessonDripMode,
    lessonDripOffsetDays: node.lessonDripOffsetDays,
    lessonDripDate: node.lessonDripDate,
  };
  return {
    values: Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== undefined)),
    unsetFields: Object.entries(snapshot)
      .filter(([, value]) => value === undefined)
      .map(([field]) => field),
  };
}
