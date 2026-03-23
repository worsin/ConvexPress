/**
 * Auth System - Logout HTTP Action
 *
 * Handles POST /auth/logout
 * Clears the smithharper_refresh cookie by setting Max-Age=0.
 *
 * Note: This clears the browser cookie but does NOT revoke the token
 * server-side (token expires naturally after 7 days). For immediate
 * server-side revocation, the client should also call a dedicated
 * revoke endpoint if needed.
 *
 * Runs in Node.js runtime — has access to process.env.
 */

import { httpAction } from "../_generated/server";

export const logoutHandler = httpAction(async (_, request) => {
  const origin = request.headers.get("origin") ?? "";
  const isProduction =
    process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;

  const clearCookie = [
    "smithharper_refresh=",
    "HttpOnly",
    "Path=/auth/refresh",
    "Max-Age=0",
    ...(isProduction ? ["SameSite=None", "Secure"] : ["SameSite=Lax"]),
  ].join("; ");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearCookie,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
});
