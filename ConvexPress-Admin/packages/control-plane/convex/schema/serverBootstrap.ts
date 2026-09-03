import { defineTable } from "convex/server";
import { v } from "convex/values";

export const serverBootstrapTables = {
  overseer_serverBootstrapReservations: defineTable({
    reservationKey: v.literal("server-bootstrap"),
    reservationId: v.string(),
    machineId: v.string(),
    ownerEmail: v.string(),
    status: v.union(
      v.literal("reserved"),
      v.literal("owner_created"),
      v.literal("machine_enrolled"),
      v.literal("finalized"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    ownerUserId: v.optional(v.id("overseer_users")),
    ownerCreatedAt: v.optional(v.number()),
    machineKeyId: v.optional(v.string()),
    machineEnrolledAt: v.optional(v.number()),
    authorityTransitionId: v.optional(v.string()),
    authorityEpoch: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureCode: v.optional(v.string()),
  })
    .index("by_reservationKey", ["reservationKey"])
    .index("by_reservationId", ["reservationId"]),
};
