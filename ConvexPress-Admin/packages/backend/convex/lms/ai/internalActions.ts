"use node";

/**
 * AI Course Generation - background actions.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { cleanGeneratedLessonText } from "./helpers";

export const generateLessonBodies = internalAction({
  args: { generationId: v.id("lms_ai_generations") },
  handler: async (ctx, args) => {
    const work = await ctx.runQuery(
      (internal as any).lms.ai.internals.getLessonBodyWork,
      { generationId: args.generationId },
    );
    if (!work) {
      throw new ConvexError({ code: "NOT_FOUND", message: "AI generation not found" });
    }
    const sourcesText = Array.isArray(work.generation.sourcesJson?.sources)
      ? work.generation.sourcesJson.sources
          .map((source: any) => `${source.title}: ${source.url}\n${source.content}`)
          .join("\n\n")
      : "";
    const outlineLessons = work.outline.topics.flatMap((topic: any) =>
      topic.lessons.map((lesson: any) => ({ topic, lesson })),
    );

    for (let index = 0; index < work.lessonJobs.length; index++) {
      const { job, node } = work.lessonJobs[index];
      if (job.status === "done") continue;
      await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
        jobId: job._id,
        status: "running",
        progress: Math.round((index / Math.max(work.lessonJobs.length, 1)) * 100),
      });
      const outlineLesson =
        outlineLessons.find((item: any) => item.lesson.title === node.title) ??
        outlineLessons[index];
      const systemPrompt =
        "You are an expert instructor. Write lesson content as clear plain-text paragraphs. No markdown fences and no JSON.";
      const userPrompt =
        `Course lesson: ${node.title}\n` +
        `Topic: ${outlineLesson?.topic?.title ?? "Untitled topic"}\n` +
        `Lesson brief: ${outlineLesson?.lesson?.brief ?? ""}\n` +
        `Learning outcomes: ${(outlineLesson?.lesson?.outcomes ?? []).join(", ")}\n\n` +
        (sourcesText ? `Research sources:\n${sourcesText}\n\n` : "") +
        "Write 4-6 short paragraphs with practical examples and a concrete takeaway.";

      try {
        let bodyText: string | null = null;
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            bodyText = cleanGeneratedLessonText(
              await ctx.runAction((internal as any).ai.internals.generateWithClaude, {
                systemPrompt,
                userPrompt,
                maxTokens: 5000,
                task: "pageGeneration",
              }),
            );
            break;
          } catch (error) {
            lastError = error;
            await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
              jobId: job._id,
              status: "running",
              progress: Math.min(95, Math.round(((index + 0.5) / Math.max(work.lessonJobs.length, 1)) * 100)),
              error: `Retrying lesson generation (${attempt}/2)`,
            });
          }
        }
        if (!bodyText) throw lastError ?? new Error("Lesson generation returned empty content.");
        await ctx.runMutation((internal as any).lms.ai.internals.writeLessonBody, {
          jobId: job._id,
          generationId: args.generationId,
          nodeId: node._id,
          bodyText,
          prompt: userPrompt,
          sourcesJson: work.generation.sourcesJson,
        });
      } catch (error) {
        await ctx.runMutation((internal as any).lms.ai.internals.updateJob, {
          jobId: job._id,
          status: "failed",
          progress: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { ok: true };
  },
});
