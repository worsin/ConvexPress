/**
 * Course System - mutations.
 *
 * Authorization (role-level based; dedicated lms.* capabilities are a
 * follow-up once registered in the capability registry):
 *   - create / update:        Author (60+)
 *   - publish / archive / remove: Editor (80+)
 */

import { ConvexError } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { generateUniqueCourseSlug } from "./helpers";
import {
  createCourseArgs,
  updateCourseArgs,
  courseIdArg,
  MAX_LMS_TITLE_LENGTH,
} from "./validators";

export const create = mutation({
  args: createCourseArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireMinimumRoleLevel(ctx, 60);

    const title = (args.title ?? "").trim();
    if (!title) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Title is required" });
    }
    if (title.length > MAX_LMS_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${MAX_LMS_TITLE_LENGTH} characters or fewer`,
      });
    }

    const now = Date.now();
    const slug = await generateUniqueCourseSlug(ctx, title);
    const courseId = await ctx.db.insert("lms_courses", {
      title,
      slug,
      status: "draft",
      progressionMode: "linear",
      contentVisibility: "enrollees_only",
      accessMode: "members",
      topicCount: 0,
      lessonCount: 0,
      authorId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return courseId;
  },
});

export const update = mutation({
  args: updateCourseArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 60);

    const { courseId, ...rest } = args;
    const course = await ctx.db.get(courseId);
    if (!course) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) patch[key] = value;
    }
    if (typeof rest.slug === "string" && rest.slug.length > 0) {
      patch.slug = await generateUniqueCourseSlug(ctx, rest.slug, courseId);
    } else if (typeof rest.title === "string" && rest.title.trim().length > 0 && !course.slug) {
      patch.slug = await generateUniqueCourseSlug(ctx, rest.title, courseId);
    }

    await ctx.db.patch(courseId, patch as never);
    return courseId;
  },
});

export const publish = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    await ctx.db.patch(args.courseId, {
      status: "published",
      publishedAt: course.publishedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    return args.courseId;
  },
});

export const unpublish = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    await ctx.db.patch(args.courseId, { status: "draft", updatedAt: Date.now() });
    return args.courseId;
  },
});

export const archive = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    await ctx.db.patch(args.courseId, { status: "archived", updatedAt: Date.now() });
    return args.courseId;
  },
});

export const restore = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    await ctx.db.patch(args.courseId, { status: "draft", updatedAt: Date.now() });
    return args.courseId;
  },
});

export const remove = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);

    // Cascade: delete the course's curriculum nodes + prerequisite rows.
    const nodes = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const node of nodes) await ctx.db.delete(node._id);

    const prereqs = await ctx.db
      .query("lms_course_prerequisites")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const p of prereqs) await ctx.db.delete(p._id);

    await ctx.db.delete(args.courseId);
    return { deleted: true };
  },
});
