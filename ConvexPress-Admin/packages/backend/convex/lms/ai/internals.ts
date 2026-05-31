/**
 * AI Course Generation - internal materialization mutation.
 */

import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { requireMinimumRoleLevel } from "../../helpers/permissions";
import { textToDoc } from "../lessons/helpers";

// @ts-ignore: Convex generated API types exceed TS instantiation depth.
export const materializeOutline = internalMutation({
  args: { courseId: v.id("lms_courses"), outline: v.any(), prompt: v.string() },
  // @ts-ignore: Convex generated API types exceed TS instantiation depth.
  handler: async (
    ctx,
    args,
  ): Promise<{ topicCount: number; lessonCount: number }> => {
    await requireMinimumRoleLevel(ctx, 60);
    const db = ctx.db as any;
    const o = args.outline as {
      topics?: Array<{ title?: string; lessons?: Array<{ title?: string; body?: string }> }>;
    };
    const topics = Array.isArray(o?.topics) ? o.topics : [];
    const now = Date.now();
    let topicCount = 0;
    let lessonCount = 0;
    let tPos = 1;
    for (const t of topics) {
      const topicId = await db.insert("lms_nodes", {
        courseId: args.courseId,
        kind: "topic",
        title: (t.title ?? "Untitled topic").slice(0, 200),
        position: tPos++,
        createdAt: now,
        updatedAt: now,
      });
      topicCount++;
      let lPos = 1;
      for (const l of t.lessons ?? []) {
        await db.insert("lms_nodes", {
          courseId: args.courseId,
          parentId: topicId,
          kind: "lesson",
          title: (l.title ?? "Untitled lesson").slice(0, 200),
          position: lPos++,
          bodyDoc: l.body ? textToDoc(l.body) : undefined,
          showMarkComplete: true,
          createdAt: now,
          updatedAt: now,
        });
        lessonCount++;
      }
    }
    await db.patch(args.courseId, { topicCount, lessonCount, updatedAt: now });
    await db.insert("lms_ai_generations", {
      targetType: "course",
      targetId: String(args.courseId),
      courseId: args.courseId,
      stage: "outline",
      model: "claude",
      prompt: args.prompt,
      label: "ai_assisted",
      reviewStatus: "unreviewed",
      createdAt: now,
    });
    return { topicCount, lessonCount };
  },
});
