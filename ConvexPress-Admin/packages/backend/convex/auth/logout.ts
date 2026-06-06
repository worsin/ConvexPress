/**
 * Auth System - Logout HTTP Action
 *
 * Handles POST /auth/logout
 * Clears the convexpress_refresh cookie by setting Max-Age=0.
 *
 * Revokes the refresh token server-side when the browser sends it.
 *
 * Runs in Node.js runtime — has access to process.env.
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { hashRefreshToken } from "./helpers";
import {
  authJsonResponse,
  createAuthHeaders,
  getAllowedAuthOrigin,
} from "./httpSecurity";
import { isRefreshTokenShape, parseCookieValue } from "./inputLimits";

export const logoutHandler = httpAction(async (ctx, request) => {
  const allowedOrigin = getAllowedAuthOrigin(request.headers.get("origin"));
  if (allowedOrigin === null) {
    return authJsonResponse({ error: "Origin not allowed" }, 403, "");
  }

  const isProduction =
    process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const refreshToken = parseCookieValue(cookieHeader, "convexpress_refresh");
  if (refreshToken && isRefreshTokenShape(refreshToken)) {
    const tokenHash = await hashRefreshToken(refreshToken);
    await ctx.runMutation(internal.auth.internals.revokeRefreshToken, {
      tokenHash,
    });
  }

  const clearCookie = (path: string) => [
    "convexpress_refresh=",
    "HttpOnly",
    `Path=${path}`,
    "Max-Age=0",
    ...(isProduction ? ["SameSite=None", "Secure"] : ["SameSite=Lax"]),
  ].join("; ");

  const headers = createAuthHeaders(allowedOrigin);
  headers.append("Set-Cookie", clearCookie("/auth"));
  headers.append("Set-Cookie", clearCookie("/auth/refresh"));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  });
});
