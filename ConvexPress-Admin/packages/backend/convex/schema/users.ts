import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Core users table - owned by User Profile System
 * Convex Auth manages admin authentication; Clerk manages website authentication.
 *
 * Fields are organized into groups:
 *   - Auth identity fields (Convex Auth local accounts, Clerk website accounts)
 *   - ConvexPress-managed profile fields (editable by user/admin)
 *   - Social links
 *   - Role (managed by Role & Capability System)
 *   - Account status
 *   - Preferences
 *   - Denormalized counts
 *   - Timestamps
 *   - Legacy fields (preserved for backward compatibility)
 */
export const usersTables = {
  users: defineTable({
    // === Auth Identity Fields ===
    workosUserId: v.optional(v.string()), // Legacy field (preserved for backward compatibility)
    authSource: v.optional(v.union(v.literal("local"), v.literal("clerk"))),
    passwordHash: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    email: v.string(),
    emailVerified: v.boolean(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()), // OAuth avatar URL

    // === ConvexPress-Managed Profile Fields ===
    username: v.optional(v.string()),
    nickname: v.optional(v.string()), // User-chosen nickname for display name options
    displayName: v.optional(v.string()),
    slug: v.optional(v.string()), // URL-safe slug for author archive pages (e.g., "john-doe")
    bio: v.optional(v.string()), // Biography/description (max 500 chars)
    url: v.optional(v.string()), // Personal website URL
    avatarUrl: v.optional(v.string()), // Custom-uploaded avatar (takes priority over OAuth provider)
    avatarMediaId: v.optional(v.id("media")), // Reference to media library item for avatar
    avatarStorageId: v.optional(v.string()), // Convex Storage ID for custom avatar (for deletion)

    // === Social Links ===
    socialLinks: v.optional(
      v.object({
        twitter: v.optional(v.string()),
        facebook: v.optional(v.string()),
        instagram: v.optional(v.string()),
        linkedin: v.optional(v.string()),
        youtube: v.optional(v.string()),
        github: v.optional(v.string()),
        website: v.optional(v.string()),
      }),
    ),

    // === Role & Capability System ===
    roleId: v.optional(v.id("roles")),

    // === Account Status ===
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("banned"),
    ),
    deactivatedAt: v.optional(v.number()), // When the account was deactivated
    deactivatedBy: v.optional(v.id("users")), // Admin who deactivated the account

    // === Preferences ===
    preferences: v.optional(
      v.object({
        adminColorScheme: v.optional(v.string()),
        showAdminBar: v.optional(v.boolean()),
        editorMode: v.optional(
          v.union(v.literal("visual"), v.literal("code")),
        ),
        emailDigest: v.optional(
          v.union(
            v.literal("immediate"),
            v.literal("daily"),
            v.literal("weekly"),
            v.literal("none"),
          ),
        ),
        notifyOnComment: v.optional(v.boolean()),
        notifyOnReply: v.optional(v.boolean()),
        notifyOnMention: v.optional(v.boolean()),
      }),
    ),

    // === Locale & Timezone ===
    locale: v.optional(v.string()), // Preferred language
    timezone: v.optional(v.string()), // Preferred timezone

    // === Denormalized Counts ===
    postCount: v.optional(v.number()), // Published post count (updated by Post System)
    commentCount: v.optional(v.number()), // Comment count (updated by Comment System)

    // === Registration Metadata ===
    registrationMethod: v.optional(v.string()), // "self" | "invite" | "oauth" | "import"
    invitedBy: v.optional(v.id("users")), // Admin who invited this user (if method=invite)
    emailVerifiedAt: v.optional(v.number()), // Unix timestamp (ms) when email was verified
    registeredAt: v.optional(v.number()), // Unix timestamp (ms) of account registration

    // === Metadata ===
    lastLoginAt: v.optional(v.number()), // Last login timestamp (updated by Auth System)

    // === Password Management System Fields ===
    lastPasswordChangedAt: v.optional(v.number()), // Unix timestamp (ms) of last password change
    passwordResetRequestedAt: v.optional(v.number()), // Unix timestamp (ms) of last reset request
    passwordResetCount: v.optional(v.number()), // Total lifetime password resets (integer)
    passwordResetToken: v.optional(v.string()), // SHA-256 hash of the reset token (never stored plaintext)
    passwordResetTokenExpiresAt: v.optional(v.number()), // Unix timestamp (ms) when the reset token expires

    // === Internal/External classification (legacy - preserved for backward compatibility) ===
    internalRole: v.optional(v.string()),
    isInternal: v.optional(v.boolean()),

    // === Timestamps ===
    createdAt: v.number(),
    updatedAt: v.number(),

    // === WordPress Import Fields ===
    wpUserId: v.optional(v.number()), // Original WordPress user ID
    wpSourceSiteId: v.optional(v.id("wordpressSites")), // Source WordPress site
  })
    .index("by_workosUserId", ["workosUserId"])
    .index("by_email", ["email"])
    .index("by_slug", ["slug"])
    .index("by_username", ["username"])
    .index("by_roleId", ["roleId"])
    .index("by_status", ["status"])
    .index("by_displayName", ["displayName"])
    .index("by_createdAt", ["createdAt"])
    // Legacy indexes (preserved for backward compatibility)
    .index("by_internal_role", ["internalRole"])
    .index("by_is_internal", ["isInternal"])
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_authSource", ["authSource"]),
};
