import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  MAX_CLERK_NAME_LENGTH,
  MAX_CLERK_URL_LENGTH,
  deriveClerkSlug,
  normalizeClerkUserId,
  normalizeEmail,
  normalizeOptionalString,
} from "./inputLimits";
import {
  findPendingInvitation,
  getDefaultRoleDoc,
  getRegistrationSettings,
} from "../helpers/registration";

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

    const clerkUserId = normalizeClerkUserId(identity.subject);
    if (!clerkUserId) return null;

    const normalizedEmail = normalizeEmail(identity.email);
    const firstName = normalizeOptionalString(
      identity.givenName,
      MAX_CLERK_NAME_LENGTH,
    );
    const lastName = normalizeOptionalString(
      identity.familyName,
      MAX_CLERK_NAME_LENGTH,
    );
    const profilePictureUrl = normalizeOptionalString(
      identity.pictureUrl,
      MAX_CLERK_URL_LENGTH,
    );
    const derivedDisplayName =
      firstName && lastName ? `${firstName} ${lastName}` : firstName ?? lastName;
    const displayName =
      normalizeOptionalString(identity.name, MAX_CLERK_NAME_LENGTH) ??
      derivedDisplayName ??
      normalizedEmail;
    const emailVerified = identity.emailVerified === true;
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
          if (!emailVerified) return null;

          // Link the imported user to this Clerk identity
          const patch: Record<string, unknown> = {
            clerkUserId,
            authSource: "clerk",
            emailVerified: true,
            clerkProvisioningStatus: "linked_existing",
            clerkProvisioningSource: "clerk_session",
            clerkProvisioningReason: "session_email_match",
            clerkProvisionedAt: now,
            clerkProvisioningAttemptedAt: now,
            updatedAt: now,
          };
          if (firstName && !byEmail.firstName) patch.firstName = firstName;
          if (lastName && !byEmail.lastName) patch.lastName = lastName;
          if (profilePictureUrl && !byEmail.profilePictureUrl) {
            patch.profilePictureUrl = profilePictureUrl;
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

    if (!normalizedEmail) return null;

    const invitation = await findPendingInvitation(ctx, normalizedEmail);
    const settings = await getRegistrationSettings(ctx);
    if (!invitation && !settings.anyoneCanRegister) return null;

    const defaultRole = await getDefaultRoleDoc(ctx);
    let roleId: Id<"roles"> | undefined = defaultRole?._id;
    if (invitation) {
      const invitedRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q: ConvexQueryBuilder) =>
          q.eq("slug", invitation.role),
        )
        .unique();
      if (invitedRole?.status === "active") roleId = invitedRole._id;
    }

    const userId = await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId,
      email: normalizedEmail,
      emailVerified,
      firstName,
      lastName,
      profilePictureUrl,
      displayName: displayName || normalizedEmail,
      slug: deriveClerkSlug({ email: normalizedEmail }),
      status: "active",
      roleId,
      registrationMethod: invitation ? "invite" : "self",
      invitedBy: invitation?.invitedBy,
      clerkProvisioningStatus: "provisioned",
      clerkProvisioningSource: "clerk_session",
      clerkProvisioningReason: invitation
        ? "session_invitation_user_created"
        : "session_user_created",
      clerkProvisionedAt: now,
      clerkProvisioningAttemptedAt: now,
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (invitation) {
      await ctx.db.patch("invitations", invitation._id, {
        status: "accepted",
        acceptedBy: userId,
        acceptedAt: now,
      });
    }

    return userId;
  },
});
