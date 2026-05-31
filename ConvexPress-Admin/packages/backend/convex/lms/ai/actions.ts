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
import { internal, api } from "../../_generated/api";
import { v, ConvexError } from "convex/values";
import { normalizeOutline, outlineStats, parseJsonObject } from "./helpers";

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
        query: `${args.topic} course curriculum ${args.audience ?? ""}`.trim(),
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
      (args.audience ? ` Audience: ${args.audience}.` : "") +
      ` Tone: ${args.tone ?? "professional"}.` +
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
    } catch {
      await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
        jobId,
        status: "failed",
        error: "AI returned content that was not valid LMS outline JSON.",
      });
      throw new ConvexError({
        code: "PARSE_ERROR",
        message: "AI returned content that was not valid LMS outline JSON. Try again.",
      });
    }

    const stats = outlineStats(outline);
    const generationId = await ctx.runMutation(
      (internal as any).lms.ai.internals.recordOutlineGeneration,
      {
        courseId: args.courseId,
        prompt: userPrompt,
        briefJson: {
          topic: args.topic,
          audience: args.audience,
          tone: args.tone,
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
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const lesson: any = await ctx.runQuery(
      (api as any).lms.lessons.queries.getLesson,
      { nodeId: args.nodeId },
    );
    if (!lesson?.node) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Lesson not found" });
    }
    const title: string = lesson.node.title;
    const systemPrompt =
      "You are an expert instructor. Write clear teaching content as plain-text paragraphs. No markdown headings, no JSON.";
    const userPrompt =
      `Write the lesson body for a lesson titled "${title}". 3-5 short paragraphs of teaching content.` +
      (args.instructions ? ` Additional guidance: ${args.instructions}.` : "");
    let raw: string;
    try {
      raw = await ctx.runAction((internal as any).ai.internals.generateWithClaude, {
        systemPrompt,
        userPrompt,
        maxTokens: 4000,
        task: "default",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ConvexError({
        code: "AI_UNAVAILABLE",
        message: /API key|CONFIGURATION/i.test(message)
          ? "AI provider key not configured. Set it in Settings -> AI Providers."
          : "AI generation failed. Please try again.",
      });
    }
    await ctx.runMutation((api as any).lms.lessons.mutations.updateLessonContent, {
      nodeId: args.nodeId,
      bodyText: String(raw).trim(),
    });
    return { ok: true };
  },
});
