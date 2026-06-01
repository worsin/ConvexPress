/**
 * LMS enrollment bridge internals.
 *
 * Keeps LMS enrollment rows in sync with adjacent systems without making
 * membership/commerce import public LMS mutations or impersonate a user.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";

type SyncResult = {
  created: number;
  reactivated: number;
  refreshed: number;
  revoked: number;
  keptByAlternateGrant: number;
  skippedExistingOtherSource: number;
  skippedMissingCourse: number;
};

const emptyResult = (): SyncResult => ({
  created: 0,
  reactivated: 0,
  refreshed: 0,
  revoked: 0,
  keptByAlternateGrant: 0,
  skippedExistingOtherSource: 0,
  skippedMissingCourse: 0,
});

export async function syncMembershipPlanCourseEnrollmentsHandler(
  ctx: any,
  args: {
    userId: any;
    planId: any;
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
        await ctx.db.patch(enrollment._id, {
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
  handler: syncMembershipPlanCourseEnrollmentsHandler,
});

export async function syncPurchasedCourseEnrollmentsHandler(
  ctx: any,
  args: {
    orderId: any;
    userId?: any;
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
  handler: syncPurchasedCourseEnrollmentsHandler,
});

async function findCourseIdsForPlan(ctx: any, planId: any) {
  const rules = await ctx.db.query("membership_restriction_rules").collect();
  return Array.from(
    new Set(
      rules
        .filter((rule: any) => rule.resourceType === "course")
        .filter((rule: any) => (rule.planIds ?? []).some((id: any) => String(id) === String(planId)))
        .map((rule: any) => rule.resourceIdOrKey),
    ),
  );
}

async function findAlternateActivePlanForCourse(
  ctx: any,
  args: { userId: any; courseId: any; excludePlanId: any },
) {
  const rules = await ctx.db
    .query("membership_restriction_rules")
    .withIndex("by_resource", (q: any) =>
      q.eq("resourceType", "course").eq("resourceIdOrKey", String(args.courseId)),
    )
    .collect();
  const allowedPlanIds = new Set(
    rules.flatMap((rule: any) => rule.planIds ?? []).map((id: any) => String(id)),
  );
  allowedPlanIds.delete(String(args.excludePlanId));
  if (allowedPlanIds.size === 0) return null;

  const active = await ctx.db
    .query("membership_grants")
    .withIndex("by_user_status", (q: any) => q.eq("userId", args.userId).eq("status", "active"))
    .collect();
  const grace = await ctx.db
    .query("membership_grants")
    .withIndex("by_user_status", (q: any) => q.eq("userId", args.userId).eq("status", "grace"))
    .collect();
  const grant = [...active, ...grace].find((row: any) => allowedPlanIds.has(String(row.planId)));
  return grant?.planId ?? null;
}

async function findEnrollment(ctx: any, userId: any, courseId: any) {
  return await ctx.db
    .query("lms_enrollments")
    .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
    .first();
}

async function upsertEnrollment(
  ctx: any,
  args: {
    userId: any;
    course: any;
    source: "membership_plan" | "purchase";
    membershipPlanId?: any;
    sourceRef?: string;
    expiresAt?: number;
  },
): Promise<keyof Pick<SyncResult, "created" | "reactivated" | "refreshed" | "skippedExistingOtherSource">> {
  const existing = await findEnrollment(ctx, args.userId, args.course._id);
  const now = Date.now();
  const expiresAt =
    args.expiresAt ??
    (args.course.accessDurationDays && args.course.accessDurationDays > 0
      ? now + args.course.accessDurationDays * 24 * 60 * 60 * 1000
      : undefined);

  if (existing) {
    if (existing.status === "active" && existing.source !== args.source) {
      return "skippedExistingOtherSource";
    }
    const reactivated = existing.status !== "active";
    await ctx.db.patch(existing._id, {
      source: args.source,
      membershipPlanId: args.membershipPlanId,
      sourceRef: args.sourceRef,
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

async function revokeEnrollment(
  ctx: any,
  args: {
    userId: any;
    courseId: any;
    source: "membership_plan" | "purchase";
    membershipPlanId?: any;
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
  await ctx.db.patch(existing._id, { status: "revoked", updatedAt: Date.now() });
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

async function findPurchasedCourseIds(ctx: any, orderId: any) {
  const items = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
    .collect();
  const ids: string[] = [];
  for (const item of items) {
    ids.push(...extractCourseIds(item.metadata));
    const product = await ctx.db.get(item.productId);
    ids.push(...extractCourseIds(product?.metadata));
    ids.push(...extractCourseIds(parseJsonObject(product?.rawSourceMeta)));
    const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
    ids.push(...extractCourseIds(variant?.metadata));
  }
  return Array.from(new Set(ids));
}

function parseJsonObject(value: unknown) {
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
