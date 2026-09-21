import { v } from "convex/values";

export const refreshAuthorityValidator = v.object({
  userId: v.id("users"),
  authSource: v.union(v.literal("local"), v.literal("clerk"), v.literal("management")),
  clerkSubject: v.union(v.string(), v.null()),
  passwordChangedAt: v.union(v.number(), v.null()),
  managementSessionId: v.union(v.id("convexpress_managementSessions"), v.null()),
  capabilities: v.array(v.string()), expiresAt: v.number(),
});
export const refreshStatusValidator = v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"), v.literal("superseded"));
export const refreshCapabilityValidator = v.union(v.literal("post.publish"), v.literal("post.unpublish"));
