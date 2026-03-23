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

export const loginHandler = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin") ?? "";

  let body: { email?: string; username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
  }

  const { email, username, password } = body;
  if (!password || (!email && !username)) {
    return jsonResponse(
      { error: "Email/username and password are required" },
      400,
      origin,
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
    return jsonResponse(
      { error: "Too many failed attempts. Try again later." },
      429,
      origin,
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
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
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
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }

  // ─── Account status check ─────────────────────────────────────────────────
  if (user.status !== "active") {
    return jsonResponse({ error: "Account is not active" }, 403, origin);
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
    `smithharper_refresh=${rawRefreshToken}`,
    "HttpOnly",
    "Path=/auth/refresh",
    `Max-Age=${7 * 24 * 60 * 60}`,
    ...(isProduction ? ["SameSite=None", "Secure"] : ["SameSite=Lax"]),
  ].join("; ");

  return new Response(
    JSON.stringify({
      accessToken,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName ?? user.username ?? user.email,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieFlags,
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      },
    },
  );
});

// ─── Helper ───────────────────────────────────────────────────────────────────

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
