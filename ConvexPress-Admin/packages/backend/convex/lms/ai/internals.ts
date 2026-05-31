/**
 * AI Course Generation - internal mutations/queries.
 */

import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import { requireMinimumRoleLevel } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { normalizeOutline, outlineStats, textToDoc } from "./helpers";

export const createJob = internalMutation({
  args: {
    courseId: v.id("lms_courses"),
    generationId: v.optional(v.id("lms_ai_generations")),
    kind: v.union(
      v.literal("outline"),
      v.literal("lesson_body"),
      v.literal("image"),
      v.literal("voiceover"),
      v.literal("captions"),
      v.literal("video"),
    ),
    targetId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMinimumRoleLevel(ctx, 60);
    return await ctx.db.insert("lms_jobs", {
      courseId: args.courseId,
      generationId: args.generationId,
      kind: args.kind,
      targetId: args.targetId,
      status: "queued",
      progress: 0,
      createdAt: Date.now(),
    });
  },
});

export const updateJob = internalMutation({
  args: {
    jobId: v.id("lms_jobs"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    progress: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: args.status,
    };
    if (args.progress !== undefined) patch.progress = args.progress;
    if (args.error !== undefined) patch.error = args.error;
    if (args.status === "running") patch.startedAt = now;
    if (args.status === "done" || args.status === "failed") patch.finishedAt = now;
    await ctx.db.patch(args.jobId, patch as never);
    return { ok: true };
  },
});

export const recordOutlineGeneration = internalMutation({
  args: {
    courseId: v.id("lms_courses"),
    prompt: v.string(),
    briefJson: v.any(),
    sourcesJson: v.optional(v.any()),
    topicCount: v.number(),
    lessonCount: v.number(),
  },
  handler: async (ctx, args) => {
    await requireMinimumRoleLevel(ctx, 60);
    const generationId = await ctx.db.insert("lms_ai_generations", {
      targetType: "course",
      targetId: String(args.courseId),
      courseId: args.courseId,
      stage: "outline",
      model: "configured-ai-provider",
      prompt: args.prompt,
      briefJson: args.briefJson,
      sourcesJson: args.sourcesJson,
      label: "ai_assisted",
      reviewStatus: "unreviewed",
      createdAt: Date.now(),
    });
    await emitEvent(ctx, LMS_EVENTS.AI_OUTLINE_GENERATED, SYSTEM.LMS, {
      courseId: args.courseId,
      generationId,
      topicCount: args.topicCount,
      lessonCount: args.lessonCount,
    });
    return generationId;
  },
});

export const getLessonBodyWork = internalQuery({
  args: { generationId: v.id("lms_ai_generations") },
  handler: async (ctx, args) => {
    const generation = await ctx.db.get(args.generationId);
    if (!generation) return null;
    const outline = normalizeOutline((generation.briefJson as any)?.outline);
    const jobs = await ctx.db
      .query("lms_jobs")
      .withIndex("by_generation", (q) => q.eq("generationId", args.generationId))
      .collect();
    const lessonJobs = [];
    for (const job of jobs.filter((job) => job.kind === "lesson_body" && job.targetId)) {
      const node = await ctx.db.get(job.targetId as any);
      if (node && node.kind === "lesson") {
        lessonJobs.push({ job, node });
      }
    }
    return { generation, outline, lessonJobs };
  },
});

export const writeLessonBody = internalMutation({
  args: {
    jobId: v.id("lms_jobs"),
    generationId: v.id("lms_ai_generations"),
    nodeId: v.id("lms_nodes"),
    bodyText: v.string(),
    prompt: v.string(),
    sourcesJson: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    const node = await ctx.db.get(args.nodeId);
    if (!job || !node || node.kind !== "lesson") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Lesson generation job not found" });
    }
    const now = Date.now();
    await ctx.db.patch(args.nodeId, {
      bodyDoc: textToDoc(args.bodyText),
      updatedAt: now,
    });
    await ctx.db.insert("lms_ai_generations", {
      targetType: "node",
      targetId: String(args.nodeId),
      courseId: node.courseId,
      stage: "lesson_body",
      model: "configured-ai-provider",
      prompt: args.prompt,
      briefJson: { parentGenerationId: args.generationId },
      sourcesJson: args.sourcesJson,
      label: "ai_assisted",
      reviewStatus: "unreviewed",
      createdAt: now,
    });
    await ctx.db.patch(args.jobId, {
      status: "done",
      progress: 100,
      finishedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.AI_LESSON_GENERATED, SYSTEM.LMS, {
      courseId: node.courseId,
      nodeId: args.nodeId,
      generationId: args.generationId,
    });
    return { ok: true };
  },
});

// Backward-compatible materializer for any existing caller. New UI uses
// approveOutline, which reviews before materializing and queues lesson jobs.
export const materializeOutline = internalMutation({
  args: { courseId: v.id("lms_courses"), outline: v.any(), prompt: v.string() },
  handler: async (ctx, args): Promise<{ topicCount: number; lessonCount: number }> => {
    await requireMinimumRoleLevel(ctx, 60);
    const outline = normalizeOutline(args.outline);
    const now = Date.now();
    const existingTopics = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course_kind", (q) => q.eq("courseId", args.courseId).eq("kind", "topic"))
      .collect();
    const existingLessons = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course_kind", (q) => q.eq("courseId", args.courseId).eq("kind", "lesson"))
      .collect();
    let tPos = Math.max(0, ...existingTopics.map((node) => node.position)) + 1;
    let lessonCount = 0;
    for (const topic of outline.topics) {
      const topicId = await ctx.db.insert("lms_nodes", {
        courseId: args.courseId,
        kind: "topic",
        title: topic.title || "Untitled topic",
        position: tPos++,
        description: topic.summary,
        createdAt: now,
        updatedAt: now,
      });
      let lPos = 1;
      for (const lesson of topic.lessons) {
        await ctx.db.insert("lms_nodes", {
          courseId: args.courseId,
          parentId: topicId,
          kind: "lesson",
          title: lesson.title || "Untitled lesson",
          position: lPos++,
          bodyDoc: lesson.body ? textToDoc(lesson.body) : undefined,
          showMarkComplete: true,
          createdAt: now,
          updatedAt: now,
        });
        lessonCount++;
      }
    }
    const stats = outlineStats(outline);
    await ctx.db.patch(args.courseId, {
      topicCount: existingTopics.length + stats.topicCount,
      lessonCount: existingLessons.length + lessonCount,
      updatedAt: now,
    });
    await ctx.db.insert("lms_ai_generations", {
      targetType: "course",
      targetId: String(args.courseId),
      courseId: args.courseId,
      stage: "outline",
      model: "configured-ai-provider",
      prompt: args.prompt,
      briefJson: { outline },
      label: "ai_assisted",
      reviewStatus: "reviewed",
      createdAt: now,
      reviewedAt: now,
    });
    return { topicCount: stats.topicCount, lessonCount };
  },
});
