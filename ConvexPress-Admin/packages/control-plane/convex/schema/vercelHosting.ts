import { defineTable } from "convex/server";
import { v } from "convex/values";
import { runtimeVerification } from "../hosting/websiteRuntimeVerification";

export const vercelReleaseState = v.union(v.literal("active"), v.literal("pending"), v.literal("failed"), v.literal("succeeded"));
export const vercelHostingTables = {
  overseer_vercelHostingTargets: defineTable({
    instanceId: v.id("overseer_websiteInstances"), accountId: v.id("overseer_hostingAccounts"),
    externalAccountId: v.string(), projectName: v.string(), hostingTarget: v.string(), active: v.boolean(),
    projectDispatched: v.boolean(), projectId: v.optional(v.string()), createdAt: v.number(),
  }).index("by_instance", ["instanceId", "active"]).index("by_project_name", ["externalAccountId", "projectName", "active"])
    .index("by_project_id", ["externalAccountId", "projectId"]),
  overseer_vercelHostingReleases: defineTable({
    targetId: v.id("overseer_vercelHostingTargets"), instanceId: v.id("overseer_websiteInstances"),
    accountRevision: v.number(), artifactHash: v.string(), deploymentOrigin: v.string(), siteOrigin: v.string(),
    instanceKey: v.string(), clerkPublishableKey: v.string(), editorOrigin: v.optional(v.string()), requestedBy: v.id("overseer_users"),
    state: vercelReleaseState, phase: v.string(), leaseToken: v.string(), leaseUntil: v.number(),
    deploymentDispatched: v.boolean(), deploymentId: v.optional(v.string()),
    createdAt: v.number(), updatedAt: v.number(), runtimeVerification: v.optional(runtimeVerification),
  }).index("by_instance", ["instanceId"]),
};
