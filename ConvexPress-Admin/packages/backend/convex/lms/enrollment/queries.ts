/**
 * Course Access & Enrollment - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { currentUserCan, getCurrentUser, requireCan } from "../../helpers/permissions";
import { canUserAccessCourse, canUserAccessNode } from "../access";

function isActiveEnrollment(enrollment: { status?: string; expiresAt?: number | null }) {
  return (
    enrollment.status === "active" &&
    (!enrollment.expiresAt || enrollment.expiresAt > Date.now())
  );
}

export const canAccessCourse = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { allowed: false, reason: "disabled", requiresLogin: false };
    }
    await assertCanReadUserAccess(ctx, args.userId);
    return await canUserAccessCourse(ctx, args);
  },
});

export const canAccessNode = query({
  args: { nodeId: v.id("lms_nodes"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { allowed: false, reason: "disabled", requiresLogin: false };
    }
    await assertCanReadUserAccess(ctx, args.userId);
    return await canUserAccessNode(ctx, args);
  },
});

export const getCourseUnlockSchedule = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await assertCanReadUserAccess(ctx, args.userId);

    const course = await ctx.db.get(args.courseId);
    if (!course) return [];
    if (course.status !== "published" && !(await canPreviewCourseSchedule(ctx))) {
      return [];
    }

    const nodes = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    const topics = nodes
      .filter((node) => node.kind === "topic")
      .sort((a, b) => a.position - b.position);
    const orderedLessons = topics.flatMap((topic) =>
      nodes
        .filter((node) => node.parentId === topic._id && node.kind === "lesson")
        .sort((a, b) => a.position - b.position),
    );

    const schedule = [];
    for (const lesson of orderedLessons) {
      const decision = await canUserAccessNode(ctx, {
        nodeId: lesson._id,
        userId: args.userId,
      });
      schedule.push({
        nodeId: lesson._id,
        allowed: decision.allowed,
        reason: decision.reason,
        requiresLogin: decision.requiresLogin,
        unlockAt: decision.unlockAt,
      });
    }
    return schedule;
  },
});

export const getEnrollment = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId) return null;
    if (args.userId && String(args.userId) !== String(me?._id)) {
      await requireCan(ctx, "lms.enroll.manage");
    }
    const enrollment = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .first();
    return enrollment && isActiveEnrollment(enrollment) ? enrollment : null;
  },
});

async function assertCanReadUserAccess(ctx: any, userId?: string) {
  if (!userId) return;
  const me = await getCurrentUser(ctx);
  if (String(userId) === String(me?._id)) return;
  await requireCan(ctx, "lms.enroll.manage");
}

async function canPreviewCourseSchedule(ctx: any) {
  return (
    (await currentUserCan(ctx, "lms.course.view")) ||
    (await currentUserCan(ctx, "lms.builder.manage")) ||
    (await currentUserCan(ctx, "lms.lesson.edit"))
  );
}

export const listEnrolleesForCourse = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await requireCan(ctx, "lms.enroll.manage");
    const enrollments = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId).eq("status", "active"))
      .collect();
    const rows = [];
    for (const e of enrollments.filter(isActiveEnrollment)) {
      const user = await ctx.db.get(e.userId);
      rows.push({
        enrollmentId: e._id,
        userId: e.userId,
        name: user?.displayName ?? user?.email ?? "Unknown",
        email: user?.email ?? "",
        source: e.source,
        enrolledAt: e.enrolledAt,
        expiresAt: e.expiresAt,
      });
    }
    return rows;
  },
});

export const listEnrollments = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("expired"),
        v.literal("revoked"),
        v.literal("all"),
      ),
    ),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await requireCan(ctx, "lms.enroll.manage");

    const requestedStatus = args.status ?? "active";
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), 250);
    const enrollments = await listEnrollmentRowsForStatus(ctx, requestedStatus);

    const needle = args.search?.trim().toLowerCase();
    const rows = [];
    for (const enrollment of enrollments) {
      const effectiveStatus = getEffectiveEnrollmentStatus(enrollment);
      if (requestedStatus !== "all" && effectiveStatus !== requestedStatus) continue;

      const [user, course] = await Promise.all([
        ctx.db.get(enrollment.userId),
        ctx.db.get(enrollment.courseId),
      ]);
      const learnerName = user?.displayName ?? user?.email ?? "Unknown learner";
      const learnerEmail = user?.email ?? "";
      const courseTitle = course?.title ?? "Deleted course";
      if (
        needle &&
        ![
          learnerName,
          learnerEmail,
          courseTitle,
          enrollment.source,
          effectiveStatus,
        ].some((value) => value.toLowerCase().includes(needle))
      ) {
        continue;
      }

      rows.push({
        enrollmentId: enrollment._id,
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        learnerName,
        learnerEmail,
        courseTitle,
        courseSlug: course?.slug,
        source: enrollment.source,
        status: effectiveStatus,
        enrolledAt: enrollment.enrolledAt,
        expiresAt: enrollment.expiresAt,
        updatedAt: enrollment.updatedAt,
      });
    }

    return rows
      .sort((a, b) => (b.updatedAt ?? b.enrolledAt) - (a.updatedAt ?? a.enrolledAt))
      .slice(0, limit);
  },
});

export const listMyEnrollments = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    const me = await getCurrentUser(ctx);
    if (!me) return [];
    const enrollments = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user", (q) => q.eq("userId", me._id).eq("status", "active"))
      .collect();
    const rows = [];
    for (const e of enrollments.filter(isActiveEnrollment)) {
      const course = await ctx.db.get(e.courseId);
      if (course) {
        const access = await canUserAccessCourse(ctx, { courseId: e.courseId, userId: me._id });
        if (!access.allowed) continue;
        rows.push({
          enrollmentId: e._id,
          courseId: e.courseId,
          title: course.title,
          slug: course.slug,
          lessonCount: course.lessonCount ?? 0,
          enrolledAt: e.enrolledAt,
        });
      }
    }
    return rows;
  },
});

export const listMyLearning = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const enrollments = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user", (q) => q.eq("userId", me._id).eq("status", "active"))
      .collect();

    const rows = [];
    for (const enrollment of enrollments.filter(isActiveEnrollment)) {
      const course = await ctx.db.get(enrollment.courseId);
      if (!course) continue;
      const access = await canUserAccessCourse(ctx, {
        courseId: enrollment.courseId,
        userId: me._id,
      });
      if (!access.allowed) continue;

      const nodes = await ctx.db
        .query("lms_nodes")
        .withIndex("by_course", (q) => q.eq("courseId", enrollment.courseId))
        .collect();
      const topics = nodes
        .filter((node) => node.kind === "topic")
        .sort((a, b) => a.position - b.position);
      const orderedLessons = [];
      for (const topic of topics) {
        orderedLessons.push(
          ...nodes
            .filter((node) => node.parentId === topic._id && node.kind === "lesson")
            .sort((a, b) => a.position - b.position),
        );
      }

      const progressRows = await ctx.db
        .query("lms_progress")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", me._id).eq("courseId", enrollment.courseId),
        )
        .collect();
      const completedSet = new Set(
        progressRows.filter((progress) => progress.completed).map((progress) => progress.nodeId),
      );
      const completedCount = orderedLessons.filter((lesson) => completedSet.has(lesson._id)).length;
      const total = orderedLessons.length;
      const next = orderedLessons.find((lesson) => !completedSet.has(lesson._id));
      const certificateIssue = await ctx.db
        .query("lms_certificate_issues")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", me._id).eq("courseId", enrollment.courseId),
        )
        .first();
      const certificatePdfUrl =
        certificateIssue?.status === "issued"
          ? await resolveCertificatePdfUrl(ctx, certificateIssue)
          : null;

      rows.push({
        enrollmentId: enrollment._id,
        courseId: enrollment.courseId,
        title: course.title,
        slug: course.slug,
        excerpt: course.excerpt,
        featuredImageId: course.featuredImageId,
        lessonCount: total,
        enrolledAt: enrollment.enrolledAt,
        expiresAt: enrollment.expiresAt,
        percent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
        completedCount,
        nextNodeId: next?._id ?? orderedLessons[0]?._id ?? null,
        certificateSerial:
          certificateIssue?.status === "issued" ? certificateIssue.serial : undefined,
        certificatePdfUrl: certificatePdfUrl ?? undefined,
      });
    }

    return rows.sort((a, b) => b.enrolledAt - a.enrolledAt);
  },
});

function getEffectiveEnrollmentStatus(enrollment: {
  status?: string;
  expiresAt?: number | null;
}) {
  if (enrollment.status === "active" && enrollment.expiresAt && enrollment.expiresAt <= Date.now()) {
    return "expired";
  }
  return enrollment.status ?? "revoked";
}

async function listEnrollmentRowsForStatus(ctx: any, status: string) {
  if (status === "all") {
    return await ctx.db.query("lms_enrollments").take(500);
  }

  if (status === "expired") {
    const [explicitExpired, overdueActive] = await Promise.all([
      ctx.db
        .query("lms_enrollments")
        .withIndex("by_status_expires", (q: any) => q.eq("status", "expired"))
        .collect(),
      ctx.db
        .query("lms_enrollments")
        .withIndex("by_status_expires", (q: any) =>
          q.eq("status", "active").lt("expiresAt", Date.now()),
        )
        .collect(),
    ]);
    return [...explicitExpired, ...overdueActive];
  }

  return await ctx.db
    .query("lms_enrollments")
    .withIndex("by_status_expires", (q: any) => q.eq("status", status))
    .collect();
}

async function resolveCertificatePdfUrl(ctx: any, issue: { pdfMediaId?: string }) {
  if (!issue.pdfMediaId) return null;
  const media = await ctx.db.get(issue.pdfMediaId);
  if (!media) return null;
  if (media.storageId && ctx.storage?.getUrl) {
    return await ctx.storage.getUrl(media.storageId);
  }
  return media.url ?? null;
}
