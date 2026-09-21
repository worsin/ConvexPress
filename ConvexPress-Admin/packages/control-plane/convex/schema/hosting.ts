import { defineTable } from "convex/server";
import { v } from "convex/values";
export const hostingProvider = v.union(
  v.literal("convex"),
  v.literal("cloudflare"),
  v.literal("vercel"),
);
export const hostingEnvelope = v.object({
  encrypted: v.string(),
  iv: v.string(),
  authTag: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastRotatedAt: v.number(),
  version: v.number(),
});
export const hostingCredentialKind = v.union(v.literal("api_token"), v.literal("oauth"), v.literal("legacy"));
export const hostingCredentialState = v.union(v.literal("ready"), v.literal("refreshing"), v.literal("reconnect"));
export const hostingTables = {
  overseer_hostingOAuthAttempts: defineTable({
    organizationId: v.id("overseer_organizations"), businessId: v.optional(v.id("overseer_businesses")),
    externalAccountId: v.string(), expectedRevision: v.number(), requestedBy: v.id("overseer_users"),
    stateHash: v.string(), verifier: v.optional(hostingEnvelope), clientId: v.string(), redirectUri: v.string(),
    state: v.union(v.literal("pending"), v.literal("exchanging"), v.literal("received"), v.literal("completed"), v.literal("failed")),
    tokens: v.optional(hostingEnvelope), expiresAt: v.number(), tokenExpiresAt: v.optional(v.number()), accountId: v.optional(v.id("overseer_hostingAccounts")),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_state", ["stateHash"]).index("by_operator", ["requestedBy", "createdAt"]),
  overseer_hostingDeploymentCredentials: defineTable({
    instanceId: v.id("overseer_websiteInstances"),
    receiptId: v.id("overseer_hostingProvisioning"),
    accountId: v.id("overseer_hostingAccounts"),
    accountRevision: v.number(),
    deploymentName: v.string(),
    state: v.union(v.literal("intent"), v.literal("ready"), v.literal("rejected"), v.literal("recovering")),
    generation: v.optional(v.number()),
    recoveryLease: v.optional(v.string()),
    envelope: v.optional(hostingEnvelope),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_instance", ["instanceId"]),
  overseer_hostingAccounts: defineTable({
    organizationId: v.id("overseer_organizations"),
    businessId: v.optional(v.id("overseer_businesses")),
    provider: hostingProvider,
    externalAccountId: v.string(),
    label: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    credentials: v.optional(hostingEnvelope),
    credentialKind: v.optional(hostingCredentialKind), credentialState: v.optional(hostingCredentialState),
    credentialExpiresAt: v.optional(v.number()), credentialGeneration: v.optional(v.number()),
    refreshLease: v.optional(v.string()), refreshLeaseUntil: v.optional(v.number()),
    pendingCredentials: v.optional(hostingEnvelope), pendingExpiresAt: v.optional(v.number()),
    verifiedAt: v.number(),
    verifiedByUserId: v.id("overseer_users"),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope", ["organizationId", "businessId"])
    .index("by_scope_external", ["organizationId", "businessId", "provider", "externalAccountId"]),
  overseer_hostingProvisioning: defineTable({
    accountId: v.id("overseer_hostingAccounts"),
    websiteId: v.id("overseer_websites"),
    requestedByUserId: v.id("overseer_users"),
    idempotencyKey: v.string(),
    name: v.string(),
    steps: v.array(v.string()),
    state: v.union(
      v.literal("planned"),
      v.literal("running"),
      v.literal("needs_reconciliation"),
      v.literal("succeeded"),
    ),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency", ["accountId", "idempotencyKey"])
    .index("by_target", ["accountId", "websiteId"]),
  overseer_hostingProvisioningSteps: defineTable({
    receiptId: v.id("overseer_hostingProvisioning"),
    provider: hostingProvider,
    providerAccountId: v.string(),
    resourceKind: v.string(),
    websiteId: v.id("overseer_websites"),
    step: v.string(),
    state: v.union(
      v.literal("intent"),
      v.literal("uncertain"),
      v.literal("confirmed"),
      v.literal("rejected"),
    ),
    attempts: v.number(),
    externalId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_receipt_step", ["receiptId", "step"])
    .index("by_resource", ["provider", "providerAccountId", "resourceKind", "externalId"]),
};
