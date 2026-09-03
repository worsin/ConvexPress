import { v } from "convex/values";
import { internalQueryGeneric as internalQuery } from "convex/server";

import type { ManagementQueryCtx } from "./model";

const looseV: any = v;
const defineInternalQuery: any = internalQuery;
const healthResult = looseV.object({
  status: looseV.union(
    looseV.literal("healthy"),
    looseV.literal("degraded"),
    looseV.literal("unhealthy"),
  ),
  checkedAt: looseV.string(),
  websiteKey: looseV.string(),
  instanceKey: looseV.string(),
  siteContractVersion: looseV.string(),
  schemaVersion: looseV.string(),
  engineVersion: looseV.string(),
  storageStatus: looseV.union(
    looseV.literal("healthy"),
    looseV.literal("degraded"),
    looseV.literal("unhealthy"),
    looseV.literal("unknown"),
  ),
  authStatus: looseV.union(
    looseV.literal("healthy"),
    looseV.literal("degraded"),
    looseV.literal("unhealthy"),
    looseV.literal("unknown"),
  ),
});

export const healthSnapshot = defineInternalQuery({
  args: {},
  returns: looseV.union(looseV.null(), healthResult),
  handler: async (ctx: ManagementQueryCtx) => {
    const identity = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q: any) => q.eq("identityKey", "site-identity"))
      .unique();
    if (!identity) return null;
    return {
      status: "healthy" as const,
      checkedAt: new Date().toISOString(),
      websiteKey: identity.websiteKey,
      instanceKey: identity.instanceKey,
      siteContractVersion: identity.siteContractVersion,
      schemaVersion: identity.schemaVersion,
      engineVersion: identity.engineVersion,
      storageStatus: "healthy" as const,
      authStatus: "healthy" as const,
    };
  },
});
