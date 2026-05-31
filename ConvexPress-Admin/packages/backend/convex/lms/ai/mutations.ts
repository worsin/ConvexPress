/**
 * AI Course Generation - public mutations.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { mutation } from "../../_generated/server";
import { requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { normalizeOutline } from "./helpers";

export const approveOutline = mutation({
  args: { generationId: v.id("lms_ai_generations") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireMinimumRoleLevel(ctx, 60);
    const generation = await ctx.db.get(args.generationId);
    if (!generation || generation.stage !== "outline" || generation.targetType !== "course") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Outline generation not found" });
    }
    if (generation.reviewStatus === "reviewed") {
      throw new ConvexError({ code: "ALREADY_APPROVED", message: "Outline already approved" });
    }
    const course = await ctx.db.get(generation.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });

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
