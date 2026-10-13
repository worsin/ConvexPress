import * as catalogRevisionWrites from "../../media/attachmentGuard";
/**
 * Course System - mutations.
 *
 * Authorization:
 *   - create / update:        Author (60+)
 *   - update existing content: course author or Editor (80+)
 *   - publish / archive / remove: Editor (80+)
 */

import { deleteWithMediaReferences, patchWithMediaReferences , deleteDynamicWithMediaReferences} from "../../media/attachmentGuard";
import { insertWithMediaReferences } from "../../media/attachmentGuard";
import { ConvexError } from "convex/values";
import { mutation } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
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

import { v } from "convex/values";

export const create = mutation({
  args: createCourseArgs,
  returns: v.id("lms_courses"),
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
    const courseId: import("../../_generated/dataModel").Id<"lms_courses"> = await insertWithMediaReferences<"lms_courses">(ctx, "lms_courses", {
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
  returns: v.id("lms_courses"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");

    const { courseId, ...rest } = args;
    const { course } = await requireCourseAuthorOrEditor(ctx, courseId, "lms.course.edit");

    const patch: Partial<WithoutSystemFields<Doc<"lms_courses">>> = { updatedAt: Date.now() };
    // Stored as given.
    if (rest.descriptionDoc !== undefined) patch.descriptionDoc = rest.descriptionDoc;
    if (rest.excerpt !== undefined) patch.excerpt = rest.excerpt;
    if (rest.featuredImageId !== undefined) patch.featuredImageId = rest.featuredImageId;
    if (rest.accessMode !== undefined) patch.accessMode = rest.accessMode;
    if (rest.billingUnit !== undefined) patch.billingUnit = rest.billingUnit;
    if (rest.progressionMode !== undefined) patch.progressionMode = rest.progressionMode;
    if (rest.prereqMode !== undefined) patch.prereqMode = rest.prereqMode;
    if (rest.startDate !== undefined) patch.startDate = rest.startDate;
    if (rest.endDate !== undefined) patch.endDate = rest.endDate;
    if (rest.contentVisibility !== undefined) patch.contentVisibility = rest.contentVisibility;
    if (rest.certificateId !== undefined) patch.certificateId = rest.certificateId;
    if (rest.materialsDoc !== undefined) patch.materialsDoc = rest.materialsDoc;
    // Site-relative or http(s) URLs only.
    if (rest.promoVideoUrl !== undefined) patch.promoVideoUrl = normalizeCourseUrl(rest.promoVideoUrl);
    if (rest.externalButtonUrl !== undefined) patch.externalButtonUrl = normalizeCourseUrl(rest.externalButtonUrl);
    if (rest.completionRedirectUrl !== undefined) {
      patch.completionRedirectUrl = normalizeCourseUrl(rest.completionRedirectUrl);
    }
    // Non-negative amounts.
    if (rest.price !== undefined) patch.price = normalizeNonNegativeNumber(rest.price);
    if (rest.recurringPrice !== undefined) patch.recurringPrice = normalizeNonNegativeNumber(rest.recurringPrice);
    if (rest.trialPrice !== undefined) patch.trialPrice = normalizeNonNegativeNumber(rest.trialPrice);
    // Non-negative whole numbers.
    if (rest.trialDays !== undefined) patch.trialDays = normalizeNonNegativeInt(rest.trialDays);
    if (rest.pointsAwarded !== undefined) patch.pointsAwarded = normalizeNonNegativeInt(rest.pointsAwarded);
    if (rest.pointsRequired !== undefined) patch.pointsRequired = normalizeNonNegativeInt(rest.pointsRequired);
    if (rest.accessDurationDays !== undefined) {
      patch.accessDurationDays = normalizeNonNegativeInt(rest.accessDurationDays);
    }
    if (rest.seatLimit !== undefined) patch.seatLimit = normalizeNonNegativeInt(rest.seatLimit);
    if (rest.billingInterval !== undefined) patch.billingInterval = normalizePositiveInt(rest.billingInterval);
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

    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", courseId, patch);
    await upsertCourseSearchIndex(ctx, courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_UPDATED, SYSTEM.LMS, { courseId });
    return courseId;
  },
});

export const publish = mutation({
  args: courseIdArg,
  returns: v.id("lms_courses"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCan(ctx, "lms.course.publish");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, {
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
  returns: v.id("lms_courses"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCan(ctx, "lms.course.publish");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, { status: "draft", updatedAt: Date.now() });
    await upsertCourseSearchIndex(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_UNPUBLISHED, SYSTEM.LMS, { courseId: args.courseId });
    return args.courseId;
  },
});

export const archive = mutation({
  args: courseIdArg,
  returns: v.id("lms_courses"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");
    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, { status: "archived", updatedAt: Date.now() });
    await deleteCourseSearchIndex(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_ARCHIVED, SYSTEM.LMS, { courseId: args.courseId });
    return args.courseId;
  },
});

export const restore = mutation({
  args: courseIdArg,
  returns: v.id("lms_courses"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");
    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, { status: "draft", updatedAt: Date.now() });
    await upsertCourseSearchIndex(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.COURSE_RESTORED, SYSTEM.LMS, { courseId: args.courseId });
    return args.courseId;
  },
});

export const remove = mutation({
  args: courseIdArg,
  returns: v.object({ deleted: v.boolean() }),
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
    for (const node of nodes) await deleteWithMediaReferences<"lms_nodes">(ctx, "lms_nodes", node._id);

    const prereqs = await ctx.db
      .query("lms_course_prerequisites")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const p of prereqs) await ctx.db.delete("lms_course_prerequisites", p._id);

    const inversePrereqs = await ctx.db
      .query("lms_course_prerequisites")
      .withIndex("by_prereq", (q) => q.eq("prereqCourseId", args.courseId))
      .collect();
    for (const p of inversePrereqs) await ctx.db.delete("lms_course_prerequisites", p._id);

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
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
        .collect();
      for (const row of rows) await deleteDynamicWithMediaReferences(ctx, row._id);
    }

    const accessRules = await ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
      )
      .collect();
    for (const rule of accessRules) await catalogRevisionWrites.deleteWithMediaReferences<"membership_restriction_rules">(ctx, "membership_restriction_rules", rule._id);

    await deleteCourseSearchIndex(ctx, args.courseId);
    await deleteWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId);
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
  returns: v.id("lms_courses"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { user } = await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.create");
    const db = ctx.db;
    const src = await db.get(args.courseId);
    if (!src) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });

    const now = Date.now();
    const slug = await generateUniqueCourseSlug(ctx, `${src.title} (Copy)`);
    const newId: import("../../_generated/dataModel").Id<"lms_courses"> = await insertWithMediaReferences<"lms_courses">(ctx, "lms_courses", {
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
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    const idMap = new Map<string, import("../../_generated/dataModel").Id<"lms_nodes">>();
    for (const t of nodes.filter((n) => n.kind === "topic")) {
      const nt: import("../../_generated/dataModel").Id<"lms_nodes"> = await insertWithMediaReferences<"lms_nodes">(ctx, "lms_nodes", {
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
      idMap.set(String(t._id), nt);
    }
    for (const n of nodes.filter((x) => x.kind !== "topic")) {
      await insertWithMediaReferences<"lms_nodes">(ctx, "lms_nodes", {
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

    const prereqs = await db
      .query("lms_course_prerequisites")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const prereq of prereqs) {
      await db.insert("lms_course_prerequisites", {
        courseId: newId,
        prereqCourseId: prereq.prereqCourseId,
        createdAt: now,
      });
    }

    const accessRules = await db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
      )
      .collect();
    for (const rule of accessRules) {
      await catalogRevisionWrites.insertWithMediaReferences<"membership_restriction_rules">({ db }, "membership_restriction_rules", {
        resourceType: "course",
        resourceIdOrKey: String(newId),
        ruleMode: rule.ruleMode,
        planIds: rule.planIds ?? [],
        requiredCapabilities: rule.requiredCapabilities ?? [],
        teaserMode: rule.teaserMode,
        customMessage: rule.customMessage,
        loginRequired: rule.loginRequired,
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
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { course } = await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.course.edit");
    const unique = Array.from(new Set(args.prereqCourseIds));
    if (unique.includes(args.courseId)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "A course cannot be its own prerequisite.",
      });
    }

    for (const id of unique) {
      const prereq = await ctx.db.get(id);
      if (!prereq) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Prerequisite course not found" });
      }
    }

    const existing = await ctx.db
      .query("lms_course_prerequisites")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const row of existing) await ctx.db.delete("lms_course_prerequisites", row._id);

    const now = Date.now();
    for (const id of unique) {
      await ctx.db.insert("lms_course_prerequisites", {
        courseId: args.courseId,
        prereqCourseId: id,
        createdAt: now,
      });
    }
    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, {
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
  returns: v.union(v.object({ ruleId: v.null(), deleted: v.boolean() }), v.object({ ruleId: v.id("membership_restriction_rules"), deleted: v.optional(v.null()) })),
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
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
      )
      .first();

    if (args.planIds.length === 0) {
      if (existing) await catalogRevisionWrites.deleteWithMediaReferences<"membership_restriction_rules">(ctx, "membership_restriction_rules", existing._id);
      await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, { updatedAt: now });
      await emitEvent(ctx, LMS_EVENTS.COURSE_ACCESS_UPDATED, SYSTEM.LMS, {
        courseId: args.courseId,
        planCount: 0,
        deleted: !!existing,
      });
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
      ? (await catalogRevisionWrites.patchWithMediaReferences<"membership_restriction_rules">(ctx, "membership_restriction_rules", existing._id, payload), existing._id)
      : await catalogRevisionWrites.insertWithMediaReferences<"membership_restriction_rules">(ctx, "membership_restriction_rules", {
          ...payload,
          createdAt: now,
        });

    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, { accessMode: "members", updatedAt: now });
    await emitEvent(ctx, LMS_EVENTS.COURSE_ACCESS_UPDATED, SYSTEM.LMS, {
      courseId: args.courseId,
      planCount: args.planIds.length,
    });
    return { ruleId };
  },
});
