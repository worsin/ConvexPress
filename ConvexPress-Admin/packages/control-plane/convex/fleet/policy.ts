import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { assertStoredAccess } from "../rbac/functions";
export type Policy = Doc<"overseer_fleetPolicies">;
export type Ctx = QueryCtx | MutationCtx;
export async function targetAccess(
  ctx: Ctx,
  operator: Doc<"overseer_users">,
  instanceId: Id<"overseer_websiteInstances">,
  capability: string,
  operate = false,
) {
  const instance = await ctx.db.get(instanceId);
  if (!instance) throw Error("Environment not found");
  const website = await ctx.db.get(instance.website_id);
  if (!website || website.engine !== "convexpress") throw Error("Website not found");
  const target = { websiteId: String(website._id), instanceId: String(instance._id) };
  await assertStoredAccess(ctx, operator, {
    selector: { type: "capability", code: capability },
    target,
  });
  if (operate && instance.kind === "live")
    await assertStoredAccess(ctx, operator, {
      selector: { type: "capability", code: "environment.live.operate" },
      target,
    });
  return { instance, website };
}
export async function policyAccess(ctx: Ctx, policy: Policy) {
  const operator = await ctx.db.get(policy.authorizedByUserId);
  if (!operator || operator.isActive === false) throw Error("Policy operator is inactive");
  const target = await targetAccess(ctx, operator, policy.instanceId, "environment.read");
  if (policy.backupEnabled || policy.retentionEnabled)
    await targetAccess(ctx, operator, policy.instanceId, "site.backup.create", true);
  if (policy.healthEnabled)
    await targetAccess(ctx, operator, policy.instanceId, "connection.manage", true);
  if (target.website._id !== policy.websiteId) throw Error("Policy target changed");
  return { ...target, operator };
}
export function validateSettings(input: {
  backupIntervalHours: number;
  healthIntervalMinutes: number;
  retentionDays: number;
  keepBackups: number;
}) {
  for (const [value, min, max] of [
    [input.backupIntervalHours, 1, 720],
    [input.healthIntervalMinutes, 5, 1440],
    [input.retentionDays, 1, 3650],
    [input.keepBackups, 1, 100],
  ])
    if (!Number.isSafeInteger(value) || value! < min! || value! > max!)
      throw Error("Policy intervals or retention limits are invalid");
}
export async function event(
  ctx: MutationCtx,
  policy: Policy,
  kind: string,
  code: string,
  details: { operationId?: Id<"overseer_siteOperations">; snapshotId?: string } = {},
) {
  await ctx.db.insert("overseer_fleetEvents", {
    policyId: policy._id,
    instanceId: policy.instanceId,
    kind,
    code,
    ...details,
    createdAt: Date.now(),
  });
}
export async function incident(
  ctx: MutationCtx,
  policy: Policy,
  kind: string,
  code: string,
  open: boolean,
) {
  const prior = await ctx.db
    .query("overseer_fleetIncidents")
    .withIndex("by_policy_kind", (q) => q.eq("policyId", policy._id).eq("kind", kind))
    .unique();
  const now = Date.now();
  if (!prior) {
    if (!open) return;
    await ctx.db.insert("overseer_fleetIncidents", {
      policyId: policy._id,
      instanceId: policy.instanceId,
      kind,
      open,
      code,
      occurrences: 1,
      openedAt: now,
      updatedAt: now,
    });
    await event(ctx, policy, kind, code);
    return;
  }
  const changed = prior.open !== open || prior.code !== code;
  await ctx.db.patch(prior._id, {
    open,
    code,
    occurrences: open ? prior.occurrences + 1 : prior.occurrences,
    updatedAt: now,
    ...(open
      ? {
          resolvedAt: undefined,
          ...(!prior.open ? { openedAt: now, acknowledgedBy: undefined } : {}),
        }
      : { resolvedAt: prior.resolvedAt ?? now }),
  });
  if (changed) await event(ctx, policy, kind, code);
}
