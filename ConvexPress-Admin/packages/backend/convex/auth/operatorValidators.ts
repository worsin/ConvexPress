import { v } from "convex/values";
export const operatorAuthorityValidator = v.object({
  userId: v.id("users"),
  authSource: v.union(v.literal("local"), v.literal("management")),
  managementSessionId: v.union(v.id("convexpress_managementSessions"), v.null()),
  passwordChangedAt: v.union(v.number(), v.null()),
  expiresAt: v.number(),
});
