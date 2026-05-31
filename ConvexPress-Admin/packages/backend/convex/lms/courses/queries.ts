/**
 * Course System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { lmsCourseStatusValidator } from "../../schema/lms";

export const list = query({
  args: {
    status: v.optional(lmsCourseStatusValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];

    let courses;
    if (args.status) {
      courses = await ctx.db
        .query("lms_courses")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(500);
    } else {
      courses = await ctx.db.query("lms_courses").order("desc").take(500);
    }

    const search = args.search?.trim().toLowerCase();
    if (search) {
      courses = courses.filter((c) => c.title.toLowerCase().includes(search));
    }
    return courses;
  },
});

export const getById = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    return await ctx.db.get(args.courseId);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    return await ctx.db
      .query("lms_courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    return await ctx.db
      .query("lms_courses")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .take(500);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { total: 0, published: 0, draft: 0, archived: 0 };
    }
    const all = await ctx.db.query("lms_courses").take(2000);
    return {
      total: all.length,
      published: all.filter((c) => c.status === "published").length,
      draft: all.filter((c) => c.status === "draft").length,
      archived: all.filter((c) => c.status === "archived").length,
    };
  },
});
