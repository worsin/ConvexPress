import { getDocumentSize } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { MutationCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";
import { queueMembershipEnrollmentRepair } from "./enrollmentRepairs";
export const MEMBERSHIP_EXPIRY_ROWS = 8, MEMBERSHIP_EXPIRY_BYTES = 128 * 1024;
const expireRef = makeFunctionReference<"mutation", Record<string, never>>("membership/internals:expireGrants");
export async function expireMembershipGrants(ctx: MutationCtx) {
  const now = Date.now(); let expiredCount = 0, movedToGraceCount = 0, followUp = false;
  if (!(await isPluginEnabled(ctx, "membership"))) return { expiredCount, movedToGraceCount, processedAt: now };
  for (const status of ["active", "grace"] as const) {
    const query = status === "active"
      ? ctx.db.query("membership_grants").withIndex("by_status_ends", q => q.eq("status", "active").gt("endsAt", undefined).lte("endsAt", now))
      : ctx.db.query("membership_grants").withIndex("by_status_grace_ends", q => q.eq("status", "grace").lte("graceEndsAt", now));
    let rows = 0, bytes = 0;
    for await (const grant of query) {
      rows++; bytes += getDocumentSize(grant);
      const grace = grant.status === "active" && grant.revokedAt === undefined && grant.graceEndsAt !== undefined && Number.isFinite(grant.graceEndsAt) && grant.graceEndsAt > now;
      await patchDynamicWithMediaReferences(ctx, grant._id, { status: grace ? "grace" : "expired", updatedAt: now });
      await queueMembershipEnrollmentRepair(ctx, grant.userId, grant.planId);
      if (grace) movedToGraceCount++; else expiredCount++;
      if (rows >= MEMBERSHIP_EXPIRY_ROWS || bytes >= MEMBERSHIP_EXPIRY_BYTES) { followUp = true; break; }
    }
  }
  if (followUp) await ctx.scheduler.runAfter(500, expireRef, {});
  return { expiredCount, movedToGraceCount, processedAt: now };
}
