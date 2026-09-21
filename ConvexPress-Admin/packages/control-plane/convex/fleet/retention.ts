import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { policyAccess, event } from "./policy";
export const sweep = internalMutation({
  args: { policyId: v.id("overseer_fleetPolicies") },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const policy = await ctx.db.get(args.policyId);
    if (!policy?.enabled || !policy.retentionEnabled) return { deleted: 0 };
    try {
      await policyAccess(ctx, policy);
    } catch {
      return { deleted: 0 };
    }
    const now = Date.now();
    const busy = await ctx.db
      .query("overseer_siteOperations")
      .withIndex("by_website_exclusive", (q) =>
        q.eq("websiteId", policy.websiteId).eq("exclusiveTargetLock", true),
      )
      .first();
    const handoff = await ctx.db
      .query("overseer_siteHandoffs")
      .withIndex("by_website_expiry", (q) =>
        q.eq("websiteId", policy.websiteId).gt("expiresAt", now),
      )
      .filter((q) => q.and(q.neq(q.field("status"), "revoked"), q.neq(q.field("status"), "failed")))
      .first();
    if (busy || handoff) {
      await ctx.db.patch(policy._id, { nextRetentionAt: now + 3600000 });
      return { deleted: 0 };
    }
    const keep = await ctx.db
      .query("overseer_siteBackups")
      .withIndex("by_policy_verified", (q) =>
        q.eq("schedulePolicyId", policy._id).eq("verificationStatus", "verified"),
      )
      .order("desc")
      .take(policy.keepBackups);
    const keepIds = new Set(keep.map((row) => row._id));
    const page = await ctx.db
      .query("overseer_siteBackups")
      .withIndex("by_policy_verified", (q) =>
        q
          .eq("schedulePolicyId", policy._id)
          .eq("verificationStatus", "verified")
          .lt("createdAt", now - policy.retentionDays * 86400000),
      )
      .order("asc")
      .paginate({ numItems: 25, cursor: policy.retentionCursor ?? null });
    let deleted = 0;
    for (const backup of page.page) {
      if (
        keepIds.has(backup._id) ||
        backup.purpose !== "manual" ||
        backup.instanceId !== policy.instanceId ||
        backup.websiteId !== policy.websiteId
      )
        continue;
      const operation = await ctx.db.get(backup.sourceOperationId);
      if (
        !operation ||
        operation.schedulePolicyId !== policy._id ||
        operation.state !== "succeeded" ||
        operation.operationCode !== "site.backup.create"
      )
        continue;
      const [used, preBackup, receipt, shared] = await Promise.all([
        ctx.db
          .query("overseer_siteOperations")
          .withIndex("by_snapshot_reference", (q) => q.eq("snapshotId", backup.snapshotId))
          .first(),
        ctx.db
          .query("overseer_siteOperations")
          .withIndex("by_prebackup_reference", (q) => q.eq("preBackupId", backup._id))
          .first(),
        ctx.db
          .query("overseer_operationReceipts")
          .withIndex("by_snapshot_reference", (q) => q.eq("preBackupSnapshotId", backup.snapshotId))
          .first(),
        ctx.db
          .query("overseer_siteBackups")
          .withIndex("by_storage", (q) => q.eq("artifactStorageId", backup.artifactStorageId))
          .take(2),
      ]);
      if (used || preBackup || receipt || shared.length !== 1) continue;
      await ctx.storage.delete(backup.artifactStorageId);
      await ctx.db.patch(backup._id, { verificationStatus: "deleted" });
      await event(ctx, policy, "retention", "SCHEDULED_BACKUP_EXPIRED", {
        snapshotId: backup.snapshotId,
        operationId: operation._id,
      });
      deleted++;
    }
    await ctx.db.patch(policy._id, {
      retentionCursor: page.isDone ? undefined : page.continueCursor,
      nextRetentionAt: now + (page.isDone ? 86400000 : 60000),
    });
    return { deleted };
  },
});
