import { mutation } from "../_generated/server";

export const provisionClerkUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (existing) return existing._id;

    const subscriberRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
      .unique();

    const now = Date.now();
    const email = identity.email ?? "";
    const firstName = identity.givenName ?? undefined;
    const lastName = identity.familyName ?? undefined;

    const userId = await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId: identity.subject,
      email,
      emailVerified: identity.emailVerified ?? false,
      firstName,
      lastName,
      profilePictureUrl: identity.pictureUrl ?? undefined,
      displayName: identity.name ?? email,
      slug: email.split("@")[0],
      status: "active",
      roleId: subscriberRole?._id,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});
