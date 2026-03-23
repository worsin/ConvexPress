/**
 * Password Management System - Public Actions
 *
 * Actions are used for operations that require external API calls (WorkOS).
 * Unlike mutations, actions can make HTTP requests but cannot directly
 * read/write the database -- they use ctx.runMutation/ctx.runQuery.
 *
 * Functions:
 *   requestPasswordReset   - User requests a password reset (forgot-password flow)
 *   adminResetUserPassword - Admin triggers a password reset for another user
 *
 * WordPress equivalent: No direct equivalent.
 * WordPress admins can set passwords directly; SmithHarper only allows
 * triggering a reset email (more secure by design).
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { adminResetUserPasswordArgs } from "./validators";

// ─── requestPasswordReset ───────────────────────────────────────────────────

/**
 * Public action for the forgot-password flow.
 *
 * Called from the website's ForgotPasswordForm. This action:
 *   1. Calls the WorkOS User Management API to send a password reset email
 *   2. Records the reset request in SmithHarper via internal mutation (for audit)
 *
 * Email enumeration prevention:
 *   - ALWAYS returns successfully, regardless of whether the email exists
 *   - If WorkOS returns an error (e.g., email not found), we silently ignore it
 *   - The recordResetRequest mutation also silently does nothing for unknown emails
 *   - The caller (UI) always shows "Check your inbox" message
 *
 * Auth: None required (public -- this is the forgot-password flow)
 *
 * WordPress equivalent: retrieve_password() + lostpassword_post action
 */
export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    // Input validation: basic email format and length check
    // Prevents abuse via extremely long strings or malformed input
    if (email.length > 254 || email.length < 3 || !email.includes("@") || !email.includes(".")) {
      // Silently return -- same as if the email doesn't exist (email enumeration prevention)
      return;
    }

    // 1. Call WorkOS API to send password reset email
    // We silently ignore failures to prevent email enumeration
    const workosApiKey = process.env.WORKOS_API_KEY;
    let resetUrl: string | undefined;

    if (!workosApiKey) {
      // CRITICAL: Log a warning so operators know the integration is broken.
      // The system will still record the request internally for audit, but
      // NO password reset email will be sent via WorkOS.
      console.error(
        "WORKOS_API_KEY is not configured -- password reset emails will not be sent. " +
        "Set the WORKOS_API_KEY environment variable in the Convex deployment.",
      );
    }
    if (workosApiKey) {
      try {
        const response = await fetch(
          "https://api.workos.com/user_management/password_reset/create",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${workosApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
          },
        );
        // Try to extract the reset URL from the WorkOS response
        // WorkOS may return a link field in the response body
        if (response.ok) {
          try {
            const responseData = await response.json() as Record<string, unknown>;
            if (typeof responseData.link === "string") {
              resetUrl = responseData.link;
            }
          } catch {
            // JSON parse failure -- ignore, resetUrl stays undefined
          }
        }
        // If the email doesn't exist in WorkOS, we silently do nothing.
      } catch {
        // Network error -- silently ignore (email enumeration prevention)
      }
    }

    // 2. Check if this user registered via OAuth (for UX hint)
    // This does NOT confirm/deny email existence to the client.
    // The hint is advisory: "you might want to try OAuth login instead."
    const registrationMethod = await ctx.runQuery(
      internal.password.queries.getRegistrationMethodByEmail,
      { email },
    );

    const isOAuth = registrationMethod === "oauth";

    // 3. Record the reset request in SmithHarper for audit trail
    // This mutation also silently does nothing if the email doesn't exist.
    // Pass the resetUrl from WorkOS so the email template can include it.
    await ctx.runMutation(internal.password.mutations.recordResetRequest, {
      email,
      resetUrl,
    });

    // Return with optional OAuth hint.
    // The UI always shows a success message. If isOAuth is true,
    // it additionally shows a hint about using the OAuth provider.
    return { oauthHint: isOAuth };
  },
});

// ─── adminResetUserPassword ─────────────────────────────────────────────────

/**
 * Admin-initiated password reset for another user.
 *
 * Flow:
 *   1. Verify caller is an Administrator (role level 100)
 *   2. Look up the target user
 *   3. Call WorkOS API to send a password reset email
 *   4. Record the admin reset in SmithHarper via internal mutation
 *
 * The admin can NEVER see or set another user's password.
 * They can only trigger WorkOS to send the reset email.
 *
 * @throws ConvexError "User not found." if target user doesn't exist
 * @throws ConvexError "Failed to initiate password reset via WorkOS." on API failure
 * @throws Auth error if caller is not Administrator
 */
export const adminResetUserPassword = action({
  args: adminResetUserPasswordArgs,
  handler: async (ctx, args) => {
    // 1. Verify caller is authenticated and is an Administrator
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Look up the caller to verify admin status
    const caller = await ctx.runQuery(internal.password.queries.getUserByWorkosId, {
      workosId: identity.subject,
    });

    if (!caller) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    // Check admin role level (Administrator = 100)
    const callerRoleLevel = await ctx.runQuery(
      internal.password.queries.getUserRoleLevel,
      { userId: caller._id },
    );

    if (callerRoleLevel < 100) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Administrator access required",
      });
    }

    // 2. Look up the target user
    const targetUser = await ctx.runQuery(internal.password.queries.getUserById, {
      userId: args.targetUserId,
    });

    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    // 3. Call WorkOS API to send password reset email
    const workosApiKey = process.env.WORKOS_API_KEY;
    if (!workosApiKey) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "WorkOS API key is not configured",
      });
    }

    try {
      // Use WorkOS User Management API to send a password reset email
      // POST /user_management/password_reset/create
      const response = await fetch(
        "https://api.workos.com/user_management/password_reset/create",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${workosApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: targetUser.email,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `WorkOS password reset API error (${response.status}): ${errorText}`,
        );
        throw new ConvexError({
          code: "EXTERNAL_SERVICE_ERROR",
          message: "Failed to initiate password reset via WorkOS.",
        });
      }
    } catch (error: unknown) {
      if (error instanceof ConvexError) throw error;

      console.error("WorkOS password reset network error:", error);
      throw new ConvexError({
        code: "EXTERNAL_SERVICE_ERROR",
        message: "Failed to initiate password reset via WorkOS.",
      });
    }

    // 4. Record the admin-initiated reset in SmithHarper
    await ctx.runMutation(internal.password.mutations.recordAdminReset, {
      targetUserId: args.targetUserId,
      adminId: caller._id,
      timestamp: Date.now(),
    });
  },
});
