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

export const refreshHandler = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin") ?? "";

  // ─── Extract refresh token from cookie ───────────────────────────────────
  const cookieHeader = request.headers.get("cookie") ?? "";
  const refreshToken = parseCookie(cookieHeader, "convexpress_refresh");

  if (!refreshToken) {
    return jsonResponse({ error: "No refresh token" }, 401, origin);
  }

  // ─── Validate token record ────────────────────────────────────────────────
  const tokenHash = await hashRefreshToken(refreshToken);
  const tokenRecord = await ctx.runQuery(
    internal.auth.internals.findRefreshToken,
    { tokenHash },
  );

  if (
    !tokenRecord ||
    tokenRecord.revokedAt ||
    tokenRecord.expiresAt < Date.now()
  ) {
    return jsonResponse({ error: "Invalid or expired refresh token" }, 401, origin);
  }

  // ─── Fetch user ───────────────────────────────────────────────────────────
  const user = await ctx.runQuery(internal.auth.internals.getUserById, {
    userId: tokenRecord.userId,
  });

  if (!user || user.status !== "active") {
    return jsonResponse({ error: "User not found or inactive" }, 401, origin);
  }

  // ─── Rotate token (revoke old, issue new) ─────────────────────────────────
  await ctx.runMutation(internal.auth.internals.revokeRefreshToken, {
    tokenHash,
  });

  const accessToken = await signAccessToken({
    userId: user._id,
    email: user.email,
    name: user.displayName ?? user.username ?? user.email,
  });

  const newRawToken = generateRefreshToken();
  const newTokenHash = await hashRefreshToken(newRawToken);
  const refreshExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  await ctx.runMutation(internal.auth.internals.createRefreshToken, {
    tokenHash: newTokenHash,
    userId: user._id,
    expiresAt: refreshExpiresAt,
  });

  // ─── Build cookie ─────────────────────────────────────────────────────────
  const isProduction =
    process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;
  const cookieFlags = [
    `convexpress_refresh=${newRawToken}`,
    "HttpOnly",
    "Path=/auth/refresh",
    `Max-Age=${7 * 24 * 60 * 60}`,
    ...(isProduction ? ["SameSite=None", "Secure"] : ["SameSite=Lax"]),
  ].join("; ");

  return new Response(JSON.stringify({ accessToken, expiresIn: 900 }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieFlags,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function jsonResponse(data: object, status: number, origin: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
