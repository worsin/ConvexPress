import { v } from "convex/values";
import { type RegisteredMutation, type RegisteredAction, makeFunctionReference } from "convex/server";
import { streamQuery } from "convex-helpers/server/pagination";
import { internalAction, internalMutation, type MutationCtx, type ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { isPluginEnabled } from "../helpers/plugins";
import { membershipAuthorityReader, readMembershipAuthorityGrants } from "../helpers/membershipAuthority";
import { evaluateMembershipAccess } from "./access";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";
import { emitEvent } from "../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../events/constants";

type Task = { jobId: Id<"membership_enrollment_repairs">; version: number };
type Job = Doc<"membership_enrollment_repairs">;
const taskArgs = { jobId: v.id("membership_enrollment_repairs"), version: v.number() };
const workRef = makeFunctionReference<"action", Task, null>("membership/enrollmentRepairs:work");
const advanceRef = makeFunctionReference<"mutation", Task, null>("membership/enrollmentRepairs:advance");
const failedRef = makeFunctionReference<"mutation", Task, null>("membership/enrollmentRepairs:failed");
const task = (job: Pick<Job, "_id" | "version">): Task => ({ jobId: job._id, version: job.version });
async function horizon(ctx: MutationCtx, userId: Id<"users">, planId: Id<"membership_plans">) {
  return ctx.db.query("lms_enrollments").withIndex("by_membership_user", q => q.eq("membershipPlanId", planId).eq("userId", userId)).order("desc").first();
}
/** Coalesce a pair's work without restarting an in-flight scan. A second finite
 * pass reconciles rows already processed when a later grant transition arrives. */
export async function queueMembershipEnrollmentRepair(ctx: MutationCtx, userId: Id<"users">, planId: Id<"membership_plans">) {
  const existing = await ctx.db.query("membership_enrollment_repairs").withIndex("by_user_plan", q => q.eq("userId", userId).eq("planId", planId)).unique();
  if (existing) { await ctx.db.patch("membership_enrollment_repairs", existing._id, { restart: true }); return; }
  const last = await horizon(ctx, userId, planId);
  if (!last) return;
  const id = await ctx.db.insert("membership_enrollment_repairs", { userId, planId, version: 0, afterTime: null, afterId: null, horizonTime: last._creationTime, horizonId: last._id, restart: false, attempts: 0, nextRetryAt: Date.now() + 60_000 });
  await ctx.scheduler.runAfter(0, workRef, { jobId: id, version: 0 });
}
async function nextEnrollment(ctx: MutationCtx, job: Job) {
  if (job.horizonTime === null || job.horizonId === null) return null;
  if (job.afterTime === job.horizonTime && job.afterId === job.horizonId) return null;
  const prefix = [job.planId, job.userId];
  const iterator = streamQuery(ctx, { schema, table: "lms_enrollments", index: "by_membership_user", order: "asc",
    startIndexKey: job.afterTime === null || job.afterId === null ? prefix : [...prefix, job.afterTime, job.afterId],
    startInclusive: job.afterTime === null,
    endIndexKey: [...prefix, job.horizonTime, job.horizonId], endInclusive: true,
  });
  try { const next = await iterator.next(); return next.done ? null : next.value[0] as Doc<"lms_enrollments">; }
  finally { await iterator.return(undefined); }
}
async function reconcile(ctx: MutationCtx, enrollment: Doc<"lms_enrollments">) {
  // Expiry never enrolls a new student or resurrects a manually revoked row.
  if (enrollment.source !== "membership_plan" || enrollment.status !== "active") return;
  const budget = new RequestReadLedger(); budget.beforeRead(); budget.record(enrollment);
  budget.beforeRead(); const course = budget.record(await ctx.db.get("lms_courses", enrollment.courseId));
  const grants = await readMembershipAuthorityGrants(ctx, enrollment.userId, budget);
  const reader = membershipAuthorityReader(ctx, budget);
  const decision = course ? await evaluateMembershipAccess(ctx, { resourceType: "course", resourceIdOrKey: String(enrollment.courseId), userId: enrollment.userId }, budget) : null;
  const permitted = decision?.allowed && decision.reason !== "no_restriction" && decision.reason !== "plugin_disabled";
  const matches = new Set(decision?.matchingPlanIds ?? []);
  const candidates: Array<{ planId: Id<"membership_plans">; until: number }> = [];
  if (permitted) for (const grant of grants) {
    if (matches.size && !matches.has(String(grant.planId))) continue;
    if ((await reader.plan(grant.planId))?.status !== "active") continue;
    const until = grant.status === "grace" ? grant.graceEndsAt! : grant.endsAt === undefined ? Infinity : Math.max(grant.endsAt, grant.graceEndsAt ?? grant.endsAt);
    candidates.push({ planId: grant.planId, until });
  }
  candidates.sort((a, b) => (a.planId === enrollment.membershipPlanId ? 0 : 1) - (b.planId === enrollment.membershipPlanId ? 0 : 1) || (a.until === b.until ? 0 : a.until > b.until ? -1 : 1));
  const selected = candidates[0];
  if (selected) {
    const duration = course?.accessDurationDays;
    const courseEnd = typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? enrollment.enrolledAt + duration * 86_400_000 : Infinity;
    const until = Math.min(selected.until, courseEnd);
    if (until > Date.now()) {
      const expiresAt = Number.isFinite(until) ? until : undefined;
      if (enrollment.membershipPlanId !== selected.planId || enrollment.expiresAt !== expiresAt)
        await patchDynamicWithMediaReferences(ctx, enrollment._id, { membershipPlanId: selected.planId, expiresAt, updatedAt: Date.now() });
      return;
    }
  }
  await patchDynamicWithMediaReferences(ctx, enrollment._id, { status: "revoked", updatedAt: Date.now() });
  await emitEvent(ctx, LMS_EVENTS.UNENROLLED, SYSTEM.LMS, { courseId: enrollment.courseId, userId: enrollment.userId, enrollmentId: enrollment._id, source: enrollment.source, membershipPlanId: enrollment.membershipPlanId, sourceRef: enrollment.sourceRef }, undefined, budget);
}
/** One enrollment per transaction keeps its full authority reads and event fanout
 * inside the existing request budgets, regardless of the course fleet size. */
export const advance: RegisteredMutation<"internal", Task, null> = internalMutation({ args: taskArgs, returns: v.null(), handler: async (ctx: MutationCtx, args: Task): Promise<null> => {
  const job = await ctx.db.get("membership_enrollment_repairs", args.jobId);
  if (!job || job.version !== args.version) return null;
  if (!(await isPluginEnabled(ctx, "membership")) || !(await isPluginEnabled(ctx, "lms"))) {
    await ctx.db.patch("membership_enrollment_repairs", job._id, { nextRetryAt: Date.now() + 60_000 }); return null;
  }
  const enrollment = await nextEnrollment(ctx, job);
  if (!enrollment) {
    if (!job.restart) { await ctx.db.delete("membership_enrollment_repairs", job._id); return null; }
    const last = await horizon(ctx, job.userId, job.planId);
    if (!last) { await ctx.db.delete("membership_enrollment_repairs", job._id); return null; }
    const version = job.version + 1;
    await ctx.db.patch("membership_enrollment_repairs", job._id, { afterTime: null, afterId: null, horizonTime: last._creationTime, horizonId: last._id, restart: false, version, attempts: 0, lastError: undefined, nextRetryAt: Date.now() + 60_000 });
    await ctx.scheduler.runAfter(0, workRef, { jobId: job._id, version }); return null;
  }
  await reconcile(ctx, enrollment);
  const version = job.version + 1;
  await ctx.db.patch("membership_enrollment_repairs", job._id, { afterTime: enrollment._creationTime, afterId: enrollment._id, version, attempts: 0, lastError: undefined, nextRetryAt: Date.now() + 60_000 });
  await ctx.scheduler.runAfter(0, workRef, { jobId: job._id, version }); return null;
}});
/** An action isolates a failed transaction from its retry receipt. Partial
 * enrollment/event writes roll back before the separate failure mutation. */
export const work: RegisteredAction<"internal", Task, null> = internalAction({ args: taskArgs, returns: v.null(), handler: async (ctx: ActionCtx, args: Task): Promise<null> => {
  try { await ctx.runMutation(advanceRef, args); }
  catch { await ctx.runMutation(failedRef, args); }
  return null;
}});
export const failed: RegisteredMutation<"internal", Task, null> = internalMutation({ args: taskArgs, returns: v.null(), handler: async (ctx: MutationCtx, args: Task): Promise<null> => {
  const job = await ctx.db.get("membership_enrollment_repairs", args.jobId);
  if (!job || job.version !== args.version) return null;
  const attempts = Math.min(job.attempts + 1, 20), delay = Math.min(3_600_000, 60_000 * 2 ** (attempts - 1));
  const version = job.version + 1;
  await ctx.db.patch("membership_enrollment_repairs", job._id, { version, attempts, nextRetryAt: Date.now() + delay, lastError: "Enrollment reconciliation failed. Inspect the function log; current authority remains enforced." });
  await ctx.scheduler.runAfter(delay, workRef, { jobId: job._id, version }); return null;
}});
export const recover: RegisteredMutation<"internal", Record<string, never>, null> = internalMutation({ args: {}, returns: v.null(), handler: async (ctx: MutationCtx): Promise<null> => {
  const jobs = await ctx.db.query("membership_enrollment_repairs").withIndex("by_retry", q => q.lte("nextRetryAt", Date.now())).take(16);
  for (const job of jobs) {
    // Revoke any lost/late worker's generation before dispatching its replacement.
    const version = job.version + 1;
    await ctx.db.patch("membership_enrollment_repairs", job._id, { version, nextRetryAt: Date.now() + 60_000 });
    await ctx.scheduler.runAfter(0, workRef, { jobId: job._id, version });
  }
  return null;
}});
