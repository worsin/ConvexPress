/**
 * AI Course Generation - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { normalizeOutline, outlineStats } from "./helpers";
import { docToText } from "../lessons/helpers";
import { requireCourseAuthorOrEditor, requireNodeCourseAuthorOrEditor } from "../access";

export const listCourseGenerations = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.ai.generate");
    const rows = await ctx.db
      .query("lms_ai_generations")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    const jobs = await ctx.db
      .query("lms_jobs")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    return rows
      .filter((row) => row.stage === "outline")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => {
        let stats = { topicCount: 0, lessonCount: 0 };
        try {
          stats = outlineStats(normalizeOutline((row.briefJson as any)?.outline));
        } catch {
          stats = { topicCount: 0, lessonCount: 0 };
        }
        const relatedJobs = jobs.filter((job) => job.generationId === row._id);
        return {
          ...row,
          topicCount: stats.topicCount,
          lessonCount: stats.lessonCount,
          jobCounts: {
            queued: relatedJobs.filter((job) => job.status === "queued").length,
            running: relatedJobs.filter((job) => job.status === "running").length,
            done: relatedJobs.filter((job) => job.status === "done").length,
            failed: relatedJobs.filter((job) => job.status === "failed").length,
          },
        };
      });
  },
});

export const listNodeGenerations = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    const { node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.ai.generate");
    if (node.kind !== "lesson") return [];
    const rows = await ctx.db
      .query("lms_ai_generations")
      .withIndex("by_target", (q) => q.eq("targetType", "node").eq("targetId", String(args.nodeId)))
      .collect();
    return rows
      .filter((row) => row.stage === "lesson_body")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        ...row,
        generatedBodyText: String((row.briefJson as any)?.generatedBody ?? ""),
        currentBodyText: docToText(node.bodyDoc),
      }));
  },
});
