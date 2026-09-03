import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { buildWebsiteInstancePatch } from "../websiteInstancePolicy";

/**
 * One-release migration for environments created before the public site and
 * Convex management HTTP origins were represented separately.
 */
export const backfillManagementOrigins = internalMutation({
  args: {},
  returns: v.object({ examined: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    const instances = await ctx.db.query("overseer_websiteInstances").take(501);
    if (instances.length > 500) {
      throw new Error("Run a paginated management-origin migration");
    }
    let updated = 0;
    for (const instance of instances) {
      if (!instance.managementOrigin) {
        await ctx.db.patch(instance._id, {
          managementOrigin: instance.siteOrigin,
          updatedAt: Date.now(),
        });
        updated += 1;
      }
    }
    return { examined: instances.length, updated };
  },
});

/**
 * Deployment-admin repair for endpoint migrations. Portable audience keys are
 * immutable; collisions and active connections still fail closed.
 */
export const reconcileEndpoint = internalMutation({
  args: {
    instanceKey: v.string(),
    deploymentOrigin: v.optional(v.string()),
    managementOrigin: v.optional(v.string()),
    siteOrigin: v.optional(v.string()),
    label: v.optional(v.string()),
    siteContractVersion: v.optional(v.string()),
    schemaVersion: v.optional(v.string()),
    engineVersion: v.optional(v.string()),
  },
  returns: v.id("overseer_websiteInstances"),
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("overseer_websiteInstances")
      .withIndex("by_instance_key", (q) => q.eq("instanceKey", args.instanceKey))
      .take(2);
    if (matches.length !== 1) {
      throw new Error("Environment repair requires one exact portable key match");
    }
    const instance = matches[0]!;
    const { instanceKey: _instanceKey, ...input } = args;
    const patch = buildWebsiteInstancePatch({
      current: instance,
      input,
      now: Date.now(),
    });
    const originsChanged =
      (patch.deploymentOrigin !== undefined &&
        patch.deploymentOrigin !== instance.deploymentOrigin) ||
      (patch.managementOrigin !== undefined &&
        patch.managementOrigin !== instance.managementOrigin) ||
      (patch.siteOrigin !== undefined && patch.siteOrigin !== instance.siteOrigin);
    if (originsChanged) {
      const active = await ctx.db
        .query("overseer_connections")
        .withIndex("by_instance", (q) =>
          q.eq("instance_id", instance._id).eq("isActive", true),
        )
        .take(1);
      if (active.length > 0) {
        throw new Error("Revoke the active connection before repairing endpoints");
      }
    }
    const uniquenessChecks = [
      ["deploymentOrigin", "by_deployment_origin", "Deployment"],
      ["managementOrigin", "by_management_origin", "Management"],
      ["siteOrigin", "by_site_origin", "Site"],
    ] as const;
    for (const [field, index, label] of uniquenessChecks) {
      const value = patch[field];
      if (value === undefined || value === instance[field]) continue;
      const duplicates = await ctx.db
        .query("overseer_websiteInstances")
        .withIndex(index, (q) => q.eq(field, value))
        .take(2);
      if (duplicates.some((duplicate) => duplicate._id !== instance._id)) {
        throw new Error(`${label} origin is already attached to another environment`);
      }
    }
    await ctx.db.patch(instance._id, patch);
    return instance._id;
  },
});
