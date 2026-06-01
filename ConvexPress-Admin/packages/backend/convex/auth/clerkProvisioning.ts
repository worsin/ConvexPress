import { mutation } from "../_generated/server";

/**
 * Ensure a ConvexPress user record exists for the current Clerk identity.
 * Called on first login from the website.
 *
 * Resolution order:
 *   1. Match by clerkUserId → return existing user
 *   2. Match by email (e.g. imported WooCommerce customer) with no clerkUserId → link accounts
 *   3. Match by email with a different clerkUserId → return null (conflict; email rebound)
 *   4. No match → create a new user
 *
 * The email-based fallback is critical for customer continuity.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const provisionClerkUser = mutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clerkUserId = identity.subject;
    const rawEmail = identity.email ?? "";
    const normalizedEmail = rawEmail.trim().toLowerCase();
    const firstName = identity.givenName ?? undefined;
    const lastName = identity.familyName ?? undefined;
    const now = Date.now();

    // 1. Match by clerkUserId
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q: ConvexQueryBuilder) => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (byClerkId) return byClerkId._id;

    // 2. Fallback: match by email (imported user)
    if (normalizedEmail) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", normalizedEmail))
        .unique();

      if (byEmail) {
        if (!byEmail.clerkUserId) {
          // Link the imported user to this Clerk identity
          const patch: Record<string, unknown> = {
            clerkUserId,
            authSource: "clerk",
            emailVerified: identity.emailVerified ?? true,
            clerkProvisioningStatus: "linked_existing",
            clerkProvisioningSource: "clerk_session",
            clerkProvisioningReason: "session_email_match",
            clerkProvisionedAt: now,
            clerkProvisioningAttemptedAt: now,
            updatedAt: now,
          };
          if (firstName && !byEmail.firstName) patch.firstName = firstName;
          if (lastName && !byEmail.lastName) patch.lastName = lastName;
          if (identity.pictureUrl && !byEmail.profilePictureUrl) {
            patch.profilePictureUrl = identity.pictureUrl;
          }
          await ctx.db.patch(byEmail._id, patch);
          return byEmail._id;
        }

        if (byEmail.clerkUserId !== clerkUserId) {
          console.warn(
            `[ClerkProvisioning] Email ${normalizedEmail} is already linked to a different ` +
              `Clerk user. Existing: ${byEmail.clerkUserId}, incoming: ${clerkUserId}.`
          );
          return null;
        }
      }
    }

    // 3. No match — create a new user
    const subscriberRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", "subscriber"))
      .unique();

    const userId = await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId,
      email: normalizedEmail,
      emailVerified: identity.emailVerified ?? false,
      firstName,
      lastName,
      profilePictureUrl: identity.pictureUrl ?? undefined,
      displayName: identity.name ?? normalizedEmail,
      slug: normalizedEmail.split("@")[0],
      status: "active",
      roleId: subscriberRole?._id,
      registrationMethod: "self",
      clerkProvisioningStatus: "provisioned",
      clerkProvisioningSource: "clerk_session",
      clerkProvisioningReason: "session_user_created",
      clerkProvisionedAt: now,
      clerkProvisioningAttemptedAt: now,
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});
