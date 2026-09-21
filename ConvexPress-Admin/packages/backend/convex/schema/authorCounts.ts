import { defineTable } from "convex/server";
import { v } from "convex/values";

export const authorCountTables = {
  authorPostCounts: defineTable({
    authorId: v.id("users"),
    revision: v.number(),
    phase: v.union(v.literal("pending"), v.literal("scanning"), v.literal("ready")),
    count: v.number(),
    generation: v.number(),
    scanRevision: v.number(),
    cursor: v.union(v.string(), v.null()),
    subtotal: v.number(),
    updatedAt: v.number(),
  }).index("by_author", ["authorId"])
    .index("by_phase_updated", ["phase", "updatedAt"]),
};
