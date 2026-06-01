/**
 * Course System - mutations.
 *
 * Authorization:
 *   - create / update:        Author (60+)
 *   - update existing content: course author or Editor (80+)
 *   - publish / archive / remove: Editor (80+)
 */

import { ConvexError } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { requireCourseAuthorOrEditor } from "../access";
import {
  deleteCourseSearchIndex,
  generateUniqueCourseSlug,
  normalizeCourseLabels,
  upsertCourseSearchIndex,
} from "./helpers";
import {
  createCourseArgs,
  updateCourseArgs,
  courseIdArg,
  MAX_LMS_TITLE_LENGTH,
  updatePrerequisitesArgs,
  updateAccessRuleArgs,
} from "./validators";

const COURSE_URL_FIELDS = new Set([
  "promoVideoUrl",
  "externalButtonUrl",
  "completionRedirectUrl",
]);

const NON_NEGATIVE_NUMBER_FIELDS = new Set(["price", "recurringPrice", "trialPrice"]);
const NON_NEGATIVE_INT_FIELDS = new Set([
  "trialDays",
  "pointsAwarded",
  "pointsRequired",
  "accessDurationDays",
  "seatLimit",
]);

export const create = mutation({
  args: createCourseArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireCan(ctx, "lms.course.create");

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
    await emitEvent(ctx, LMS_EVENTS.COURSE_CREATED, SYSTEM.LMS, { courseId, title });
    await upsertCourseSearchIndex(ctx, courseId);
    return courseId;
  },
});

export const update = mutation({
  args: updateCourseArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");

    const { courseId, ...rest } = args;
    const { course } = await requireCourseAuthorOrEditor(ctx, courseId, "lms.course.edit");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue;
      if (key === "title" || key === "slug") continue;
      if (COURSE_URL_FIELDS.has(key)) {
        patch[key] = normalizeCourseUrl(value);
      } else if (NON_NEGATIVE_NUMBER_FIELDS.has(key)) {
        patch[key] = normalizeNonNegativeNumber(value);
      } else if (NON_NEGATIVE_INT_FIELDS.has(key)) {
        patch[key] = normalizeNonNegativeInt(value);
      } else if (key === "billingInterval") {
        patch[key] = normalizePositiveInt(value);
      } else {
        patch[key] = value;
      }
    }
    if (typeof rest.title === "string") {
      const title = rest.title.trim();
      if (!title) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Title is required" });
      }
      if (title.length > MAX_LMS_TITLE_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Title must be ${MAX_LMS_TITLE_LENGTH} characters or fewer`,
        });
      }
      patch.title = title;
    }
    if (typeof rest.slug === "string") {
      const requestedSlug = rest.slug.trim();
      const fallbackTitle =
        typeof patch.title === "string" && patch.title.trim() ? patch.title : course.title;
      patch.slug = await generateUniqueCourseSlug(
        ctx,
        requestedSlug || fallbackTitle,
        courseId,
      );
    } else if (typeof rest.title === "string" && rest.title.trim().length > 0 && !course.slug) {
      patch.slug = await generateUniqueCourseSlug(ctx, rest.title, courseId);
    }
    if (rest.categoryIds !== undefined) {
      patch.categoryIds = normalizeCourseLabels(rest.categoryIds);
    }
    if (rest.tagIds !== undefined) {
      patch.tagIds = normalizeCourseLabels(rest.tagIds);
    }

    await ctx.db.patch(courseId, patch as never);
    await upsertCourseSearchIndex(ctx, courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_UPDATED, SYSTEM.LMS, { courseId });
    return courseId;
  },
});

export const publish = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCan(ctx, "lms.course.publish");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    await ctx.db.patch(args.courseId, {
      status: "published",
      publishedAt: course.publishedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    await upsertCourseSearchIndex(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_PUBLISHED, SYSTEM.LMS, { courseId: args.courseId });
    return args.courseId;
  },
});

export const unpublish = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCan(ctx, "lms.course.publish");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    await ctx.db.patch(args.courseId, { status: "draft", updatedAt: Date.now() });
    await upsertCourseSearchIndex(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_UNPUBLISHED, SYSTEM.LMS, { courseId: args.courseId });
    return args.courseId;
  },
});

export const archive = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");
    await ctx.db.patch(args.courseId, { status: "archived", updatedAt: Date.now() });
    await deleteCourseSearchIndex(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_ARCHIVED, SYSTEM.LMS, { courseId: args.courseId });
    return args.courseId;
  },
});

export const restore = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");
    await ctx.db.patch(args.courseId, { status: "draft", updatedAt: Date.now() });
    await upsertCourseSearchIndex(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_RESTORED, SYSTEM.LMS, { courseId: args.courseId });
    return args.courseId;
  },
});

export const remove = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCan(ctx, "lms.course.delete");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });

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

    const inversePrereqs = await ctx.db
      .query("lms_course_prerequisites")
      .withIndex("by_prereq", (q) => q.eq("prereqCourseId", args.courseId))
      .collect();
    for (const p of inversePrereqs) await ctx.db.delete(p._id);

    for (const table of [
      "lms_enrollments",
      "lms_progress",
      "lms_course_completions",
      "lms_certificate_issues",
      "lms_ai_generations",
      "lms_jobs",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_course", (q: any) => q.eq("courseId", args.courseId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    const accessRules = await ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q: any) =>
        q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
      )
      .collect();
    for (const rule of accessRules) await ctx.db.delete(rule._id);

    await deleteCourseSearchIndex(ctx, args.courseId);
    await ctx.db.delete(args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_DELETED, SYSTEM.LMS, { courseId: args.courseId });
    return { deleted: true };
  },
});

function normalizeCourseUrl(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return undefined;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeNonNegativeInt(value: unknown): number {
  return Math.floor(normalizeNonNegativeNumber(value));
}

function normalizePositiveInt(value: unknown): number {
  return Math.max(1, normalizeNonNegativeInt(value));
}

export const duplicate = mutation({
  args: courseIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { user } = await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.create");
    const db = ctx.db as any;
    const src = await db.get(args.courseId);
    if (!src) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });

    const now = Date.now();
    const slug = await generateUniqueCourseSlug(ctx, `${src.title} (Copy)`);
    const newId = await db.insert("lms_courses", {
      title: `${src.title} (Copy)`,
      slug,
      descriptionDoc: src.descriptionDoc,
      excerpt: src.excerpt,
      status: "draft",
      featuredImageId: src.featuredImageId,
      promoVideoUrl: src.promoVideoUrl,
      categoryIds: src.categoryIds,
      tagIds: src.tagIds,
      accessMode: src.accessMode,
      price: src.price,
      recurringPrice: src.recurringPrice,
      billingInterval: src.billingInterval,
      billingUnit: src.billingUnit,
      trialPrice: src.trialPrice,
      trialDays: src.trialDays,
      externalButtonUrl: src.externalButtonUrl,
      progressionMode: src.progressionMode,
      contentVisibility: src.contentVisibility,
      pointsAwarded: src.pointsAwarded,
      pointsRequired: src.pointsRequired,
      prereqMode: src.prereqMode,
      accessDurationDays: src.accessDurationDays,
      startDate: src.startDate,
      endDate: src.endDate,
      seatLimit: src.seatLimit,
      certificateId: src.certificateId,
      completionRedirectUrl: src.completionRedirectUrl,
      materialsDoc: src.materialsDoc,
      topicCount: src.topicCount,
      lessonCount: src.lessonCount,
      authorId: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Clone the curriculum tree (topics first, then children remapped).
    const nodes = await db
      .query("lms_nodes")
      .withIndex("by_course", (q: any) => q.eq("courseId", args.courseId))
      .collect();
    const idMap = new Map<string, string>();
    for (const t of nodes.filter((n: any) => n.kind === "topic")) {
      const nt = await db.insert("lms_nodes", {
        courseId: newId,
        kind: "topic",
        title: t.title,
        position: t.position,
        description: t.description,
        topicDripMode: t.topicDripMode,
        topicDripOffsetDays: t.topicDripOffsetDays,
        topicDripDate: t.topicDripDate,
        createdAt: now,
        updatedAt: now,
      });
      idMap.set(String(t._id), String(nt));
    }
    for (const n of nodes.filter((x: any) => x.kind !== "topic")) {
      await db.insert("lms_nodes", {
        courseId: newId,
        parentId: n.parentId ? idMap.get(String(n.parentId)) : undefined,
        kind: n.kind,
        title: n.title,
        position: n.position,
        bodyDoc: n.bodyDoc,
        materialsDoc: n.materialsDoc,
        videoUrl: n.videoUrl,
        videoProvider: n.videoProvider,
        videoMediaId: n.videoMediaId,
        requireVideoWatch: n.requireVideoWatch,
        autoComplete: n.autoComplete,
        completionDelaySec: n.completionDelaySec,
        minTimeSeconds: n.minTimeSeconds,
        isPreview: n.isPreview,
        showMarkComplete: n.showMarkComplete,
        lessonDripMode: n.lessonDripMode,
        lessonDripOffsetDays: n.lessonDripOffsetDays,
        lessonDripDate: n.lessonDripDate,
        audioMediaId: n.audioMediaId,
        captionsMediaId: n.captionsMediaId,
        transcriptText: n.transcriptText,
        aiVideoMediaId: n.aiVideoMediaId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await emitEvent(ctx, LMS_EVENTS.COURSE_DUPLICATED, SYSTEM.LMS, {
      sourceCourseId: args.courseId,
      courseId: newId,
    });
    await upsertCourseSearchIndex(ctx, newId);
    return newId;
  },
});

export const updatePrerequisites = mutation({
  args: updatePrerequisitesArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { course } = await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");
    const unique = Array.from(new Set(args.prereqCourseIds.map(String)));
    if (unique.includes(String(args.courseId))) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "A course cannot be its own prerequisite.",
      });
    }

    for (const id of unique) {
      const prereq = await ctx.db.get(id as any);
      if (!prereq) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Prerequisite course not found" });
      }
    }

    const existing = await ctx.db
      .query("lms_course_prerequisites")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    const now = Date.now();
    for (const id of unique) {
      await ctx.db.insert("lms_course_prerequisites", {
        courseId: args.courseId,
        prereqCourseId: id as any,
        createdAt: now,
      });
    }
    await ctx.db.patch(args.courseId, {
      prereqMode: args.prereqMode ?? course.prereqMode ?? "all",
      updatedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.COURSE_PREREQUISITES_UPDATED, SYSTEM.LMS, {
      courseId: args.courseId,
      count: unique.length,
    });
    return { ok: true };
  },
});

export const updateAccessRule = mutation({
  args: updateAccessRuleArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");

    for (const planId of args.planIds) {
      const plan = await ctx.db.get(planId);
      if (!plan) throw new ConvexError({ code: "NOT_FOUND", message: "Plan not found" });
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q: any) =>
        q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
      )
      .first();

    if (args.planIds.length === 0) {
      if (existing) await ctx.db.delete(existing._id);
      await ctx.db.patch(args.courseId, { updatedAt: now });
      return { ruleId: null, deleted: !!existing };
    }

    const payload = {
      resourceType: "course" as const,
      resourceIdOrKey: String(args.courseId),
      ruleMode: args.ruleMode ?? "allow_only",
      planIds: args.planIds,
      requiredCapabilities: [],
      teaserMode: "custom_message" as const,
      customMessage: args.customMessage ?? "This course is available to members.",
      loginRequired: args.loginRequired ?? true,
      updatedAt: now,
    };
    const ruleId = existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("membership_restriction_rules", {
          ...payload,
          createdAt: now,
        });

    await ctx.db.patch(args.courseId, { accessMode: "members", updatedAt: now });
    await emitEvent(ctx, LMS_EVENTS.COURSE_ACCESS_UPDATED, SYSTEM.LMS, {
      courseId: args.courseId,
      planCount: args.planIds.length,
    });
    return { ruleId };
  },
});
