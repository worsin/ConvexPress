import { defineTable } from "convex/server";
import { v } from "convex/values";

export const blockDefinitionTables = {
  blockDefinitions: defineTable({
    websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string(),
    name: v.string(), title: v.string(), generation: v.number(), lastVersion: v.number(),
    // Preferred approved version for new placements. Existing documents pin
    // immutable versions whose current approval is checked independently.
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("promoted")),
    activeVersion: v.optional(v.number()), promotedTo: v.optional(v.string()),
    promotedVersion: v.optional(v.number()), promotedDigest: v.optional(v.string()),
    promotionPackageDigest: v.optional(v.string()), promotionSourceGeneration: v.optional(v.number()),
    createdBy: v.id("users"), updatedBy: v.id("users"), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_scope_name", ["websiteKey", "instanceKey", "deploymentOrigin", "name"])
    .index("by_scope_status_name", ["websiteKey", "instanceKey", "deploymentOrigin", "status", "name"])
    .index("by_scope_author_name", ["websiteKey", "instanceKey", "deploymentOrigin", "createdBy", "name"])
    .index("by_scope_updated", ["websiteKey", "instanceKey", "deploymentOrigin", "updatedAt"]),
  blockDefinitionVersions: defineTable({
    definitionId: v.id("blockDefinitions"), version: v.number(),
    // Canonical, bounded JSON of {spec, composition, packTreatments}. Every read
    // validates the shared schemas and digest; no v.any transport escape hatch.
    definitionJson: v.string(), digest: v.string(),
    createdBy: v.id("users"), createdAt: v.number(),
  }).index("by_definition_version", ["definitionId", "version"]),
  // Approval changes never mutate a saved schema/composition or its digest.
  blockDefinitionApprovals: defineTable({
    definitionId: v.id("blockDefinitions"), version: v.number(), digest: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    updatedBy: v.id("users"), updatedAt: v.number(),
  }).index("by_definition_version", ["definitionId", "version"])
    .index("by_definition_status_version", ["definitionId", "status", "version"]),
};
