import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import schema from "../../schema";

// Explicit compatibility fixture for tests that start before live-field retirement.
// Ordinary authoring tests use the real contracted production schema instead.
const posts = defineTable({
  ...schema.tables.posts.validator.fields,
  content: v.optional(v.string()),
  contentMode: v.optional(v.union(v.literal("article"), v.literal("blocks"))),
  pageSections: v.optional(v.any()),
});
for (const index of schema.tables.posts.export().indexes) {
  posts.index(index.indexDescriptor, index.fields);
}
export const legacyPostSchema = defineSchema({ ...schema.tables, posts });
