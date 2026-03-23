import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

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
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        profilePictureUrl: args.profilePictureUrl,
        updatedAt: now,
      });
    } else {
      const subscriberRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
        .unique();

      await ctx.db.insert("users", {
        authSource: "clerk",
        clerkUserId: args.clerkUserId,
        email: args.email,
        emailVerified: true,
        firstName: args.firstName,
        lastName: args.lastName,
        profilePictureUrl: args.profilePictureUrl,
        username: args.username,
        displayName: [args.firstName, args.lastName].filter(Boolean).join(" ") || args.email,
        slug: args.username ?? args.email.split("@")[0],
        status: "active",
        roleId: subscriberRole?._id,
        registrationMethod: "self",
        registeredAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
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
