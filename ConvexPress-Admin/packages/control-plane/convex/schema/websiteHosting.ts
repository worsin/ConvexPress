import { defineTable } from "convex/server";
import { v } from "convex/values";
import { runtimeVerification } from "../hosting/websiteRuntimeVerification";
export const websiteReleaseState = v.union(v.literal("intent"), v.literal("uploading"), v.literal("uncertain"), v.literal("cancelled"), v.literal("succeeded"));
export const websiteHostingTables = {
  overseer_websiteHostingTargets: defineTable({
    instanceId: v.id("overseer_websiteInstances"), accountId: v.id("overseer_hostingAccounts"),
    externalAccountId: v.string(), workerName: v.string(), createdAt: v.number(),
  }).index("by_instance", ["instanceId"]).index("by_worker", ["externalAccountId", "workerName"]),
  overseer_websiteHostingReleases: defineTable({
    targetId: v.id("overseer_websiteHostingTargets"), instanceId: v.id("overseer_websiteInstances"),
    accountRevision: v.number(), artifactHash: v.string(), deploymentOrigin: v.string(), siteOrigin: v.string(),
    instanceKey: v.string(), clerkPublishableKey: v.string(), editorOrigin: v.optional(v.string()), requestedBy: v.id("overseer_users"),
    state: websiteReleaseState, phase: v.string(), leaseToken: v.string(), leaseUntil: v.number(),
    createdAt: v.number(), updatedAt: v.number(), runtimeVerification: v.optional(runtimeVerification), runtimeFailure: v.optional(runtimeVerification),
  }).index("by_instance", ["instanceId"]),
};
