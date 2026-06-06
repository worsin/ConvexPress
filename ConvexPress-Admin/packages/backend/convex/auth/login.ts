/**
 * Auth System - Login HTTP Action
 *
 * Handles POST /auth/login
 * Accepts { email?, username?, password } and returns an access token
 * plus sets an HttpOnly refresh token cookie.
 *
 * Runs in Node.js runtime — has access to process.env and bcrypt.
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  signAccessToken,
  verifyPassword,
  generateRefreshToken,
  hashRefreshToken,
} from "./helpers";
import { authJsonResponse, getAllowedAuthOrigin } from "./httpSecurity";

export const loginHandler = httpAction(async (ctx, request) => {
  const allowedOrigin = getAllowedAuthOrigin(request.headers.get("origin"));
  if (allowedOrigin === null) {
    return authJsonResponse({ error: "Origin not allowed" }, 403, "");
  }

  let body: { email?: string; username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return authJsonResponse({ error: "Invalid JSON body" }, 400, allowedOrigin);
  }

  const password = body.password;
  const email = body.email?.trim().toLowerCase();
  const username = body.username?.trim();
  if (!password || (!email && !username)) {
    return authJsonResponse(
      { error: "Email/username and password are required" },
      400,
      allowedOrigin,
    );
  }

  const identifier = email ?? username!;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // ─── Rate limit / lockout check ──────────────────────────────────────────
  const isLocked = await ctx.runQuery(internal.auth.internals.checkLockout, {
    identifier,
    ip,
  });
  if (isLocked) {
    return authJsonResponse(
      { error: "Too many failed attempts. Try again later." },
      429,
      allowedOrigin,
    );
  }

  // ─── User lookup ──────────────────────────────────────────────────────────
  const user = await ctx.runQuery(internal.auth.internals.findLocalUser, {
    email,
    username,
  });

  if (!user || !user.passwordHash) {
    await ctx.runMutation(
      internal.authTracking.internals.recordFailedAttempt,
      {
        identifier,
        ip,
        reason: "invalid_credentials",
        app: "admin",
      },
    );
    return authJsonResponse({ error: "Invalid credentials" }, 401, allowedOrigin);
  }

  // ─── Password verification ────────────────────────────────────────────────
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await ctx.runMutation(
      internal.authTracking.internals.recordFailedAttempt,
      {
        identifier,
        ip,
        reason: "invalid_credentials",
        app: "admin",
      },
    );
    return authJsonResponse({ error: "Invalid credentials" }, 401, allowedOrigin);
  }

  // ─── Account status check ─────────────────────────────────────────────────
  if (user.status !== "active") {
    return authJsonResponse({ error: "Account is not active" }, 403, allowedOrigin);
  }

  if (!user.adminLoginAllowed) {
    await ctx.runMutation(
      internal.authTracking.internals.recordFailedAttempt,
      {
        identifier,
        ip,
        reason: "invalid_credentials",
        app: "admin",
      },
    );
    return authJsonResponse({ error: "Invalid credentials" }, 401, allowedOrigin);
  }

  // ─── Issue tokens ─────────────────────────────────────────────────────────
  const accessToken = await signAccessToken({
    userId: user._id,
    email: user.email,
    name: user.displayName ?? user.username ?? user.email,
  });

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = await hashRefreshToken(rawRefreshToken);
  const now = Date.now();
  const refreshExpiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  await ctx.runMutation(internal.auth.internals.createRefreshToken, {
    tokenHash,
    userId: user._id,
    expiresAt: refreshExpiresAt,
  });

  // ─── Record successful login ──────────────────────────────────────────────
  await ctx.runMutation(
    internal.authTracking.internals.recordSuccessfulLogin,
    {
      userId: user._id,
      app: "admin",
      ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    },
  );

  // ─── Build cookie ─────────────────────────────────────────────────────────
  const isProduction =
    process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;
  const cookieFlags = [
    `convexpress_refresh=${rawRefreshToken}`,
    "HttpOnly",
    "Path=/auth",
    `Max-Age=${7 * 24 * 60 * 60}`,
    ...(isProduction ? ["SameSite=None", "Secure"] : ["SameSite=Lax"]),
  ].join("; ");

  return authJsonResponse(
    {
      accessToken,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName ?? user.username ?? user.email,
      },
    },
    200,
    allowedOrigin,
    { "Set-Cookie": cookieFlags },
  );
});
