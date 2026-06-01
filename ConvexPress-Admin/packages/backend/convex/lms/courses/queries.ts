/**
 * Course System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { currentUserCan } from "../../helpers/permissions";
import { lmsCourseStatusValidator } from "../../schema/lms";
import { canUserAccessCourse, requireCourseAuthorOrEditor } from "../access";
import { docToText } from "../lessons/helpers";

function publicCoursePayload(course: any) {
  return {
    _id: course._id,
    title: course.title,
    slug: course.slug,
    status: course.status,
    descriptionDoc: course.descriptionDoc,
    excerpt: course.excerpt,
    featuredImageId: course.featuredImageId,
    promoVideoUrl: course.promoVideoUrl,
    accessMode: course.accessMode ?? "members",
    price: course.price,
    recurringPrice: course.recurringPrice,
    billingInterval: course.billingInterval,
    billingUnit: course.billingUnit,
    trialPrice: course.trialPrice,
    trialDays: course.trialDays,
    externalButtonUrl: course.externalButtonUrl,
    progressionMode: course.progressionMode ?? "linear",
    contentVisibility: course.contentVisibility ?? "enrollees_only",
    startDate: course.startDate,
    endDate: course.endDate,
    lessonCount: course.lessonCount ?? 0,
    topicCount: course.topicCount ?? 0,
    certificateId: course.certificateId,
    publishedAt: course.publishedAt,
  };
}

export const list = query({
  args: {
    status: v.optional(lmsCourseStatusValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    if (!(await currentUserCan(ctx, "lms.course.view"))) return [];

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
    const course = await ctx.db.get(args.courseId);
    if (!course) return null;
    if (await currentUserCan(ctx, "lms.course.view")) return course;
    if (course.status === "published") return publicCoursePayload(course);
    return null;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const course = await ctx.db
      .query("lms_courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!course) return null;
    if (course.status !== "published" && !(await currentUserCan(ctx, "lms.course.view"))) {
      return null;
    }
    return publicCoursePayload(course);
  },
});

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    const rows = await ctx.db
      .query("lms_courses")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .take(500);
    return rows.map(publicCoursePayload);
  },
});

export const listCatalog = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    tag: v.optional(v.string()),
    accessMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    let courses = await ctx.db
      .query("lms_courses")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .take(500);
    const search = args.search?.trim().toLowerCase();
    if (search) {
      courses = courses.filter((course) =>
        [
          course.title,
          course.excerpt,
          docToText(course.descriptionDoc),
          ...(course.categoryIds ?? []),
          ...(course.tagIds ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search),
      );
    }
    if (args.category) {
      const category = args.category.trim().toLowerCase();
      courses = courses.filter((course) =>
        (course.categoryIds ?? []).some((entry) => entry.toLowerCase() === category),
      );
    }
    if (args.tag) {
      const tag = args.tag.trim().toLowerCase();
      courses = courses.filter((course) =>
        (course.tagIds ?? []).some((entry) => entry.toLowerCase() === tag),
      );
    }
    if (args.accessMode) {
      const accessMode = args.accessMode.trim().toLowerCase();
      courses = courses.filter((course) => (course.accessMode ?? "members") === accessMode);
    }
    const rows = [];
    for (const course of courses) {
      const access = await canUserAccessCourse(ctx, { courseId: course._id });
      rows.push({
        _id: course._id,
        title: course.title,
        slug: course.slug,
        excerpt: course.excerpt,
        featuredImageId: course.featuredImageId,
        accessMode: course.accessMode ?? "members",
        categoryIds: course.categoryIds ?? [],
        tagIds: course.tagIds ?? [],
        lessonCount: course.lessonCount ?? 0,
        topicCount: course.topicCount ?? 0,
        allowed: access.allowed,
        accessReason: access.reason,
        requiresLogin: access.requiresLogin,
      });
    }
    return rows;
  },
});

export const getCatalogFilters = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { categories: [], tags: [], accessModes: [] };
    }
    const courses = await ctx.db
      .query("lms_courses")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .take(500);

    function counts(values: unknown[]) {
      const map = new Map<string, number>();
      for (const value of values) {
        if (typeof value !== "string") continue;
        const normalized = value.trim().toLowerCase();
        if (!normalized) continue;
        map.set(normalized, (map.get(normalized) ?? 0) + 1);
      }
      return Array.from(map.entries())
        .map(([slug, count]) => ({ slug, label: humanize(slug), count }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    return {
      categories: counts(
        courses.flatMap((course) =>
          Array.isArray(course.categoryIds) ? course.categoryIds : [],
        ),
      ),
      tags: counts(
        courses.flatMap((course) =>
          Array.isArray(course.tagIds) ? course.tagIds : [],
        ),
      ),
      accessModes: counts(
        courses.map((course) =>
          typeof course.accessMode === "string" ? course.accessMode : "members",
        ),
      ),
    };
  },
});

function humanize(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const stats = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { total: 0, published: 0, draft: 0, archived: 0 };
    }
    if (!(await currentUserCan(ctx, "lms.course.view"))) {
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

export const getPrerequisites = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    if (!(await currentUserCan(ctx, "lms.course.view"))) return [];
    const rows = await ctx.db
      .query("lms_course_prerequisites")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    const enriched = [];
    for (const row of rows) {
      const course = await ctx.db.get(row.prereqCourseId);
      if (course) {
        enriched.push({
          _id: row._id,
          courseId: row.prereqCourseId,
          title: course.title,
          slug: course.slug,
          status: course.status,
        });
      }
    }
    return enriched;
  },
});

export const getAccessRule = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");
    const rules = await ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q: any) =>
        q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
      )
      .collect();
    const rule = rules[0];
    if (!rule) return null;
    const plans = [];
    for (const planId of rule.planIds ?? []) {
      const plan = await ctx.db.get(planId);
      if (plan) plans.push({ _id: plan._id, title: plan.title, slug: plan.slug });
    }
    return { ...rule, plans };
  },
});
