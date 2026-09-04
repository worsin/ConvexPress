/**
 * Refresh-token transport.
 *
 * Browsers keep the refresh token in the HttpOnly `convexpress_refresh` cookie.
 * That cookie cannot work for the desktop app against a plain-http (LAN or
 * self-hosted) deployment: a cross-site fetch never sends a SameSite=Lax
 * cookie, and SameSite=None requires Secure, which http cannot set. The
 * desktop therefore opts into a header transport: it asks for the token in
 * the JSON body (`X-ConvexPress-Session: token`), keeps it in Electron's
 * OS-encrypted safeStorage, and presents it on `X-ConvexPress-Refresh`.
 */

import { isRefreshTokenShape, parseCookieValue } from "./inputLimits";

export const REFRESH_HEADER = "x-convexpress-refresh";
export const SESSION_MODE_HEADER = "x-convexpress-session";
export const REFRESH_COOKIE = "convexpress_refresh";

/** Header names the auth endpoints accept on cross-origin requests. */
export const AUTH_ALLOWED_HEADERS = "Authorization, Content-Type, X-ConvexPress-Refresh, X-ConvexPress-Session";

export type RefreshTokenSource = "header" | "cookie";

export function readRefreshToken(
  headers: Headers,
): { token: string; source: RefreshTokenSource } | { token: null; source: null } | { token: string; source: RefreshTokenSource; invalid: true } {
  const fromHeader = headers.get(REFRESH_HEADER)?.trim();
  if (fromHeader) {
    return isRefreshTokenShape(fromHeader)
      ? { token: fromHeader, source: "header" }
      : { token: fromHeader, source: "header", invalid: true };
  }
  const fromCookie = parseCookieValue(headers.get("cookie") ?? "", REFRESH_COOKIE);
  if (fromCookie) {
    return isRefreshTokenShape(fromCookie)
      ? { token: fromCookie, source: "cookie" }
      : { token: fromCookie, source: "cookie", invalid: true };
  }
  return { token: null, source: null };
}

/** True when the client asked to receive the refresh token in the JSON body. */
export function wantsRefreshTokenInBody(headers: Headers): boolean {
  return headers.get(SESSION_MODE_HEADER)?.trim().toLowerCase() === "token";
}
