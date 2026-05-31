/**
 * AI Course Generation - action.
 *
 * Reuses the platform's `ai.internals.generateWithClaude` (provider/key
 * resolution + Settings > AI Providers), asks for a JSON outline with lesson
 * bodies, and materializes the Course → Topic → Lesson tree in one shot.
 *
 *   Requires an AI provider key (Settings > AI Providers / env) at runtime.
 */

"use node";

import { action } from "../../_generated/server";
import { internal, api } from "../../_generated/api";
import { v, ConvexError } from "convex/values";

// @ts-ignore: Convex generated API types exceed TS instantiation depth.
export const generateCourse = action({
  args: {
    courseId: v.id("lms_courses"),
    topic: v.string(),
    audience: v.optional(v.string()),
    topicsCount: v.optional(v.number()),
    tone: v.optional(v.string()),
  },
  // @ts-ignore: Convex generated API types exceed TS instantiation depth.
  handler: async (
    ctx,
    args,
  ): Promise<{ topicCount: number; lessonCount: number }> => {
    const n = Math.min(Math.max(args.topicsCount ?? 5, 1), 12);
    const systemPrompt =
      "You are an expert curriculum designer. Output ONLY valid minified JSON. No markdown fences, no commentary.";
    const userPrompt =
      `Create a course outline as JSON for the subject "${args.topic}".` +
      (args.audience ? ` Audience: ${args.audience}.` : "") +
      ` Tone: ${args.tone ?? "professional"}.` +
      ` Produce exactly ${n} topics. Each topic has 2-4 lessons.` +
      ` Each lesson has a "title" and a "body" of 2-3 short teaching paragraphs.` +
      ` JSON shape: {"topics":[{"title":"...","lessons":[{"title":"...","body":"..."}]}]}`;

    let raw: string;
    try {
      raw = await ctx.runAction(
        (internal as any).ai.internals.generateWithClaude,
        { systemPrompt, userPrompt, maxTokens: 8000, task: "pageGeneration" },
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      throw new ConvexError({
        code: "AI_UNAVAILABLE",
        message: /API key|CONFIGURATION/i.test(m)
          ? "AI provider key not configured. Set it in Settings → AI Providers."
          : "AI generation failed. Please try again.",
      });
    }

    let outline: unknown;
    try {
      const cleaned = String(raw)
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      outline = JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
    } catch {
      throw new ConvexError({
        code: "PARSE_ERROR",
        message: "AI returned content that wasn't valid JSON. Try again.",
      });
    }

    return await ctx.runMutation(
      (internal as any).lms.ai.internals.materializeOutline,
      { courseId: args.courseId, outline, prompt: userPrompt },
    );
  },
});
// @ts-ignore: Convex generated API types exceed TS instantiation depth.
export const regenerateLesson = action({
  args: { nodeId: v.id("lms_nodes"), instructions: v.optional(v.string()) },
  // @ts-ignore: Convex generated API types exceed TS instantiation depth.
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
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      throw new ConvexError({
        code: "AI_UNAVAILABLE",
        message: /API key|CONFIGURATION/i.test(m)
          ? "AI provider key not configured. Set it in Settings → AI Providers."
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
