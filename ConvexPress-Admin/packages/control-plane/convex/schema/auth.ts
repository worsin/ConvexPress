import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Donor-exact VO operator identity. Better Auth owns login/session/2FA data;
 * authUserId is the only component-to-app link.
 */
export const authTables = {
  overseer_users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    authUserId: v.optional(v.string()),
    username: v.optional(v.string()),
    handle: v.optional(v.string()),
    title: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarMediaAssetId: v.optional(v.id("mediacenter_mediaAssets")),
    avatarMediaUsageRefId: v.optional(v.id("mediacenter_mediaUsageRefs")),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("manager"),
      v.literal("member"),
      v.literal("viewer"),
    ),
    isActive: v.optional(v.boolean()),
    lastLoginAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("overseer_users")),
    clerkId: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        theme: v.optional(
          v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
        ),
        notifications: v.optional(v.boolean()),
        timezone: v.optional(v.string()),
      }),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_username", ["username"])
    .index("by_active", ["isActive"])
    .index("by_auth_user", ["authUserId"])
    .index("by_role", ["role"])
    .index("by_clerk_id", ["clerkId"]),
};
