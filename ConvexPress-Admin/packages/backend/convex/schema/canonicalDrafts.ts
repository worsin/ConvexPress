import { defineTable } from "convex/server";
import { v } from "convex/values";
import { canonicalStoredTreeValidator } from "../canonicalDocuments/foundation/generated/storage";
import { composedRegistrySnapshotValidator } from "../canonicalDocuments/definitionStorage";

// Private input, never accepted content or a publication/revision snapshot.
export const canonicalDraftValueValidator = v.object({
  title: v.string(), blocks: canonicalStoredTreeValidator,
  composedDefinitions: v.optional(composedRegistrySnapshotValidator),
});
export const canonicalDraftTables = {
  canonicalDocumentDrafts: defineTable({
    postId: v.id("posts"), userId: v.id("users"), generation: v.number(),
    baseRevision: v.number(), draft: v.union(v.null(), canonicalDraftValueValidator),
    updatedAt: v.number(),
  }).index("by_postId_userId", ["postId", "userId"]),
};
