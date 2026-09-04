/**
 * Auth System - Token Refresh HTTP Action
 *
 * Handles POST /auth/refresh
 * Reads the HttpOnly convexpress_refresh cookie, validates the token,
 * rotates it (revoke old, issue new), and returns a fresh access token.
 *
 * Implements refresh token rotation — every successful refresh invalidates
 * the previous token and issues a new one.
 *
 * Runs in Node.js runtime — has access to process.env.
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "./helpers";
import {
  authJsonResponse,
  authNoContentResponse,
  getAllowedAuthOrigin,
} from "./httpSecurity";
import { readRefreshToken, wantsRefreshTokenInBody } from "./refreshTransport";

export const refreshHandler = httpAction(async (ctx, request) => {
  const allowedOrigin = getAllowedAuthOrigin(request.headers.get("origin"));
  if (allowedOrigin === null) {
    return authJsonResponse({ error: "Origin not allowed" }, 403, "");
  }

  // ─── Extract refresh token (desktop header first, then browser cookie) ───
  const presented = readRefreshToken(request.headers);
  const refreshToken = presented.token;

  if (!refreshToken) {
    return authNoContentResponse(allowedOrigin);
  }
  if ("invalid" in presented) {
    return authJsonResponse(
      { error: "Invalid or expired refresh token" },
      401,
      allowedOrigin,
    );
  }

  // ─── Validate token record ────────────────────────────────────────────────
  const tokenHash = await hashRefreshToken(refreshToken);
  const tokenRecord = await ctx.runQuery(
    internal.auth.internals.findRefreshToken,
    { tokenHash },
  );

  if (tokenRecord?.revokedAt) {
    // A rotated token presented again: revoke the whole family (reuse).
    await ctx.runMutation(internal.auth.internals.rotateRefreshToken, {
      tokenHash,
      nextTokenHash: `reuse:${tokenHash}`,
      userId: tokenRecord.userId,
      expiresAt: 0,
    });
  }
  if (
    !tokenRecord ||
    tokenRecord.revokedAt ||
    tokenRecord.expiresAt < Date.now()
  ) {
    return authJsonResponse(
      { error: "Invalid or expired refresh token" },
      401,
      allowedOrigin,
    );
  }

  // ─── Fetch user ───────────────────────────────────────────────────────────
  const user = await ctx.runQuery(internal.auth.internals.getLocalSessionUserById, {
    userId: tokenRecord.userId,
  });

  if (!user || user.status !== "active" || !user.adminLoginAllowed) {
    await ctx.runMutation(internal.auth.internals.revokeRefreshToken, {
      tokenHash,
    });
    return authJsonResponse(
      { error: "Invalid or expired refresh token" },
      401,
      allowedOrigin,
    );
  }

  // ─── Rotate token atomically (revoke old, issue new; reuse → family revoke)
  const newRawToken = generateRefreshToken();
  const newTokenHash = await hashRefreshToken(newRawToken);
  const refreshExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  const rotation = await ctx.runMutation(internal.auth.internals.rotateRefreshToken, {
    tokenHash,
    nextTokenHash: newTokenHash,
    userId: user._id,
    expiresAt: refreshExpiresAt,
  });
  if (!rotation.rotated) {
    return authJsonResponse(
      { error: "Invalid or expired refresh token" },
      401,
      allowedOrigin,
    );
  }

  const accessToken = await signAccessToken({
    userId: user._id,
    email: user.email,
    name: user.displayName ?? user.username ?? user.email,
  });

  // ─── Build cookie ─────────────────────────────────────────────────────────
  const isProduction =
    process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;
  const cookieFlags = [
    `convexpress_refresh=${newRawToken}`,
    "HttpOnly",
    "Path=/auth",
    `Max-Age=${7 * 24 * 60 * 60}`,
    ...(isProduction ? ["SameSite=None", "Secure"] : ["SameSite=Lax"]),
  ].join("; ");

  return authJsonResponse(
    {
      accessToken,
      expiresIn: 900,
      ...(wantsRefreshTokenInBody(request.headers)
        ? { refreshToken: newRawToken, refreshExpiresIn: 7 * 24 * 60 * 60 }
        : {}),
    },
    200,
    allowedOrigin,
    { "Set-Cookie": cookieFlags },
  );
});
