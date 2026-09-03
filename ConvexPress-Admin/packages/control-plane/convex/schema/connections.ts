import { defineTable } from "convex/server";
import { v } from "convex/values";

const credentialEnvelope = v.object({
  encrypted: v.string(),
  iv: v.string(),
  authTag: v.string(),
  salt: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  lastRotatedAt: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  version: v.optional(v.number()),
});

export const connectionTables = {
  overseer_connections: defineTable({
    organization_id: v.optional(v.id("overseer_organizations")),
    business_id: v.optional(v.id("overseer_businesses")),
    website_id: v.optional(v.id("overseer_websites")),
    instance_id: v.optional(v.id("overseer_websiteInstances")),
    owner_id: v.string(),
    app_id: v.optional(v.string()),
    vo_project_id: v.optional(v.string()),
    name: v.string(),
    serviceId: v.string(),
    provider: v.string(),
    category: v.optional(v.string()),
    accountEmail: v.optional(v.string()),
    accountLabel: v.optional(v.string()),
    track: v.union(v.literal("composio"), v.literal("native")),
    toolkitSlug: v.optional(v.string()),
    authConfigId: v.optional(v.string()),
    entityId: v.optional(v.string()),
    connectedAccountId: v.optional(v.string()),
    composioStatus: v.optional(v.string()),
    credentials: v.optional(credentialEnvelope),
    grantedScopes: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
      v.literal("pending"),
      v.literal("needs_reauth"),
      v.literal("revoked"),
    ),
    lastError: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastSyncStats: v.optional(v.string()),
    syncDirection: v.optional(
      v.union(
        v.literal("one-way-push"),
        v.literal("one-way-pull"),
        v.literal("two-way"),
      ),
    ),
    syncFrequency: v.optional(v.string()),
    redirectUrl: v.optional(v.string()),
    isActive: v.boolean(),
    config: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business", ["business_id", "isActive"])
    .index("by_business_service", ["business_id", "serviceId"])
    .index("by_owner", ["owner_id"])
    .index("by_service", ["serviceId"])
    .index("by_connectedAccount", ["connectedAccountId"])
    .index("by_status", ["status"])
    .index("by_website", ["website_id", "isActive"])
    .index("by_instance", ["instance_id", "isActive"]),

  overseer_connectionHealthHistory: defineTable({
    connectionId: v.id("overseer_connections"),
    instanceId: v.optional(v.id("overseer_websiteInstances")),
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("unreachable"),
      v.literal("revoked"),
    ),
    latencyMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    checkedAt: v.number(),
  })
    .index("by_connection", ["connectionId", "checkedAt"])
    .index("by_instance", ["instanceId", "checkedAt"]),
};
