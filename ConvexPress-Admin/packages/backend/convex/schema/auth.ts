import { defineTable } from "convex/server";
import { v } from "convex/values";

export const authTables = {
  refreshTokens: defineTable({
    tokenHash: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"]),

  authSetupState: defineTable({
    key: v.union(v.literal("first_admin_setup_token_consumed")),
    createdAt: v.number(),
    consumedAt: v.number(),
  }).index("by_key", ["key"]),
};
