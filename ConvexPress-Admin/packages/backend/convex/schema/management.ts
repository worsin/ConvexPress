import { defineTable } from "convex/server";
import { v } from "convex/values";

import {
  authorityStatusValidator,
  environmentKindValidator,
} from "../management/validators";

export const managementTables = {
  convexpress_siteIdentity: defineTable({
    identityKey: v.literal("site-identity"),
    websiteKey: v.string(),
    instanceKey: v.string(),
    environmentKind: environmentKindValidator,
    deploymentOrigin: v.string(),
    managementOrigin: v.string(),
    siteOrigin: v.string(),
    siteContractVersion: v.string(),
    schemaVersion: v.string(),
    engineVersion: v.string(),
    managementCapabilities: v.array(v.string()),
    initializedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_identity_key", ["identityKey"])
    .index("by_audience", ["websiteKey", "instanceKey"]),

  convexpress_managementAuthorities: defineTable({
    controllerId: v.string(),
    keyId: v.string(),
    label: v.optional(v.string()),
    publicKeyPem: v.string(),
    fingerprintSha256: v.string(),
    websiteKey: v.string(),
    instanceKey: v.string(),
    capabilities: v.array(v.string()),
    capabilityRevision: v.number(),
    status: authorityStatusValidator,
    notBefore: v.number(),
    expiresAt: v.optional(v.number()),
    enrolledAt: v.number(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_controller_key", ["controllerId", "keyId"])
    .index("by_audience", ["websiteKey", "instanceKey"])
    .index("by_status", ["status"]),

  convexpress_managementNonces: defineTable({
    authorityId: v.id("convexpress_managementAuthorities"),
    nonce: v.string(),
    expiresAt: v.number(),
    consumedAt: v.number(),
  })
    .index("by_authority_nonce", ["authorityId", "nonce"])
    .index("by_expiry", ["expiresAt"]),

  convexpress_managementBindings: defineTable({
    authorityId: v.id("convexpress_managementAuthorities"),
    controllerId: v.string(),
    syntheticOperatorId: v.string(),
    userId: v.optional(v.id("users")),
    capabilityRevision: v.number(),
    status: authorityStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_authority", ["authorityId"])
    .index("by_controller", ["controllerId", "status"])
    .index("by_synthetic_operator", ["syntheticOperatorId"]),

  convexpress_managementSessions: defineTable({
    tokenHash: v.string(),
    authorityId: v.id("convexpress_managementAuthorities"),
    bindingId: v.id("convexpress_managementBindings"),
    userId: v.id("users"),
    websiteKey: v.string(),
    instanceKey: v.string(),
    capabilities: v.array(v.string()),
    siteRoleSlug: v.string(),
    siteCapabilities: v.array(v.string()),
    capabilityRevision: v.number(),
    expiresAt: v.number(),
    status: authorityStatusValidator,
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_authority", ["authorityId", "status"])
    .index("by_expiry", ["expiresAt"]),
};
