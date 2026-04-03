import { v } from "convex/values";

export const generateAllArgs = {
  postId: v.id("posts"),
};

export const generateSectionArgs = {
  postId: v.id("posts"),
  section: v.union(
    v.literal("hero"),
    v.literal("topic"),
    v.literal("summary"),
    v.literal("sources"),
    v.literal("tableOfContents"),
  ),
  topicIndex: v.optional(v.number()),
};
