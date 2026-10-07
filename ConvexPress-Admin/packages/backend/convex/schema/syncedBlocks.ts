import { defineTable } from "convex/server";
import { v } from "convex/values";
import { canonicalStoredTreeValidator } from "../canonicalDocuments/foundation/generated/storage";
import { refreshAuthorityValidator, refreshStatusValidator, refreshCapabilityValidator } from "../syncedBlocks/refreshValidators";

export const syncedBlockTables = {
  syncedBlockConsumerDirty: defineTable({ postId: v.id("posts") }).index("by_document", ["postId"]),
  syncedBlockConsumerIndex: defineTable({
    key: v.literal("active"), generation: v.string(),
    websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string(),
    phase: v.union(v.literal("posts"), v.literal("edges"), v.literal("dirty"), v.literal("forms"), v.literal("ready")),
    cursor: v.union(v.string(), v.null()), sequence: v.number(), documents: v.number(),
    errorCode: v.optional(v.string()), blockedPostId: v.optional(v.id("posts")), updatedAt: v.number(),
  }).index("by_key", ["key"]),
  syncedBlockRefreshJobs: defineTable({
    sourceId: v.id("syncedBlocks"), sourceGeneration: v.number(),
    websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string(),
    authority: refreshAuthorityValidator, capability: refreshCapabilityValidator,
    indexGeneration: v.optional(v.string()), errorCode: v.optional(v.string()),
    status: refreshStatusValidator, attempt: v.number(),
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    afterPostId: v.union(v.id("posts"), v.null()),
    processed: v.number(), failed: v.number(),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_source", ["sourceId"])
    .index("by_status_updated", ["status", "updatedAt"]),
  syncedBlockRefreshFailures: defineTable({
    jobId: v.id("syncedBlockRefreshJobs"), attempt: v.number(),
    postId: v.id("posts"), code: v.string(), createdAt: v.number(),
  }).index("by_job_attempt", ["jobId", "attempt", "postId"]),
  // Discovery only: a consumer edge never grants page, source or Forms access.
  syncedBlockConsumers: defineTable({
    sourceId: v.id("syncedBlocks"), postId: v.id("posts"),
    websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string(),
  }).index("by_document", ["postId"])
    .index("by_source_scope", ["sourceId", "websiteKey", "instanceKey", "deploymentOrigin", "postId"]),
  syncedBlocks: defineTable({
    websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string(),
    title: v.string(), generation: v.number(), lastRevision: v.number(),
    publishedRevision: v.optional(v.number()),
    isLocked: v.optional(v.boolean()),
    legacySourceId: v.optional(v.id("reusableBlocks")),
    legacySourceDigest: v.optional(v.string()),
    refreshJobId: v.optional(v.id("syncedBlockRefreshJobs")),
    createdBy: v.id("users"), updatedBy: v.id("users"), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_legacy_source", ["legacySourceId"])
    .index("by_scope_updated", ["websiteKey", "instanceKey", "deploymentOrigin", "updatedAt"])
    .index("by_scope_author_updated", ["websiteKey", "instanceKey", "deploymentOrigin", "createdBy", "updatedAt"])
    .index("by_scope_published", ["websiteKey", "instanceKey", "deploymentOrigin", "publishedRevision"]),
  syncedBlockRevisions: defineTable({
    syncedBlockId: v.id("syncedBlocks"), revision: v.number(), title: v.string(),
    blocks: canonicalStoredTreeValidator, digest: v.string(),
    createdBy: v.id("users"), createdAt: v.number(),
    legacySourceJson: v.optional(v.string()),
    // Publication metadata can be set once. Authored content is never patched.
    publishedAt: v.optional(v.number()),
  }).index("by_source_revision", ["syncedBlockId", "revision"]),
};
