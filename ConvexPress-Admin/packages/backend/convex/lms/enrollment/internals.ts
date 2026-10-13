/**
 * LMS enrollment bridge internals.
 *
 * Keeps LMS enrollment rows in sync with adjacent systems without making
 * membership/commerce import public LMS mutations or impersonate a user.
 */

import { v } from "convex/values";
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { isPluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { patchDynamicWithMediaReferences } from "../../media/attachmentGuard";


type SyncResult = {
  created: number;
  reactivated: number;
  refreshed: number;
  revoked: number;
  keptByAlternateGrant: number;
  skippedExistingOtherSource: number;
  skippedMissingCourse: number;
  skippedSeatLimit: number;
};

const emptyResult = (): SyncResult => ({
  created: 0,
  reactivated: 0,
  refreshed: 0,
  revoked: 0,
  keptByAlternateGrant: 0,
  skippedExistingOtherSource: 0,
  skippedMissingCourse: 0,
  skippedSeatLimit: 0,
});

export async function syncMembershipPlanCourseEnrollmentsHandler(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    planId: Id<"membership_plans">;
    status: "active" | "grace" | "revoked" | "expired";
    expiresAt?: number;
    sourceRef?: string;
  },
): Promise<SyncResult & { skipped?: string }> {
  if (!(await isPluginEnabled(ctx, "lms"))) return { ...emptyResult(), skipped: "lms_disabled" };
  if (!(await isPluginEnabled(ctx, "membership"))) {
    return { ...emptyResult(), skipped: "membership_disabled" };
  }

  const courseIds = await findCourseIdsForPlan(ctx, args.planId);
  const result = emptyResult();
  for (const courseId of courseIds) {
    const course = await ctx.db.get(courseId);
    if (!course) {
      result.skippedMissingCourse++;
      continue;
    }
    if (args.status === "active" || args.status === "grace") {
      const outcome = await upsertEnrollment(ctx, {
        userId: args.userId,
        course,
        source: "membership_plan",
        membershipPlanId: args.planId,
        sourceRef: args.sourceRef,
        expiresAt: args.expiresAt,
      });
      result[outcome]++;
      continue;
    }

    const alternatePlanId = await findAlternateActivePlanForCourse(ctx, {
      userId: args.userId,
      courseId,
      excludePlanId: args.planId,
    });
    if (alternatePlanId) {
      const enrollment = await findEnrollment(ctx, args.userId, courseId);
      if (enrollment?.source === "membership_plan") {
        await patchDynamicWithMediaReferences(ctx, enrollment._id, {
          membershipPlanId: alternatePlanId,
          updatedAt: Date.now(),
        });
      }
      result.keptByAlternateGrant++;
      continue;
    }

    const revoked = await revokeEnrollment(ctx, {
      userId: args.userId,
      courseId,
      source: "membership_plan",
      membershipPlanId: args.planId,
    });
    if (revoked) result.revoked++;
  }
  return result;
}

export const syncMembershipPlanCourseEnrollments = internalMutation({
  args: {
    userId: v.id("users"),
    planId: v.id("membership_plans"),
    status: v.union(
      v.literal("active"),
      v.literal("grace"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    expiresAt: v.optional(v.number()),
    sourceRef: v.optional(v.string()),
  },
  returns: v.object({
    created: v.number(),
    reactivated: v.number(),
    refreshed: v.number(),
    revoked: v.number(),
    keptByAlternateGrant: v.number(),
    skippedExistingOtherSource: v.number(),
    skippedMissingCourse: v.number(),
    skippedSeatLimit: v.number(),
    skipped: v.optional(v.string()),
  }),
  handler: syncMembershipPlanCourseEnrollmentsHandler,
});

export async function syncPurchasedCourseEnrollmentsHandler(
  ctx: MutationCtx,
  args: {
    orderId: Id<"commerce_orders">;
    userId?: Id<"users">;
    action: "grant" | "revoke";
  },
): Promise<SyncResult & { courseIds: string[]; skipped?: string }> {
  if (!(await isPluginEnabled(ctx, "lms"))) {
    return { ...emptyResult(), courseIds: [], skipped: "lms_disabled" };
  }
  const order = await ctx.db.get(args.orderId);
  if (!order) return { ...emptyResult(), courseIds: [], skipped: "order_not_found" };
  const userId = args.userId ?? order.userId;
  if (!userId) return { ...emptyResult(), courseIds: [], skipped: "missing_user" };

  const courseIds = await findPurchasedCourseIds(ctx, order._id);
  const result = emptyResult();
  for (const courseId of courseIds) {
    const course = await ctx.db.get(courseId);
    if (!course) {
      result.skippedMissingCourse++;
      continue;
    }
    if (args.action === "grant") {
      const outcome = await upsertEnrollment(ctx, {
        userId,
        course,
        source: "purchase",
        sourceRef: String(order._id),
      });
      result[outcome]++;
    } else {
      const revoked = await revokeEnrollment(ctx, {
        userId,
        courseId,
        source: "purchase",
        sourceRef: String(order._id),
      });
      if (revoked) result.revoked++;
    }
  }

  return { ...result, courseIds: courseIds.map(String) };
}

export const syncPurchasedCourseEnrollments = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
    userId: v.optional(v.id("users")),
    action: v.union(v.literal("grant"), v.literal("revoke")),
  },
  returns: v.object({
    created: v.number(),
    reactivated: v.number(),
    refreshed: v.number(),
    revoked: v.number(),
    keptByAlternateGrant: v.number(),
    skippedExistingOtherSource: v.number(),
    skippedMissingCourse: v.number(),
    skippedSeatLimit: v.number(),
    courseIds: v.array(v.string()),
    skipped: v.optional(v.string()),
  }),
  handler: syncPurchasedCourseEnrollmentsHandler,
});

export async function expireExpiredEnrollmentsHandler(
  ctx: MutationCtx,
  args: { limit?: number } = {},
): Promise<{ expired: number; skipped?: string }> {
  if (!(await isPluginEnabled(ctx, "lms"))) return { expired: 0, skipped: "lms_disabled" };
  const now = Date.now();
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
  const enrollments = await ctx.db
    .query("lms_enrollments")
    .withIndex("by_status_expires", (q) =>
      q.eq("status", "active").lt("expiresAt", now),
    )
    .take(limit);

  for (const enrollment of enrollments) {
    await patchDynamicWithMediaReferences(ctx, enrollment._id, { status: "expired", updatedAt: now });
    await emitEvent(ctx, LMS_EVENTS.ENROLLMENT_EXPIRED, SYSTEM.LMS, {
      courseId: enrollment.courseId,
      userId: enrollment.userId,
      enrollmentId: enrollment._id,
      source: enrollment.source,
      membershipPlanId: enrollment.membershipPlanId,
      sourceRef: enrollment.sourceRef,
      expiresAt: enrollment.expiresAt,
    });
  }

  return { expired: enrollments.length };
}

export const expireExpiredEnrollments = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ expired: v.number(), skipped: v.optional(v.string()) }),
  handler: expireExpiredEnrollmentsHandler,
});

/** Course IDs restricted to `planId`; rule keys that are not course IDs are dropped. */
async function findCourseIdsForPlan(ctx: QueryCtx, planId: Id<"membership_plans">) {
  const rules = await ctx.db.query("membership_restriction_rules").collect();
  const keys = new Set(
    rules
      .filter((rule) => rule.resourceType === "course")
      .filter((rule) => (rule.planIds ?? []).some((id) => String(id) === String(planId)))
      .map((rule) => rule.resourceIdOrKey),
  );
  return normalizeCourseIds(ctx, keys);
}

function normalizeCourseIds(ctx: QueryCtx, keys: Iterable<string>): Id<"lms_courses">[] {
  const ids: Id<"lms_courses">[] = [];
  for (const key of keys) {
    const courseId = ctx.db.normalizeId("lms_courses", key);
    if (courseId) ids.push(courseId);
  }
  return ids;
}

async function findAlternateActivePlanForCourse(
  ctx: QueryCtx,
  args: { userId: Id<"users">; courseId: Id<"lms_courses">; excludePlanId: Id<"membership_plans"> },
) {
  const rules = await ctx.db
    .query("membership_restriction_rules")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
    )
    .collect();
  const allowedPlanIds = new Set(
    rules.flatMap((rule) => rule.planIds ?? []).map((id) => String(id)),
  );
  allowedPlanIds.delete(String(args.excludePlanId));
  if (allowedPlanIds.size === 0) return null;

  const active = await ctx.db
    .query("membership_grants")
    .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
    .collect();
  const grace = await ctx.db
    .query("membership_grants")
    .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "grace"))
    .collect();
  const grant = [...active, ...grace].find((row) => allowedPlanIds.has(String(row.planId)));
  return grant?.planId ?? null;
}

async function findEnrollment(ctx: QueryCtx, userId: Id<"users">, courseId: Id<"lms_courses">) {
  return await ctx.db
    .query("lms_enrollments")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .first();
}

async function upsertEnrollment(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    course: Doc<"lms_courses">;
    source: "membership_plan" | "purchase";
    membershipPlanId?: Id<"membership_plans">;
    sourceRef?: string;
    expiresAt?: number;
  },
): Promise<
  keyof Pick<
    SyncResult,
    "created" | "reactivated" | "refreshed" | "skippedExistingOtherSource" | "skippedSeatLimit"
  >
> {
  const existing = await findEnrollment(ctx, args.userId, args.course._id);
  const now = Date.now();
  const expiresAt =
    args.expiresAt ??
    (args.course.accessDurationDays && args.course.accessDurationDays > 0
      ? now + args.course.accessDurationDays * 24 * 60 * 60 * 1000
      : undefined);

  const existingIsCurrentlyActive = isCurrentlyActiveEnrollment(existing, now);
  if (existing) {
    if (existingIsCurrentlyActive && existing.source !== args.source) {
      return "skippedExistingOtherSource";
    }
    if (!existingIsCurrentlyActive && !(await courseSeatAvailable(ctx, args.course, now))) {
      return "skippedSeatLimit";
    }
    const reactivated = !existingIsCurrentlyActive;
    await patchDynamicWithMediaReferences(ctx, existing._id, {
      source: args.source,
      membershipPlanId: args.membershipPlanId,
      sourceRef: args.sourceRef,
      enrolledAt: existingIsCurrentlyActive ? existing.enrolledAt : now,
      expiresAt,
      status: "active",
      updatedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
      courseId: args.course._id,
      userId: args.userId,
      enrollmentId: existing._id,
      source: args.source,
      membershipPlanId: args.membershipPlanId,
      sourceRef: args.sourceRef,
      reactivated,
    });
    return reactivated ? "reactivated" : "refreshed";
  }

  if (!(await courseSeatAvailable(ctx, args.course, now))) {
    return "skippedSeatLimit";
  }

  const enrollmentId = await ctx.db.insert("lms_enrollments", {
    userId: args.userId,
    courseId: args.course._id,
    source: args.source,
    membershipPlanId: args.membershipPlanId,
    sourceRef: args.sourceRef,
    enrolledAt: now,
    expiresAt,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
    courseId: args.course._id,
    userId: args.userId,
    enrollmentId,
    source: args.source,
    membershipPlanId: args.membershipPlanId,
    sourceRef: args.sourceRef,
  });
  return "created";
}

function isCurrentlyActiveEnrollment(enrollment: Doc<"lms_enrollments"> | null, now: number) {
  return enrollment?.status === "active" && (!enrollment.expiresAt || enrollment.expiresAt > now);
}

async function courseSeatAvailable(ctx: QueryCtx, course: Doc<"lms_courses">, now: number) {
  if (!course.seatLimit || course.seatLimit <= 0) return true;
  const active = await ctx.db
    .query("lms_enrollments")
    .withIndex("by_course", (q) => q.eq("courseId", course._id).eq("status", "active"))
    .collect();
  const activeCount = active.filter((row) => isCurrentlyActiveEnrollment(row, now)).length;
  return activeCount < course.seatLimit;
}

async function revokeEnrollment(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    courseId: Id<"lms_courses">;
    source: "membership_plan" | "purchase";
    membershipPlanId?: Id<"membership_plans">;
    sourceRef?: string;
  },
) {
  const existing = await findEnrollment(ctx, args.userId, args.courseId);
  if (!existing || existing.status !== "active" || existing.source !== args.source) return false;
  if (
    args.membershipPlanId &&
    existing.membershipPlanId &&
    String(existing.membershipPlanId) !== String(args.membershipPlanId)
  ) {
    return false;
  }
  if (
    args.sourceRef &&
    existing.sourceRef &&
    String(existing.sourceRef) !== String(args.sourceRef)
  ) {
    return false;
  }
  await patchDynamicWithMediaReferences(ctx, existing._id, { status: "revoked", updatedAt: Date.now() });
  await emitEvent(ctx, LMS_EVENTS.UNENROLLED, SYSTEM.LMS, {
    courseId: args.courseId,
    userId: args.userId,
    enrollmentId: existing._id,
    source: args.source,
    membershipPlanId: args.membershipPlanId,
    sourceRef: args.sourceRef,
  });
  return true;
}

async function findPurchasedCourseIds(ctx: QueryCtx, orderId: Id<"commerce_orders">) {
  const items = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const ids: string[] = [];
  for (const item of items) {
    ids.push(...extractCourseIds(item.metadata));
    // Products and variants have no metadata column; WooCommerce-imported
    // course links live in the product's preserved raw source meta.
    const product = await ctx.db.get(item.productId);
    ids.push(...extractCourseIds(parseJsonObject(product?.rawSourceMeta)));
  }
  return normalizeCourseIds(ctx, new Set(ids));
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim().startsWith("{")) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractCourseIds(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(extractCourseIds);
  if (typeof value !== "object") return [];
  const data = value as Record<string, unknown>;
  const direct = [
    data.lmsCourseId,
    data.lms_course_id,
    data.courseId,
    data.course_id,
    data.course,
  ];
  const many = [
    data.lmsCourseIds,
    data.lms_course_ids,
    data.courseIds,
    data.course_ids,
    data.courses,
  ];
  return [...direct.flatMap(extractCourseIds), ...many.flatMap(extractCourseIds)]
    .map(String)
    .filter(Boolean);
}
