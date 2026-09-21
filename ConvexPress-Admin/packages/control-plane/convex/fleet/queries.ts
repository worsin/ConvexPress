import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { createStoredAccessResolver } from "../rbac/runtime";
import { publicAccessDeniedData, authenticatedQuery } from "../rbac/functions";
import { targetAccess } from "./policy";
const policySummary = v.object({
  policyId: v.id("overseer_fleetPolicies"),
  revision: v.number(),
  enabled: v.boolean(),
  backupEnabled: v.boolean(),
  backupIntervalHours: v.number(),
  healthEnabled: v.boolean(),
  healthIntervalMinutes: v.number(),
  retentionEnabled: v.boolean(),
  retentionDays: v.number(),
  keepBackups: v.number(),
  nextBackupAt: v.number(),
  lastBackupSuccessAt: v.union(v.number(), v.null()),
  lastHealthAt: v.union(v.number(), v.null()),
  lastHealthStatus: v.union(v.string(), v.null()),
  pauseCode: v.union(v.string(), v.null()),
});
export const get = authenticatedQuery({
  args: { instanceId: v.id("overseer_websiteInstances") },
  returns: v.object({
    policy: v.union(v.null(), policySummary),
    canManage: v.boolean(),
    incidents: v.array(
      v.object({
        incidentId: v.id("overseer_fleetIncidents"),
        kind: v.string(),
        code: v.string(),
        acknowledged: v.boolean(),
        openedAt: v.number(),
        occurrences: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    // One immutable query snapshot: reuse rules and hierarchy across capability checks.
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) throw Error("Environment not found");
    const website = await ctx.db.get(instance.website_id);
    if (!website || website.engine !== "convexpress") throw Error("Website not found");
    const resolve = createStoredAccessResolver(ctx, ctx.operator);
    const check = (code: string) => resolve({
      selector: { type: "capability", code },
      target: { websiteId: String(website._id), instanceId: String(instance._id) },
    });
    if (!(await check("environment.read")).allowed)
      throw new ConvexError(publicAccessDeniedData());
    const backup = await check("site.backup.create");
    const connection = await check("connection.manage");
    const liveAllowed = instance.kind !== "live" || (await check("environment.live.operate")).allowed;
    const canManage = backup.allowed && connection.allowed && liveAllowed;
    const p = await ctx.db
      .query("overseer_fleetPolicies")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .unique();
    const incidents = await ctx.db
      .query("overseer_fleetIncidents")
      .withIndex("by_instance_open", (q) => q.eq("instanceId", args.instanceId).eq("open", true))
      .take(20);
    return {
      canManage,
      policy: p
        ? {
            policyId: p._id,
            revision: p.revision,
            enabled: p.enabled,
            backupEnabled: p.backupEnabled,
            backupIntervalHours: p.backupIntervalHours,
            healthEnabled: p.healthEnabled,
            healthIntervalMinutes: p.healthIntervalMinutes,
            retentionEnabled: p.retentionEnabled,
            retentionDays: p.retentionDays,
            keepBackups: p.keepBackups,
            nextBackupAt: p.nextBackupAt,
            lastBackupSuccessAt: p.lastBackupSuccessAt ?? null,
            lastHealthAt: p.lastHealthAt ?? null,
            lastHealthStatus: p.lastHealthStatus ?? null,
            pauseCode: p.pauseCode ?? null,
          }
        : null,
      incidents: incidents.map((row) => ({
        incidentId: row._id,
        kind: row.kind,
        code: row.code,
        acknowledged: Boolean(row.acknowledgedBy),
        openedAt: row.openedAt,
        occurrences: row.occurrences,
      })),
    };
  },
});
export const history = authenticatedQuery({
  args: { instanceId: v.id("overseer_websiteInstances"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
      v.object({
        eventId: v.id("overseer_fleetEvents"),
        kind: v.string(),
        code: v.string(),
        operationId: v.union(v.id("overseer_siteOperations"), v.null()),
        snapshotId: v.union(v.string(), v.null()),
        createdAt: v.number(),
      }),
  ),
  handler: async (ctx, args) => {
    await targetAccess(ctx, ctx.operator, args.instanceId, "environment.read");
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 100
    )
      throw Error("History page size must be between 1 and 100");
    const result = await ctx.db
      .query("overseer_fleetEvents")
      .withIndex("by_instance_created", (q) => q.eq("instanceId", args.instanceId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((row) => ({
        eventId: row._id,
        kind: row.kind,
        code: row.code,
        operationId: row.operationId ?? null,
        snapshotId: row.snapshotId ?? null,
        createdAt: row.createdAt,
      })),
    };
  },
});
