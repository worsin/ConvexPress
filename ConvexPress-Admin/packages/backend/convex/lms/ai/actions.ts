/**
 * AI Course Generation - public actions.
 *
 * Flow:
 *   1. Generate a research-backed outline and store it as unreviewed provenance.
 *   2. An editor approves the outline.
 *   3. Approval materializes topics/lessons and queues per-lesson body jobs.
 */

"use node";

import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v, ConvexError } from "convex/values";
import {
  cleanGeneratedLessonText,
  normalizeOutline,
  outlineStats,
  parseJsonObject,
} from "./helpers";

export const generateCourse = action({
  args: {
    courseId: v.id("lms_courses"),
    topic: v.string(),
    audience: v.optional(v.string()),
    topicsCount: v.optional(v.number()),
    tone: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    generationId: string;
    jobId: string;
    topicCount: number;
    lessonCount: number;
  }> => {
    await ctx.runQuery((internal as any).lms.ai.internals.assertCourseGenerationAccess, {
      courseId: args.courseId,
    });
    const topic = args.topic.trim();
    if (topic.length < 3 || topic.length > 200) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Course topic must be between 3 and 200 characters.",
      });
    }
    const audience = args.audience?.trim().slice(0, 300);
    const tone = args.tone?.trim().slice(0, 100);
    const n = Math.min(Math.max(args.topicsCount ?? 5, 1), 12);
    const jobId = await ctx.runMutation((internal as any).lms.ai.internals.createJob, {
      courseId: args.courseId,
      kind: "outline",
    });
    await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
      jobId,
      status: "running",
      progress: 10,
    });

    let research: any;
    try {
      research = await ctx.runAction((internal as any).ai.internals.researchTopic, {
        query: `${topic} course curriculum ${audience ?? ""}`.trim(),
        maxResults: 6,
      });
    } catch (error) {
      await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
        jobId,
        status: "failed",
        error: "Tavily research is required before LMS course generation.",
      });
      const message = error instanceof Error ? error.message : String(error);
      throw new ConvexError({
        code: "AI_RESEARCH_UNAVAILABLE",
        message: /Tavily|CONFIGURATION/i.test(message)
          ? "Tavily API key not configured. Set it in Settings -> AI before generating LMS courses."
          : "AI research failed. Please try again.",
      });
    }

    const systemPrompt =
      "You are an expert curriculum designer. Output ONLY valid minified JSON. No markdown fences, no commentary.";
    const userPrompt =
      `Create an approval-ready course outline as JSON for "${args.topic}".` +
      (audience ? ` Audience: ${audience}.` : "") +
      ` Tone: ${tone ?? "professional"}.` +
      ` Produce exactly ${n} topics. Each topic has 2-4 lessons.` +
      ` Each lesson has "title", "brief", and "outcomes" (array of 2-4 strings).` +
      ` Do not write full lesson bodies yet.` +
      ` Use these research notes and sources:\n${research.aggregatedContent}\n` +
      ` JSON shape: {"topics":[{"title":"...","summary":"...","lessons":[{"title":"...","brief":"...","outcomes":["..."]}]}]}`;

    let raw: string;
    try {
      raw = await ctx.runAction(
        (internal as any).ai.internals.generateWithClaude,
        { systemPrompt, userPrompt, maxTokens: 8000, task: "pageGeneration" },
      );
    } catch (error) {
      await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
        jobId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : String(error);
      throw new ConvexError({
        code: "AI_UNAVAILABLE",
        message: /API key|CONFIGURATION/i.test(message)
          ? "AI provider key not configured. Set it in Settings -> AI Providers."
          : "AI generation failed. Please try again.",
      });
    }

    let outline;
    try {
      outline = normalizeOutline(parseJsonObject(raw));
    } catch (firstParseError) {
      await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
        jobId,
        status: "running",
        progress: 70,
        error: "Retrying outline JSON cleanup.",
      });
      try {
        const repairSystemPrompt =
          "You repair malformed JSON. Output ONLY valid minified JSON matching the requested schema.";
        const repairPrompt =
          `Repair this LMS course outline into valid JSON with shape ` +
          `{"topics":[{"title":"...","summary":"...","lessons":[{"title":"...","brief":"...","outcomes":["..."]}]}]}. ` +
          `Preserve useful lesson titles, briefs, outcomes, and topic ordering. Malformed content:\n${raw.slice(0, 20000)}`;
        raw = await ctx.runAction(
          (internal as any).ai.internals.generateWithClaude,
          {
            systemPrompt: repairSystemPrompt,
            userPrompt: repairPrompt,
            maxTokens: 8000,
            task: "pageGeneration",
          },
        );
        outline = normalizeOutline(parseJsonObject(raw));
      } catch (repairError) {
        await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
          jobId,
          status: "failed",
          progress: 0,
          error:
            repairError instanceof Error
              ? repairError.message
              : firstParseError instanceof Error
                ? firstParseError.message
                : "AI returned content that was not valid LMS outline JSON.",
        });
        throw new ConvexError({
          code: "PARSE_ERROR",
          message: "AI returned content that was not valid LMS outline JSON. Try again.",
        });
      }
    }

    const stats = outlineStats(outline);
    const generationId = await ctx.runMutation(
      (internal as any).lms.ai.internals.recordOutlineGeneration,
      {
        courseId: args.courseId,
        prompt: userPrompt,
        briefJson: {
          topic: args.topic,
          audience,
          tone,
          topicsCount: n,
          outline,
        },
        sourcesJson: research,
        topicCount: stats.topicCount,
        lessonCount: stats.lessonCount,
      },
    );
    await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
      jobId,
      status: "done",
      progress: 100,
    });

    return { generationId: String(generationId), jobId: String(jobId), ...stats };
  },
});

export const regenerateLesson = action({
  args: { nodeId: v.id("lms_nodes"), instructions: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: boolean; generationId: string }> => {
    const lesson = await ctx.runQuery(
      (internal as any).lms.ai.internals.assertNodeGenerationAccess,
      { nodeId: args.nodeId },
    );
    const title: string = lesson.title;
    const instructions = args.instructions?.trim().slice(0, 1000);
    const systemPrompt =
      "You are an expert instructor. Write clear teaching content as plain-text paragraphs. No markdown headings, no JSON.";
    const userPrompt =
      `Write the lesson body for a lesson titled "${title}". 3-5 short paragraphs of teaching content.` +
      (instructions ? ` Additional guidance: ${instructions}.` : "");
    const generationId = await ctx.runMutation(
      (internal as any).lms.ai.internals.recordLessonRegeneration,
      {
        courseId: lesson.courseId,
        nodeId: args.nodeId,
        prompt: userPrompt,
        instructions,
      },
    );
    const jobId = await ctx.runMutation((internal as any).lms.ai.internals.createJob, {
      courseId: lesson.courseId,
      generationId,
      kind: "lesson_body",
      targetId: String(args.nodeId),
    });
    await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
      jobId,
      status: "running",
      progress: 25,
    });
    let raw: string;
    try {
      raw = await ctx.runAction((internal as any).ai.internals.generateWithClaude, {
        systemPrompt,
        userPrompt,
        maxTokens: 4000,
        task: "default",
      });
    } catch (error) {
      await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
        jobId,
        status: "failed",
        progress: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : String(error);
      throw new ConvexError({
        code: "AI_UNAVAILABLE",
        message: /API key|CONFIGURATION/i.test(message)
          ? "AI provider key not configured. Set it in Settings -> AI Providers."
          : "AI generation failed. Please try again.",
      });
    }
    let bodyText: string;
    try {
      bodyText = cleanGeneratedLessonText(raw);
    } catch (error) {
      await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
        jobId,
        status: "failed",
        progress: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    await ctx.runMutation((internal as any).lms.ai.internals.storeLessonBodyDraft, {
      jobId,
      generationId,
      nodeId: args.nodeId,
      bodyText,
      prompt: userPrompt,
    });
    return { ok: true, generationId: String(generationId) };
  },
});
