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

export const logoutHandler = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin") ?? "";
  const isProduction =
    process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const refreshToken = parseCookie(cookieHeader, "convexpress_refresh");
  if (refreshToken) {
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

  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", clearCookie("/auth"));
  headers.append("Set-Cookie", clearCookie("/auth/refresh"));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  });
});

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
