import { defineTable } from "convex/server";
import { v } from "convex/values";
import { operatorAuthorityValidator } from "../auth/operatorValidators";

export const authTables = {
  websiteOperatorHandoffs: defineTable({
    codeHash: v.string(), origin: v.string(), websiteKey: v.string(), instanceKey: v.string(),
    authority: operatorAuthorityValidator, userId: v.id("users"), expiresAt: v.number(),
  }).index("by_codeHash", ["codeHash"]).index("by_userId_expiresAt", ["userId", "expiresAt"]),
  refreshTokens: defineTable({
    tokenHash: v.string(),
    environmentBinding: v.optional(v.string()),
    userId: v.id("users"),
    expiresAt: v.number(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"]),

  authSetupState: defineTable({
    key: v.union(v.literal("first_admin_setup_token_consumed")),
    setupTokenHash: v.optional(v.string()),
    createdAt: v.number(),
    consumedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_setupTokenHash", ["setupTokenHash"]),
};
