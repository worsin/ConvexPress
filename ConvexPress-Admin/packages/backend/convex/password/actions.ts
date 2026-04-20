/**
 * Password Management System - Public Actions
 *
 * Actions are used for operations that require side effects (token generation,
 * email sending via the Resend-based email queue).
 * Unlike mutations, actions can run non-deterministic code but cannot directly
 * read/write the database -- they use ctx.runMutation/ctx.runQuery.
 *
 * Functions:
 *   requestPasswordReset   - User requests a password reset (forgot-password flow)
 *   adminResetUserPassword - Admin triggers a password reset for another user
 *   completePasswordReset  - User completes a password reset with token + new password
 *
 * WordPress equivalent: No direct equivalent.
 * WordPress admins can set passwords directly; ConvexPress only allows
 * triggering a reset email (more secure by design).
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { adminResetUserPasswordArgs, completePasswordResetArgs } from "./validators";

/** Token expiry: 24 hours */
const RESET_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically secure random token string.
 * Uses the Web Crypto API available in Convex runtime.
 */
function generateResetToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash a token using SHA-256.
 * We store the hash in the database, not the plaintext token.
 * The plaintext token is sent to the user via email.
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── requestPasswordReset ───────────────────────────────────────────────────

/**
 * Public action for the forgot-password flow.
 *
 * Called from the website's ForgotPasswordForm. This action:
 *   1. Generates a secure reset token
 *   2. Stores the hashed token on the user record via internal mutation
 *   3. Queues a password reset email via the Resend-based email system
 *
 * Email enumeration prevention:
 *   - ALWAYS returns successfully, regardless of whether the email exists
 *   - If the email doesn't exist, we silently do nothing
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

    // 1. Check if this user registered via OAuth (for UX hint)
    // This does NOT confirm/deny email existence to the client.
    // The hint is advisory: "you might want to try OAuth login instead."
    const registrationMethod = await ctx.runQuery(
      internal.password.queries.getRegistrationMethodByEmail,
      { email },
    );

    const isOAuth = registrationMethod === "oauth";

    // 2. Generate a secure reset token
    const token = generateResetToken();
    const tokenHash = await hashToken(token);
    const expiresAt = Date.now() + RESET_TOKEN_EXPIRY_MS;

    // 3. Get site URL for building the reset link
    const siteUrl = await ctx.runQuery(
      internal.password.queries.getSiteUrl,
    );

    const resetUrl = `${siteUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    // 4. Store hashed token and queue the reset email via internal mutation.
    // This mutation silently does nothing if the email doesn't exist (enum prevention).
    await ctx.runMutation(internal.password.mutations.recordResetRequest, {
      email,
      tokenHash,
      tokenExpiresAt: expiresAt,
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
 *   3. Generate a reset token and store the hash
 *   4. Queue a password reset email via the Resend-based email system
 *   5. Record the admin reset in ConvexPress via internal mutation
 *
 * The admin can NEVER see or set another user's password.
 * They can only trigger a reset email to be sent to the user.
 *
 * @throws ConvexError "User not found." if target user doesn't exist
 * @throws ConvexError Auth error if caller is not Administrator
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

    // Look up the caller using their auth identity subject
    const caller = await ctx.runQuery(internal.password.queries.getUserBySubject, {
      subject: identity.subject,
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

    // 3. Generate a reset token
    const token = generateResetToken();
    const tokenHash = await hashToken(token);
    const expiresAt = Date.now() + RESET_TOKEN_EXPIRY_MS;

    // 4. Get site URL for building the reset link
    const siteUrl = await ctx.runQuery(
      internal.password.queries.getSiteUrl,
    );

    const resetUrl = `${siteUrl}/reset-password?token=${token}&email=${encodeURIComponent(targetUser.email)}`;

    // 5. Store hashed token and queue the reset email
    await ctx.runMutation(internal.password.mutations.storeResetToken, {
      userId: targetUser._id,
      tokenHash,
      tokenExpiresAt: expiresAt,
      resetUrl,
    });

    // 6. Record the admin-initiated reset in ConvexPress
    await ctx.runMutation(internal.password.mutations.recordAdminReset, {
      targetUserId: args.targetUserId,
      adminId: caller._id,
      timestamp: Date.now(),
    });
  },
});

// ─── completePasswordReset ─────────────────────────────────────────────────

/**
 * Public action for completing a password reset.
 *
 * Called from the website's reset-password form. This action:
 *   1. Hashes the raw token from the URL
 *   2. Verifies the token via internal mutation (checks email, hash, expiry)
 *   3. Updates the user's password in Clerk via the Backend API
 *   4. Records the reset completion in ConvexPress (clears token, emits event)
 *
 * Auth: None required (public -- user is not signed in during password reset)
 *
 * @throws ConvexError "INVALID_TOKEN" if the token is invalid, expired, or email mismatch
 * @throws ConvexError "PASSWORD_UPDATE_FAILED" if the Clerk API call fails
 */
export const completePasswordReset = action({
  args: completePasswordResetArgs,
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const token = args.token.trim();
    const newPassword = args.newPassword;

    // Basic input validation
    if (!email || !token || !newPassword) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Email, token, and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Password must be at least 8 characters.",
      });
    }

    // 1. Hash the raw token for comparison against the stored hash
    const tokenHash = await hashToken(token);

    // 2. Verify the token via internal mutation
    const result = await ctx.runMutation(
      internal.password.internals.verifyResetToken,
      { email, tokenHash },
    );

    if (!result) {
      throw new ConvexError({
        code: "INVALID_TOKEN",
        message: "This reset link is invalid or has expired. Please request a new one.",
      });
    }

    // 3. Look up the user to get the Clerk user ID
    const user = await ctx.runQuery(internal.password.queries.getUserByEmail, {
      email,
    });

    if (!user || !user.clerkUserId) {
      throw new ConvexError({
        code: "INVALID_TOKEN",
        message: "Unable to complete password reset. Please request a new link.",
      });
    }

    // 4. Update the password in Clerk via the Backend API
    const { getServiceKeyFromAction } = await import("../helpers/serviceKeys");
    const clerkSecretKey = await getServiceKeyFromAction(
      ctx,
      "integrations.clerk",
      "clerkSecretKey",
      "CLERK_SECRET_KEY",
    );
    if (!clerkSecretKey) {
      throw new ConvexError({
        code: "PASSWORD_UPDATE_FAILED",
        message: "Password reset is temporarily unavailable. Please try again later.",
      });
    }

    const clerkResponse = await fetch(
      `https://api.clerk.com/v1/users/${user.clerkUserId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword }),
      },
    );

    if (!clerkResponse.ok) {
      const errorBody = await clerkResponse.text();
      console.error(
        `[completePasswordReset] Clerk API error: ${clerkResponse.status} ${errorBody}`,
      );
      throw new ConvexError({
        code: "PASSWORD_UPDATE_FAILED",
        message: "Failed to update password. Please try again or request a new reset link.",
      });
    }

    // 5. Record the reset completion in ConvexPress
    await ctx.runMutation(
      internal.password.mutations.handlePasswordResetCompleted,
      {
        userId: result.userId,
        timestamp: Date.now(),
      },
    );

    return { success: true };
  },
});
