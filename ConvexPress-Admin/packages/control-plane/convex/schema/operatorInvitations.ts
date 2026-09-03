import { defineTable } from "convex/server";
import { v } from "convex/values";

export const operatorInvitationTables = {
  overseer_operatorInvitations: defineTable({
    operatorId: v.id("overseer_users"),
    email: v.string(),
    tokenHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("consumed"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    createdBy: v.id("overseer_users"),
    consumedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_operator_created", ["operatorId", "createdAt"])
    .index("by_email_created", ["email", "createdAt"])
    .index("by_status_expires", ["status", "expiresAt"]),
};
