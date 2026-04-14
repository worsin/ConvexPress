import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Upsert a user from a Clerk webhook event.
 *
 * Resolution order:
 *   1. Match by clerkUserId (existing linked user) → update profile
 *   2. Match by email (imported user, e.g. from WooCommerce) with no clerkUserId → link accounts
 *   3. Match by email with a different clerkUserId → log warning, skip to avoid clobbering
 *   4. No match → create a new user
 *
 * The email-based fallback is critical for customer continuity: when a
 * WooCommerce customer is imported ahead of time and later signs in via
 * Clerk on the new site, this links their Clerk identity to the pre-existing
 * user record so they see all their imported orders, downloads, and licenses.
 */
export const upsertClerkUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const normalizedEmail = args.email.trim().toLowerCase();

    // 1. Try to find by clerkUserId first
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (byClerkId) {
      await ctx.db.patch(byClerkId._id, {
        email: normalizedEmail,
        firstName: args.firstName,
        lastName: args.lastName,
        profilePictureUrl: args.profilePictureUrl,
        updatedAt: now,
      });
      return;
    }

    // 2. Fallback: try to find an imported/unlinked user by email
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();

    if (byEmail) {
      if (!byEmail.clerkUserId) {
        // Link the existing imported user to this Clerk identity
        const patch: Record<string, unknown> = {
          clerkUserId: args.clerkUserId,
          authSource: "clerk",
          emailVerified: true,
          updatedAt: now,
        };
        // Only override name/picture if Clerk provided values and the record doesn't already have them
        if (args.firstName && !byEmail.firstName) patch.firstName = args.firstName;
        if (args.lastName && !byEmail.lastName) patch.lastName = args.lastName;
        if (args.profilePictureUrl && !byEmail.profilePictureUrl) {
          patch.profilePictureUrl = args.profilePictureUrl;
        }
        await ctx.db.patch(byEmail._id, patch);
        return;
      }

      if (byEmail.clerkUserId !== args.clerkUserId) {
        console.warn(
          `[ClerkSync] Email ${normalizedEmail} is already linked to a different Clerk user ` +
            `(existing: ${byEmail.clerkUserId}, incoming: ${args.clerkUserId}). Skipping to avoid clobber.`
        );
        return;
      }
    }

    // 3. No match — create a new user
    const subscriberRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
      .unique();

    await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId: args.clerkUserId,
      email: normalizedEmail,
      emailVerified: true,
      firstName: args.firstName,
      lastName: args.lastName,
      profilePictureUrl: args.profilePictureUrl,
      username: args.username,
      displayName: [args.firstName, args.lastName].filter(Boolean).join(" ") || normalizedEmail,
      slug: args.username ?? normalizedEmail.split("@")[0],
      status: "active",
      roleId: subscriberRole?._id,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteClerkUser = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, {
        status: "inactive",
        deactivatedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
