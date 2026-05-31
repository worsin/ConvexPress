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
import { internal } from "../../_generated/api";
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

    const raw: string = await ctx.runAction(
      (internal as any).ai.internals.generateWithClaude,
      { systemPrompt, userPrompt, maxTokens: 8000, task: "pageGeneration" },
    );

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
