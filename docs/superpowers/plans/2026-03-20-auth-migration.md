# Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WorkOS AuthKit with custom Convex JWT auth (admin) + Clerk (website), preserving all existing backend permission infrastructure.

**Architecture:** Two JWT providers in one Convex `auth.config.ts` — a custom local issuer for admin username/password auth, and Clerk for website public auth. Single `users` table with `authSource` field. The `getCurrentUser()` function in `permissions.ts` is the single chokepoint — update it once, and all 100+ backend files keep working.

**Tech Stack:** Convex, jose (JWT), bcryptjs (passwords), svix (webhooks), @clerk/tanstack-react-start, @clerk/clerk-react, ConvexProviderWithAuth

**Spec:** `docs/superpowers/specs/2026-03-20-auth-migration-design.md`

---

## Phase 1: Backend Auth Foundation (Admin)

This phase builds the custom JWT auth system in the Convex backend. No frontend changes yet — the admin app will be broken until Phase 2. Deploy with `--typecheck=disable` throughout.

### Task 1: Schema Changes — Users Table

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/users.ts`

- [ ] **Step 1: Add new auth fields and indexes to users schema**

Replace the WorkOS-synced fields section and add new auth fields:

```typescript
// Replace:
//   workosUserId: v.string(),
// With:
    // authSource is optional during migration — backfill sets it on existing users
    authSource: v.optional(v.union(v.literal("local"), v.literal("clerk"))),
    passwordHash: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    // Keep workosUserId during grace period (optional, for migration)
    workosUserId: v.optional(v.string()),
```

Update indexes — remove `by_workosUserId` as required index, add new ones:

```typescript
// Remove:
//   .index("by_workosUserId", ["workosUserId"])
// Add:
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_authSource", ["authSource"])
    // Keep workosUserId index as optional during grace period
    .index("by_workosUserId", ["workosUserId"])
```

Note: `workosUserId` changes from required `v.string()` to `v.optional(v.string())`. This is a breaking schema change — existing user documents have this field populated, so the data is compatible (optional accepts existing values). But the index may need data backfill for the new required `authSource` field on existing users.

- [ ] **Step 2: Create refresh tokens schema**

Create file `ConvexPress-Admin/packages/backend/convex/schema/auth.ts`:

```typescript
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const authTables = {
  refreshTokens: defineTable({
    tokenHash: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"]),
};
```

- [ ] **Step 3: Register auth tables in schema hub**

Modify `ConvexPress-Admin/packages/backend/convex/schema.ts` — add import and spread:

```typescript
import { authTables } from "./schema/auth";
// ... in defineSchema:
  ...authTables,
```

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/schema/users.ts ConvexPress-Admin/packages/backend/convex/schema/auth.ts ConvexPress-Admin/packages/backend/convex/schema.ts
git commit -m "feat(schema): add authSource, clerkUserId, passwordHash fields and refreshTokens table"
```

---

### Task 2: Remove WorkOS Convex Component

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/convex.config.ts`
- Modify: `ConvexPress-Admin/packages/backend/package.json`

- [ ] **Step 1: Remove WorkOS from convex.config.ts**

Replace entire file:

```typescript
import { defineApp } from "convex/server";

const app = defineApp();

export default app;
```

- [ ] **Step 2: Remove `@convex-dev/workos-authkit` from backend package.json**

```bash
cd ConvexPress-Admin/packages/backend && bun remove @convex-dev/workos-authkit
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/convex.config.ts ConvexPress-Admin/packages/backend/package.json
git commit -m "feat(backend): remove WorkOS AuthKit Convex component"
```

---

### Task 3: New Auth Config — Dual Provider

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/auth.config.ts`

- [ ] **Step 1: Replace auth.config.ts with dual-provider config**

```typescript
export default {
  providers: [
    {
      // Admin: custom JWT provider (explicit JWKS URL, not OIDC discovery)
      type: "customJwt" as const,
      issuer: "smithharper-admin",
      algorithm: "ES256" as const,
      jwks: `${process.env.AUTH_ISSUER_URL}/.well-known/jwks.json`,
    },
    {
      // Website: Clerk auth
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth.config.ts
git commit -m "feat(auth): dual-provider auth config for local admin + Clerk website"
```

---

### Task 4: JWT Signing & Password Utilities

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/helpers.ts`

- [ ] **Step 1: Install dependencies in backend package**

```bash
cd ConvexPress-Admin/packages/backend && bun add jose bcryptjs && bun add -d @types/bcryptjs
```

- [ ] **Step 2: Create auth helpers**

Create `ConvexPress-Admin/packages/backend/convex/auth/helpers.ts`:

```typescript
import { importPKCS8, exportJWK, SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// ─── Constants ───────────────────────────────────────────────────────────────

const ALG = "ES256";
const ISSUER = "smithharper-admin";
const AUDIENCE = "smithharper-admin";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_BYTES = 32;
const BCRYPT_COST = 12;

// ─── JWT Signing ─────────────────────────────────────────────────────────────

/**
 * Sign an access token JWT for an admin user.
 * Must run in a Convex action (needs process.env).
 */
export async function signAccessToken(payload: {
  userId: string;
  email: string;
  name: string;
}): Promise<string> {
  const privateKeyPem = process.env.AUTH_PRIVATE_KEY!;
  const privateKey = await importPKCS8(privateKeyPem, ALG);

  return new SignJWT({
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(privateKey);
}

/**
 * Get the JWKS (public key) for JWT validation.
 * Returns a JSON-serializable JWKS object.
 */
export async function getJWKS(): Promise<{ keys: object[] }> {
  const privateKeyPem = process.env.AUTH_PRIVATE_KEY!;
  const privateKey = await importPKCS8(privateKeyPem, ALG);
  const publicJwk = await exportJWK(privateKey);

  // Remove private key components, keep only public
  const { d, ...publicOnly } = publicJwk as Record<string, unknown>;

  return {
    keys: [
      {
        ...publicOnly,
        alg: ALG,
        use: "sig",
        kid: "smithharper-admin-1",
      },
    ],
  };
}

// ─── Password Hashing ────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Refresh Token ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random refresh token.
 */
export function generateRefreshToken(): string {
  const bytes = new Uint8Array(REFRESH_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash a refresh token for storage (using SHA-256).
 */
export async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/package.json ConvexPress-Admin/packages/backend/convex/auth/helpers.ts
git commit -m "feat(auth): JWT signing, bcrypt password, and refresh token utilities"
```

---

### Task 5: Login HTTP Action

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/login.ts`

- [ ] **Step 1: Create login HTTP action**

Create `ConvexPress-Admin/packages/backend/convex/auth/login.ts`:

```typescript
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  signAccessToken,
  verifyPassword,
  generateRefreshToken,
  hashRefreshToken,
} from "./helpers";

/**
 * POST /auth/login
 *
 * Accepts: { email: string, password: string } OR { username: string, password: string }
 * Returns: { accessToken: string, expiresIn: number }
 * Sets: httpOnly refresh token cookie
 */
export const loginHandler = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin") ?? "";

  // Parse body
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

  // Check lockout before credential validation
  const identifier = email ?? username!;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const isLocked = await ctx.runQuery(
    internal.auth.internals.checkLockout,
    { identifier, ip },
  );
  if (isLocked) {
    return jsonResponse(
      { error: "Too many failed attempts. Try again later." },
      429,
      origin,
    );
  }

  // Look up user
  const user = await ctx.runQuery(
    internal.auth.internals.findLocalUser,
    { email, username },
  );

  if (!user || !user.passwordHash) {
    // Record failed attempt
    await ctx.runMutation(internal.authTracking.internals.recordFailedAttempt, {
      identifier,
      ip,
      reason: "invalid_credentials",
      app: "admin",
    });
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }

  // Verify password
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await ctx.runMutation(internal.authTracking.internals.recordFailedAttempt, {
      identifier,
      ip,
      reason: "invalid_credentials",
      app: "admin",
    });
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }

  // Check account status
  if (user.status !== "active") {
    return jsonResponse({ error: "Account is not active" }, 403, origin);
  }

  // Sign access token
  const accessToken = await signAccessToken({
    userId: user._id,
    email: user.email,
    name: user.displayName ?? user.username ?? user.email,
  });

  // Create refresh token
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = await hashRefreshToken(rawRefreshToken);
  const now = Date.now();
  const refreshExpiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  await ctx.runMutation(internal.auth.internals.createRefreshToken, {
    tokenHash,
    userId: user._id,
    expiresAt: refreshExpiresAt,
  });

  // Record successful login
  await ctx.runMutation(internal.authTracking.internals.recordSuccessfulLogin, {
    userId: user._id,
    app: "admin",
    ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  // Set refresh token as httpOnly cookie
  const isProduction = process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;
  const cookieFlags = [
    `smithharper_refresh=${rawRefreshToken}`,
    "HttpOnly",
    `Path=/auth/refresh`,
    `Max-Age=${7 * 24 * 60 * 60}`,
    // SameSite=None requires Secure. In dev without HTTPS, use Lax.
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
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/login.ts
git commit -m "feat(auth): login HTTP action with credential validation and JWT issuance"
```

---

### Task 6: Token Refresh HTTP Action

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/refresh.ts`

- [ ] **Step 1: Create refresh HTTP action**

Create `ConvexPress-Admin/packages/backend/convex/auth/refresh.ts`:

```typescript
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "./helpers";

/**
 * POST /auth/refresh
 *
 * Reads refresh token from httpOnly cookie.
 * Returns new access token + rotates refresh token.
 */
export const refreshHandler = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin") ?? "";

  // Parse refresh token from cookie
  const cookieHeader = request.headers.get("cookie") ?? "";
  const refreshToken = parseCookie(cookieHeader, "smithharper_refresh");

  if (!refreshToken) {
    return jsonResponse({ error: "No refresh token" }, 401, origin);
  }

  // Hash and look up
  const tokenHash = await hashRefreshToken(refreshToken);
  const tokenRecord = await ctx.runQuery(
    internal.auth.internals.findRefreshToken,
    { tokenHash },
  );

  if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < Date.now()) {
    return jsonResponse({ error: "Invalid or expired refresh token" }, 401, origin);
  }

  // Look up user
  const user = await ctx.runQuery(
    internal.auth.internals.getUserById,
    { userId: tokenRecord.userId },
  );

  if (!user || user.status !== "active") {
    return jsonResponse({ error: "User not found or inactive" }, 401, origin);
  }

  // Revoke old refresh token
  await ctx.runMutation(internal.auth.internals.revokeRefreshToken, {
    tokenHash,
  });

  // Issue new access token
  const accessToken = await signAccessToken({
    userId: user._id,
    email: user.email,
    name: user.displayName ?? user.username ?? user.email,
  });

  // Rotate refresh token
  const newRawToken = generateRefreshToken();
  const newTokenHash = await hashRefreshToken(newRawToken);
  const now = Date.now();
  const refreshExpiresAt = now + 7 * 24 * 60 * 60 * 1000;

  await ctx.runMutation(internal.auth.internals.createRefreshToken, {
    tokenHash: newTokenHash,
    userId: user._id,
    expiresAt: refreshExpiresAt,
  });

  const isProduction = process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;
  const cookieFlags = [
    `smithharper_refresh=${newRawToken}`,
    "HttpOnly",
    `Path=/auth/refresh`,
    `Max-Age=${7 * 24 * 60 * 60}`,
    // SameSite=None requires Secure. In dev without HTTPS, use Lax.
    ...(isProduction ? ["SameSite=None", "Secure"] : ["SameSite=Lax"]),
  ].join("; ");

  return new Response(
    JSON.stringify({
      accessToken,
      expiresIn: 900,
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
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/refresh.ts
git commit -m "feat(auth): token refresh HTTP action with rotation"
```

---

### Task 7: JWKS Endpoint

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/jwks.ts`

- [ ] **Step 1: Create JWKS HTTP action**

Create `ConvexPress-Admin/packages/backend/convex/auth/jwks.ts`:

```typescript
import { httpAction } from "../_generated/server";
import { getJWKS } from "./helpers";

/**
 * GET /.well-known/jwks.json
 *
 * Returns the public key for admin JWT validation.
 * Convex uses this endpoint to verify JWTs.
 */
export const jwksHandler = httpAction(async () => {
  const jwks = await getJWKS();

  return new Response(JSON.stringify(jwks), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/jwks.ts
git commit -m "feat(auth): JWKS endpoint for admin JWT public key"
```

---

### Task 8: Auth Internal Functions

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/internals.ts`

- [ ] **Step 1: Create internal query/mutation functions used by the HTTP actions**

Create `ConvexPress-Admin/packages/backend/convex/auth/internals.ts`:

```typescript
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ─── User Lookup ─────────────────────────────────────────────────────────────

/**
 * Find a local auth user by email or username.
 */
export const findLocalUser = internalQuery({
  args: {
    email: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user = null;

    if (args.email) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .first();
    }

    if (!user && args.username) {
      user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", args.username!))
        .first();
    }

    // Only return local auth users
    if (user && user.authSource !== "local") return null;

    return user;
  },
});

/**
 * Get user by Convex _id.
 */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// ─── Lockout Check ───────────────────────────────────────────────────────────

/**
 * Check if an identifier (email/username) or IP is locked out.
 */
export const checkLockout = internalQuery({
  args: {
    identifier: v.string(),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    // Per-account: 5 failures in 15 minutes
    const accountFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_email", (q) =>
        q.eq("email", args.identifier).gt("attemptedAt", fifteenMinutesAgo),
      )
      .collect();

    if (accountFailures.length >= 5) return true;

    // Per-IP: 20 failures in 5 minutes
    const ipFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_ip", (q) =>
        q.eq("ip", args.ip).gt("attemptedAt", fiveMinutesAgo),
      )
      .collect();

    if (ipFailures.length >= 20) return true;

    return false;
  },
});

// ─── Refresh Token CRUD ──────────────────────────────────────────────────────

export const createRefreshToken = internalMutation({
  args: {
    tokenHash: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("refreshTokens", {
      tokenHash: args.tokenHash,
      userId: args.userId,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

export const findRefreshToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
  },
});

export const revokeRefreshToken = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (token) {
      await ctx.db.patch(token._id, { revokedAt: Date.now() });
    }
  },
});

// ─── Password Management ─────────────────────────────────────────────────────

/**
 * Set password hash for a user. Used by setup/wizard.
 */
export const setPasswordHash = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      lastPasswordChangedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Add missing auth tracking internal functions**

The login handler calls `internal.authTracking.internals.recordFailedAttempt` and `internal.authTracking.internals.recordSuccessfulLogin`, which don't exist. Add them to `ConvexPress-Admin/packages/backend/convex/authTracking/internals.ts`:

```typescript
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const recordFailedAttempt = internalMutation({
  args: {
    identifier: v.string(),
    ip: v.string(),
    reason: v.string(),
    app: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("failedLoginAttempts", {
      email: args.identifier,
      ip: args.ip,
      reason: args.reason,
      app: args.app,
      attemptedAt: Date.now(),
    });
  },
});

export const recordSuccessfulLogin = internalMutation({
  args: {
    userId: v.id("users"),
    app: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      lastLoginAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

Verify the `failedLoginAttempts` table schema in `convex/schema/authTracking.ts` to confirm field names match. The indexes used by `checkLockout` are `by_email` (fields: `["email", "attemptedAt"]`) and `by_ip` (fields: `["ip", "attemptedAt"]`).

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/internals.ts
git commit -m "feat(auth): internal functions for user lookup, lockout, and refresh tokens"
```

---

### Task 9: Register Auth Routes in http.ts

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/http.ts`

- [ ] **Step 1: Remove WorkOS routes, add auth routes**

At the top of `http.ts`:
- Remove: `import { authKit } from "./auth";`
- Remove: `authKit.registerRoutes(http);`
- Add imports for new auth handlers:

```typescript
import { loginHandler } from "./auth/login";
import { refreshHandler } from "./auth/refresh";
import { jwksHandler } from "./auth/jwks";
```

Add the new routes (after the http router is created, before or after the API routes):

```typescript
import { loginHandler } from "./auth/login";
import { refreshHandler } from "./auth/refresh";
import { logoutHandler } from "./auth/logout";
import { jwksHandler } from "./auth/jwks";

// ─── Auth Routes ────────────────────────────────────────────────────────────
http.route({
  path: "/auth/login",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/auth/login",
  method: "POST",
  handler: loginHandler,
});
http.route({
  path: "/auth/refresh",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/auth/refresh",
  method: "POST",
  handler: refreshHandler,
});
http.route({
  path: "/auth/logout",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/auth/logout",
  method: "POST",
  handler: logoutHandler,
});
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: jwksHandler,
});
```

Also create `ConvexPress-Admin/packages/backend/convex/auth/logout.ts`:

```typescript
import { httpAction } from "../_generated/server";

/**
 * POST /auth/logout
 * Clears the httpOnly refresh cookie (can't be done client-side).
 */
export const logoutHandler = httpAction(async (_, request) => {
  const origin = request.headers.get("origin") ?? "";
  const isProduction = process.env.AUTH_ISSUER_URL?.startsWith("https://") ?? false;

  const clearCookie = [
    "smithharper_refresh=",
    "HttpOnly",
    "Path=/auth/refresh",
    "Max-Age=0",
    // SameSite=None requires Secure. In dev without HTTPS, use Lax.
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
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/http.ts
git commit -m "feat(auth): register login, refresh, and JWKS HTTP routes"
```

---

### Task 10: Update `getCurrentUser()` — The Critical Chokepoint

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts`

- [ ] **Step 1: Update getCurrentUser to support dual auth**

In `permissions.ts`, update the `getCurrentUser` function and the `UserDoc` type:

Update `UserDoc` type — add new fields, make `workosUserId` optional:

```typescript
// In the UserDoc type, change:
//   workosUserId: string;
// To:
  authSource: "local" | "clerk";
  passwordHash?: string;
  clerkUserId?: string;
  workosUserId?: string;  // Grace period — will be removed
```

Replace the `getCurrentUser` function body:

```typescript
const ADMIN_ISSUER = "smithharper-admin";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // tokenIdentifier format: "issuer|subject"
  const isAdminAuth = identity.tokenIdentifier.startsWith(ADMIN_ISSUER + "|");

  if (isAdminAuth) {
    // Admin local auth — subject is Convex user _id (direct fetch, O(1))
    const user = await ctx.db.get(identity.subject as Id<"users">);
    return user as UserDoc | null;
  }

  // Clerk auth — subject is Clerk user ID
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) =>
      q.eq("clerkUserId", identity.subject),
    )
    .unique();

  // Fallback: check workosUserId for migration grace period
  if (!user) {
    const legacyUser = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) =>
        q.eq("workosUserId", identity.subject),
      )
      .first();
    return legacyUser as UserDoc | null;
  }

  return user as UserDoc | null;
}
```

Also update the JSDoc comment at the top to remove "WorkOS" references.

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts
git commit -m "feat(auth): update getCurrentUser for dual-provider auth (admin JWT + Clerk)"
```

---

### Task 11: Update `checkAdminAccess` and `users.ts`

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/users.ts`

- [ ] **Step 1: Rewrite checkAdminAccess to use getCurrentUser()**

Read the current `users.ts` file. Find the `checkAdminAccess` query and replace its user lookup (which directly uses `by_workosUserId`) with a call to `getCurrentUser()` from the permissions helper:

```typescript
import { getCurrentUser } from "./helpers/permissions";

export const checkAdminAccess = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // Check via capability system first (new system)
    let hasAccess = false;
    if (user.roleId) {
      const role = await ctx.db.get(user.roleId);
      if (role && role.status === "active" && role.type === "internal") {
        hasAccess = true;
      }
    }
    // Fallback to legacy internalRole
    if (!hasAccess && user.internalRole) {
      const adminRoles = ["admin", "editor", "author", "contributor"];
      hasAccess = adminRoles.includes(user.internalRole);
    }

    return hasAccess;
  },
});
```

Also update any other functions in `users.ts` that directly use `by_workosUserId`.

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/users.ts
git commit -m "fix(auth): rewrite checkAdminAccess to use getCurrentUser instead of workosUserId"
```

---

### Task 12: Delete WorkOS auth.ts and Update Remaining Backend Files

**Files:**
- Delete: `ConvexPress-Admin/packages/backend/convex/auth.ts`
- Modify: 18+ backend files that reference `by_workosUserId` or import from `./auth`

- [ ] **Step 1: Delete the WorkOS auth.ts file**

Delete `ConvexPress-Admin/packages/backend/convex/auth.ts` (the WorkOS webhook handler).

- [ ] **Step 2: Update all remaining files that use `by_workosUserId`**

For each of these files, replace `.withIndex("by_workosUserId", ...)` lookups with the appropriate pattern:

**Pattern A — If in an authenticated context (has `ctx` with auth):**
Use `getCurrentUser(ctx)` from `../helpers/permissions`.

**Pattern B — If looking up a user by known user ID:**
Use `ctx.db.get(userId)` directly (Convex `_id` doesn't change).

**Pattern C — If looking up by WorkOS ID specifically (e.g., webhook handlers):**
These are WorkOS-specific and should be deleted or rewritten for Clerk.

Files to update (grep for `by_workosUserId` and `workosUserId` in each, apply the right pattern):

- `convex/authTracking/mutations.ts` — Pattern A (rewrite `getOrCreateCurrentUserForLogin`)
- `convex/authTracking/internals.ts` — Pattern A/B
- `convex/registration/internals.ts` — Pattern C (rewrite for Clerk webhook flow)
- `convex/profiles/queries.ts` — Pattern A
- `convex/profiles/internals.ts` — Pattern A/B
- `convex/password/queries.ts` — Pattern A
- `convex/password/internals.ts` — Pattern B
- `convex/password/actions.ts` — Pattern B
- `convex/notifications/internals.ts` — Pattern B
- `convex/comments/internals.ts` — Pattern B
- `convex/feeds/internals.ts` — Pattern B
- `convex/emails/internals.ts` — Pattern B
- `convex/search/internals.ts` — Pattern B
- `convex/sitemaps/helpers/auth.ts` — Pattern A
- `convex/auditLogs/internals.ts` — Pattern B
- `convex/api/internals.ts` — Pattern A
- `convex/airtableSync/_internal.ts` — Pattern B
- `convex/wordpressSync/phases/users.ts` — Rewrite for local auth
- `convex/wordpressSync/phases/menus.ts` — Pattern B
- `convex/helpers/auth.ts` — Update deprecated helpers

**This is the largest single task.** The agent handling this should read each file, find the `workosUserId` usage, and apply the correct fix. Most are simple index swap or replacement with `getCurrentUser()`.

- [ ] **Step 3: Commit**

```bash
git add -A ConvexPress-Admin/packages/backend/convex/
git commit -m "refactor(auth): remove all workosUserId references from backend functions"
```

---

### Task 13: Backfill Migration — Add authSource to Existing Users

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/migrations.ts`

- [ ] **Step 1: Create a migration mutation to backfill authSource**

Create `ConvexPress-Admin/packages/backend/convex/auth/migrations.ts`:

```typescript
import { internalMutation } from "../_generated/server";

/**
 * Backfill: Set authSource="local" on all existing users that have workosUserId.
 * Run once after deploying the schema change.
 *
 * Call from Convex Dashboard: internal.auth.migrations.backfillAuthSource
 */
export const backfillAuthSource = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let updated = 0;

    for (const user of users) {
      if (!user.authSource) {
        await ctx.db.patch(user._id, {
          authSource: "local",
          updatedAt: Date.now(),
        });
        updated++;
      }
    }

    return { updated, total: users.length };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/migrations.ts
git commit -m "feat(auth): migration to backfill authSource on existing users"
```

---

## Phase 2: Admin Frontend — Local Auth

This phase replaces WorkOS on the admin frontend with the custom JWT auth system.

### Task 14: Remove WorkOS Packages from Admin Frontend

**Files:**
- Modify: `ConvexPress-Admin/apps/web/package.json`

- [ ] **Step 1: Remove WorkOS packages**

```bash
cd ConvexPress-Admin/apps/web && bun remove @workos-inc/authkit-react @convex-dev/workos
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/package.json
git commit -m "chore(admin): remove WorkOS packages"
```

---

### Task 15: Create Local Auth Hook

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/hooks/useLocalAuth.ts`

- [ ] **Step 1: Create the custom auth hook for ConvexProviderWithAuth**

Create `ConvexPress-Admin/apps/web/src/hooks/useLocalAuth.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";

interface AuthState {
  accessToken: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  user: { id: string; email: string; displayName: string } | null;
}

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

/**
 * Custom auth hook for ConvexProviderWithAuth.
 * Manages JWT access tokens + httpOnly refresh cookie.
 */
export function useLocalAuth() {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    expiresAt: null,
    isLoading: true,
    user: null,
  });
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Attempt to refresh on mount (page load / refresh)
  useEffect(() => {
    attemptRefresh();
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const attemptRefresh = useCallback(async () => {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setTokens(data.accessToken, data.expiresIn);
      } else {
        setState((s) => ({ ...s, isLoading: false, accessToken: null, user: null }));
      }
    } catch {
      setState((s) => ({ ...s, isLoading: false, accessToken: null, user: null }));
    }
  }, []);

  const setTokens = useCallback((accessToken: string, expiresIn: number) => {
    // Decode JWT payload (no verification needed client-side)
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    const expiresAt = Date.now() + expiresIn * 1000;

    setState({
      accessToken,
      expiresAt,
      isLoading: false,
      user: {
        id: payload.sub,
        email: payload.email,
        displayName: payload.name,
      },
    });

    // Schedule refresh 1 minute before expiry
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    const refreshIn = (expiresIn - 60) * 1000;
    if (refreshIn > 0) {
      refreshTimeoutRef.current = setTimeout(attemptRefresh, refreshIn);
    }
  }, [attemptRefresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const isEmail = identifier.includes("@");
    const body = isEmail
      ? { email: identifier, password }
      : { username: identifier, password };

    const response = await fetch(`${CONVEX_SITE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Login failed" }));
      throw new Error(error.error ?? "Login failed");
    }

    const data = await response.json();
    setTokens(data.accessToken, data.expiresIn);
    return data.user;
  }, [setTokens]);

  const logout = useCallback(async () => {
    setState({
      accessToken: null,
      expiresAt: null,
      isLoading: false,
      user: null,
    });
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    // httpOnly cookies can't be cleared via JS — call the logout endpoint
    // which clears the cookie in its response headers
    try {
      await fetch(`${CONVEX_SITE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort — cookie will expire naturally if this fails
    }
  }, []);

  // Use a ref to avoid stale closure in fetchAccessToken
  const accessTokenRef = useRef<string | null>(null);
  useEffect(() => {
    accessTokenRef.current = state.accessToken;
  }, [state.accessToken]);

  // ConvexProviderWithAuth expects this shape from the hook:
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (forceRefreshToken) {
        await attemptRefresh();
      }
      // Always read from ref to get the latest token (avoids stale closure)
      return accessTokenRef.current;
    },
    [attemptRefresh],
  );

  return {
    // These 3 fields are what ConvexProviderWithAuth needs:
    isLoading: state.isLoading,
    isAuthenticated: !!state.accessToken,
    fetchAccessToken,
    // These are extras for our LocalAuthContext:
    user: state.user,
    login,
    logout,
  };
}
```

- [ ] **Step 2: Create auth context for sharing auth state**

Create `ConvexPress-Admin/apps/web/src/lib/local-auth-context.tsx`:

```typescript
import { createContext, useContext, type ReactNode } from "react";

interface LocalAuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: { id: string; email: string; displayName: string } | null;
  login: (identifier: string, password: string) => Promise<unknown>;
  logout: () => void;
}

const LocalAuthContext = createContext<LocalAuthContextValue | null>(null);

export function LocalAuthProvider({
  value,
  children,
}: {
  value: LocalAuthContextValue;
  children: ReactNode;
}) {
  return (
    <LocalAuthContext.Provider value={value}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuthContext() {
  const ctx = useContext(LocalAuthContext);
  if (!ctx) throw new Error("useLocalAuthContext must be used within LocalAuthProvider");
  return ctx;
}
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/hooks/useLocalAuth.ts ConvexPress-Admin/apps/web/src/lib/local-auth-context.tsx
git commit -m "feat(admin): local auth hook and context for JWT auth"
```

---

### Task 16: Replace Admin main.tsx Provider Stack

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/main.tsx`

- [ ] **Step 1: Replace the provider stack**

Replace entire `main.tsx`:

```typescript
import { env } from "@convexpress-admin/env/web";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

import Loader from "./components/loader";
import { useLocalAuth } from "./hooks/useLocalAuth";
import { LocalAuthProvider } from "./lib/local-auth-context";
import { routeTree } from "./routeTree.gen";
import ReactDOM from "react-dom/client";

const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => <Loader />,
  context: {},
  Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
    const auth = useLocalAuth();

    return (
      // IMPORTANT: useAuth must be a stable hook reference, NOT an inline arrow.
      // useLocalAuth already returns { isLoading, isAuthenticated, fetchAccessToken }
      // which is exactly what ConvexProviderWithAuth expects.
      <ConvexProviderWithAuth client={convex} useAuth={useLocalAuth}>
        <LocalAuthProvider value={auth}>
          {children}
        </LocalAuthProvider>
      </ConvexProviderWithAuth>
    );
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
```

- [ ] **Step 2: Update env types**

In `ConvexPress-Admin/apps/web/src/env.d.ts` — remove `VITE_WORKOS_CLIENT_ID` and `VITE_WORKOS_REDIRECT_URI` type declarations, add `VITE_CONVEX_SITE_URL`.

Also update `ConvexPress-Admin/packages/env/src/web.ts` if it defines WorkOS env vars.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/main.tsx ConvexPress-Admin/apps/web/src/env.d.ts
git commit -m "feat(admin): replace WorkOS provider stack with local auth"
```

---

### Task 17: Rewrite Admin Auth Pages

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/index.tsx`
- Delete: `ConvexPress-Admin/apps/web/src/routes/callback.tsx`

- [ ] **Step 1: Rewrite `_authenticated.tsx`**

Replace the file to use `useConvexAuth` and `useLocalAuthContext`:

```typescript
import { useState } from "react";
import { api } from "@backend/convex/_generated/api";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";

import Loader from "@/components/loader";
import { useLocalAuthContext } from "@/lib/local-auth-context";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const { isLoading: authLoading, login, isAuthenticated: hasToken } = useLocalAuthContext();
  const adminAccess = useQuery(
    api.users.checkAdminAccess,
    isAuthenticated ? {} : "skip",
  );

  if (authLoading || convexLoading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!hasToken) {
    return <LoginForm onLogin={login} />;
  }

  if (adminAccess === undefined) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!adminAccess) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access the admin panel.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function LoginForm({ onLogin }: { onLogin: (id: string, pw: string) => Promise<unknown> }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(identifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-svh items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">SmithHarper Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to continue
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="identifier" className="text-sm font-medium">
              Email or Username
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Simplify `routes/index.tsx`**

Replace to redirect authenticated users to dashboard:

```typescript
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
```

- [ ] **Step 3: Delete `routes/callback.tsx`**

Delete the file — no more WorkOS callback.

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/routes/_authenticated.tsx ConvexPress-Admin/apps/web/src/routes/index.tsx
git rm ConvexPress-Admin/apps/web/src/routes/callback.tsx
git commit -m "feat(admin): rewrite auth pages for local JWT auth"
```

---

### Task 18: Update Admin Header & User Menu

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/components/header.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/layout/UserMenu.tsx`

- [ ] **Step 1: Update header.tsx**

Replace `@workos-inc/authkit-react` imports with `useLocalAuthContext`. Replace `useAuth()` calls with `useLocalAuthContext()`. Replace `signOut()` with `logout()`.

- [ ] **Step 2: Update UserMenu.tsx**

Same pattern — replace WorkOS `useAuth()` with `useLocalAuthContext()`.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/header.tsx ConvexPress-Admin/apps/web/src/components/layout/UserMenu.tsx
git commit -m "feat(admin): update header and user menu for local auth"
```

---

### Task 19: Update Remaining Admin Frontend WorkOS References

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/lib/auth-context.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/registration/InviteUserForm.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/password/ResetPasswordButton.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/users/user-form.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/users/avatar.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/lib/users/types.ts`
- Modify: `ConvexPress-Admin/apps/web/src/lib/users/constants.ts`
- Modify: `ConvexPress-Admin/apps/web/src/lib/events/types.ts`
- Modify: `ConvexPress-Admin/apps/web/src/components/dashboard/widgets/SystemHealthWidget.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/users/$userId/edit.tsx`

- [ ] **Step 1: Update auth-context.tsx**

The `AuthProvider` in `lib/auth-context.tsx` wraps the authenticated admin shell. It currently may reference WorkOS for user data. Update it to source user data from Convex queries only (which it likely already does via `api.users.getCurrentUser`). Remove any WorkOS imports.

- [ ] **Step 2: Update user-related components**

For each file that references WorkOS:
- Replace `workosUserId` field references with `authSource`/`clerkUserId` as appropriate
- Remove any WorkOS-specific avatar URL handling (use `profilePictureUrl` or `avatarUrl`)
- Remove WorkOS sign-in/sign-up URL generation
- Update type definitions that include `workosUserId`

- [ ] **Step 3: Search for any remaining `workos` references in admin frontend**

```bash
cd ConvexPress-Admin/apps/web && grep -ri "workos" src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining files.

- [ ] **Step 4: Commit**

```bash
git add -A ConvexPress-Admin/apps/web/src/
git commit -m "refactor(admin): remove all remaining WorkOS references from frontend"
```

---

### Task 20: Update Admin .env and Env Config

**Files:**
- Modify: `ConvexPress-Admin/apps/web/.env`
- Modify: `ConvexPress-Admin/packages/env/src/web.ts`

- [ ] **Step 1: Update .env file**

Remove WorkOS vars, add new ones:

```
# Remove these:
# VITE_WORKOS_CLIENT_ID=...
# VITE_WORKOS_REDIRECT_URI=...

# Add:
VITE_CONVEX_SITE_URL=https://amiable-mongoose-989.convex.site
```

- [ ] **Step 2: Update env validation schema**

In `ConvexPress-Admin/packages/env/src/web.ts`, update the Zod schema to remove WorkOS vars and add `VITE_CONVEX_SITE_URL`.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/.env ConvexPress-Admin/packages/env/src/web.ts
git commit -m "chore(admin): update env vars for local auth"
```

---

## Phase 3: Website — Clerk Integration

### Task 21: Install Clerk Packages on Website

**Files:**
- Modify: `ConvexPress-Website/apps/web/package.json`

- [ ] **Step 1: Remove WorkOS packages, add Clerk**

```bash
cd ConvexPress-Website/apps/web && bun remove @workos-inc/node @workos/authkit-tanstack-react-start && bun add @clerk/tanstack-react-start @clerk/clerk-react @convex-dev/react-clerk
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Website/apps/web/package.json
git commit -m "chore(website): swap WorkOS packages for Clerk"
```

---

### Task 22: Website Root Provider — Clerk + Convex

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/__root.tsx`
- Modify: `ConvexPress-Website/apps/web/src/start.ts`

- [ ] **Step 1: Update `__root.tsx` provider stack**

Replace `AuthKitProvider` with `ClerkProvider` + `ConvexProviderWithClerk`:

```typescript
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "@convex-dev/react-clerk";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

// In the root component's Wrap or layout:
<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
    {children}
  </ConvexProviderWithClerk>
</ClerkProvider>
```

Read the current `__root.tsx` to understand the exact structure and adapt accordingly.

- [ ] **Step 2: Update `start.ts` middleware**

Remove `authkitMiddleware()`. Replace with Clerk middleware if needed for SSR, or remove the auth middleware entirely and handle auth in route loaders:

```typescript
import { createStart } from "@tanstack/react-start";
// Remove: import { authkitMiddleware } from "@workos/authkit-tanstack-react-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [canonicalMiddleware],
  // authkitMiddleware removed — Clerk handles auth client-side
}));
```

Check `@clerk/tanstack-react-start` docs — if it provides server middleware, use that instead. Otherwise, use Clerk's `getAuth()` in route loaders for SSR-protected routes.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Website/apps/web/src/routes/__root.tsx ConvexPress-Website/apps/web/src/start.ts
git commit -m "feat(website): replace WorkOS provider with Clerk + ConvexProviderWithClerk"
```

---

### Task 23: Rewrite Website Auth Pages with Clerk Hooks

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/login.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/register.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/forgot-password.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/reset-password.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/verify-email.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/logout.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/api/auth/callback.tsx`

- [ ] **Step 1: Rewrite login.tsx**

Replace WorkOS `getAuth()` / `getSignInUrl()` with Clerk's `useSignIn()` hook. The custom `LoginForm` component uses:

```typescript
import { useSignIn } from "@clerk/clerk-react";

// In component:
const { signIn, isLoaded } = useSignIn();

// Email/password:
const result = await signIn.create({
  identifier: email,
  password,
});

// OAuth:
await signIn.authenticateWithRedirect({
  strategy: "oauth_google",
  redirectUrl: "/api/auth/callback",
  redirectUrlComplete: "/dashboard",
});
```

Dynamic strategy detection for the custom UI:

```typescript
// After signIn.create, check supportedFirstFactors
// to know what verification methods are available
```

- [ ] **Step 2: Rewrite register.tsx**

Replace WorkOS `getSignUpUrl()` with Clerk's `useSignUp()` hook:

```typescript
import { useSignUp } from "@clerk/clerk-react";

const { signUp, isLoaded } = useSignUp();

const result = await signUp.create({
  emailAddress: email,
  password,
  firstName,
  lastName,
});
```

- [ ] **Step 3: Rewrite remaining auth routes**

- `forgot-password.tsx` — Use Clerk's `useSignIn()` with `signIn.create({ strategy: "reset_password_email_code" })`
- `reset-password.tsx` — Use Clerk's password reset verification flow
- `verify-email.tsx` — Use Clerk's email verification flow
- `logout.tsx` — Use `useClerk().signOut()` from `@clerk/clerk-react`
- `api/auth/callback.tsx` — Handle Clerk OAuth callback (may be handled automatically by `@clerk/tanstack-react-start`)

- [ ] **Step 4: Commit**

```bash
git add -A ConvexPress-Website/apps/web/src/routes/
git commit -m "feat(website): rewrite all auth pages using Clerk hooks with custom UI"
```

---

### Task 24: Rewrite Website Auth Components

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/components/auth/OAuthButtons.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/auth/LoginForm.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/auth/RegisterForm.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/auth/ForgotPasswordForm.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/auth/LoginTracker.tsx`

- [ ] **Step 1: Rewrite OAuthButtons.tsx**

Use `useSignIn()` to dynamically detect available OAuth providers and render buttons. Keep the existing visual design (Base UI + our styling).

```typescript
import { useSignIn } from "@clerk/clerk-react";

// Detect available social providers from signIn.supportedExternalAccounts
// or from signIn.supportedFirstFactors where strategy starts with "oauth_"
```

- [ ] **Step 2: Rewrite LoginForm.tsx**

Replace WorkOS form submission with Clerk `useSignIn().create()`. Keep existing form layout and validation.

- [ ] **Step 3: Rewrite RegisterForm.tsx**

Replace WorkOS form submission with Clerk `useSignUp().create()`. Keep existing form layout, password strength indicator, registration gate logic.

- [ ] **Step 4: Rewrite ForgotPasswordForm.tsx**

Use Clerk's password reset flow via `useSignIn()`.

- [ ] **Step 5: Update LoginTracker.tsx**

Adapt login tracking to work with Clerk auth state instead of WorkOS.

- [ ] **Step 6: Commit**

```bash
git add -A ConvexPress-Website/apps/web/src/components/auth/
git commit -m "feat(website): rewrite auth components with Clerk hooks and custom UI"
```

---

### Task 25: Update Website Layout & Dashboard Components

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/components/layout/UserMenu.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/layout/HeaderActions.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/layout/MobileNav.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/layout/DashboardSidebar.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/dashboard.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/dashboard/comments.tsx`
- Modify: Dashboard sub-routes as needed

- [ ] **Step 1: Update layout components**

Replace WorkOS auth hooks (`useAuth()` from `@workos/*`) with Clerk equivalents:
- `useUser()` from `@clerk/clerk-react` for user data
- `useAuth()` from `@clerk/clerk-react` for auth state
- `useClerk().signOut()` for logout

- [ ] **Step 2: Update dashboard route guards**

Replace WorkOS `getAuth()` in SSR loaders with Clerk's server-side auth check.

- [ ] **Step 3: Commit**

```bash
git add -A ConvexPress-Website/apps/web/src/components/layout/ ConvexPress-Website/apps/web/src/routes/dashboard*
git commit -m "feat(website): update layout and dashboard for Clerk auth"
```

---

### Task 26: Update Website Auth Utilities & Hooks

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/hooks/useCurrentUser.ts`
- Modify: `ConvexPress-Website/apps/web/src/hooks/useLoginTracker.ts`
- Modify: `ConvexPress-Website/apps/web/src/hooks/useAvatarUrl.ts`
- Modify: `ConvexPress-Website/apps/web/src/lib/auth/auth.ts`
- Modify: `ConvexPress-Website/apps/web/src/lib/auth/types.ts`
- Modify: `ConvexPress-Website/apps/web/src/components/dashboard/settings/PasswordChangeSection.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/dashboard/settings/DeleteAccountDialog.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/dashboard/profile/ProfileForm.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/dashboard/profile/AvatarUploader.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/dashboard/profile/AvatarDisplay.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/blog/$slug.tsx`
- Modify: `ConvexPress-Website/apps/web/src/hooks/useUserComments.ts`
- Modify: `ConvexPress-Website/apps/web/src/hooks/layout/useAdminBarVisibility.ts`
- Modify: `ConvexPress-Website/apps/web/src/components/dashboard/comments/UserCommentList.tsx`
- Modify: `ConvexPress-Website/apps/web/src/lib/dashboard/types.ts`

- [ ] **Step 1: Update auth utilities**

`lib/auth/auth.ts` contains capability checking functions (`userCan`, `userCanAll`, etc.) that likely don't reference WorkOS directly. Verify and update if needed.

`lib/auth/types.ts` may have WorkOS-specific type definitions. Update to reflect Clerk user shape.

- [ ] **Step 2: Update hooks**

- `useCurrentUser.ts` — May reference WorkOS user shape. Update for Clerk.
- `useLoginTracker.ts` — Update auth source references.
- `useAvatarUrl.ts` — May reference WorkOS avatar URL. Adapt for Clerk.

- [ ] **Step 3: Update dashboard components**

- `PasswordChangeSection.tsx` — May use WorkOS password change. Use Clerk's `user.updatePassword()` instead.
- `DeleteAccountDialog.tsx` — May use WorkOS account deletion. Use Clerk's `user.delete()`.
- Profile components — Remove WorkOS-specific fields.

- [ ] **Step 4: Commit**

```bash
git add -A ConvexPress-Website/apps/web/src/
git commit -m "refactor(website): update all hooks, utilities, and dashboard components for Clerk"
```

---

### Task 27: Update Website .env

**Files:**
- Modify: `ConvexPress-Website/apps/web/.env`
- Modify: `ConvexPress-Website/apps/web/.env.local`

- [ ] **Step 1: Update env files**

`.env`:
```
VITE_CONVEX_URL=https://amiable-mongoose-989.convex.cloud
VITE_ADMIN_APP_URL=http://localhost:4105
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

`.env.local` — remove all WorkOS vars:
```
# Remove: WORKOS_CLIENT_ID, WORKOS_API_KEY, WORKOS_COOKIE_PASSWORD, WORKOS_REDIRECT_URI
VITE_CONVEX_URL=https://amiable-mongoose-989.convex.cloud
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
VITE_MEILISEARCH_HOST=https://meilisearch.hybrid5studio.com
VITE_MEILISEARCH_KEY=vhQHf3TvLOwNy/93K2recS2JnaQAjCzW0u31OdBR+Po=
VITE_APP_URL=http://localhost:4106
NODE_ENV=development
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Website/apps/web/.env ConvexPress-Website/apps/web/.env.local
git commit -m "chore(website): update env vars for Clerk"
```

---

## Phase 4: Clerk Webhooks & Final Backend Integration

### Task 28: Clerk Webhook Handler

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/clerkWebhook.ts`

- [ ] **Step 1: Install svix in backend**

```bash
cd ConvexPress-Admin/packages/backend && bun add svix
```

- [ ] **Step 2: Create Clerk webhook handler**

Create `ConvexPress-Admin/packages/backend/convex/auth/clerkWebhook.ts`:

```typescript
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Webhook } from "svix";

/**
 * POST /webhooks/clerk
 *
 * Handles Clerk user lifecycle webhooks:
 * - user.created → create user in Convex
 * - user.updated → sync profile fields
 * - user.deleted → deactivate user
 */
export const clerkWebhookHandler = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Verify webhook signature
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await request.text();
  const wh = new Webhook(webhookSecret);
  let event: { type: string; data: Record<string, unknown> };

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  // Route event
  switch (event.type) {
    case "user.created":
    case "user.updated":
      await ctx.runMutation(internal.auth.clerkSync.upsertClerkUser, {
        clerkUserId: event.data.id as string,
        email: (event.data.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address ?? "",
        firstName: (event.data.first_name as string) ?? undefined,
        lastName: (event.data.last_name as string) ?? undefined,
        profilePictureUrl: (event.data.image_url as string) ?? undefined,
        username: (event.data.username as string) ?? undefined,
      });
      break;

    case "user.deleted":
      await ctx.runMutation(internal.auth.clerkSync.deleteClerkUser, {
        clerkUserId: event.data.id as string,
      });
      break;
  }

  return new Response("OK", { status: 200 });
});
```

- [ ] **Step 3: Create Clerk sync mutations**

Create `ConvexPress-Admin/packages/backend/convex/auth/clerkSync.ts`:

```typescript
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const upsertClerkUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .unique();

    const now = Date.now();

    if (existing) {
      // Update profile fields only
      await ctx.db.patch(existing._id, {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        profilePictureUrl: args.profilePictureUrl,
        updatedAt: now,
      });
    } else {
      // Create new user with default subscriber role
      const subscriberRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
        .unique();

      await ctx.db.insert("users", {
        authSource: "clerk",
        clerkUserId: args.clerkUserId,
        email: args.email,
        emailVerified: true,
        firstName: args.firstName,
        lastName: args.lastName,
        profilePictureUrl: args.profilePictureUrl,
        username: args.username,
        displayName: [args.firstName, args.lastName].filter(Boolean).join(" ") || args.email,
        slug: args.username ?? args.email.split("@")[0],
        status: "active",
        roleId: subscriberRole?._id,
        registrationMethod: "self",
        registeredAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const deleteClerkUser = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .unique();

    if (user) {
      // Soft delete — deactivate instead of hard delete
      await ctx.db.patch(user._id, {
        status: "inactive",
        deactivatedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
```

- [ ] **Step 4: Register webhook route in http.ts**

Add to `http.ts`:

```typescript
import { clerkWebhookHandler } from "./auth/clerkWebhook";

http.route({
  path: "/webhooks/clerk",
  method: "POST",
  handler: clerkWebhookHandler,
});
```

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/clerkWebhook.ts ConvexPress-Admin/packages/backend/convex/auth/clerkSync.ts ConvexPress-Admin/packages/backend/convex/http.ts ConvexPress-Admin/packages/backend/package.json
git commit -m "feat(auth): Clerk webhook handler with user create/update/delete sync"
```

---

### Task 29: Just-In-Time Clerk User Provisioning

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/clerkProvisioning.ts`

- [ ] **Step 1: Create JIT provisioning mutation**

For when a Clerk user makes their first Convex query before the webhook arrives:

```typescript
import { mutation } from "../_generated/server";

/**
 * Provision a Clerk user on their first Convex query.
 * Called by the website frontend when getCurrentUser returns null
 * but the user has a valid Clerk session.
 */
export const provisionClerkUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .unique();

    if (existing) return existing._id;

    // Provision new user from Clerk identity claims
    const subscriberRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
      .unique();

    const now = Date.now();
    const email = identity.email ?? "";
    const firstName = identity.givenName ?? undefined;
    const lastName = identity.familyName ?? undefined;

    const userId = await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId: identity.subject,
      email,
      emailVerified: identity.emailVerified ?? false,
      firstName,
      lastName,
      profilePictureUrl: identity.pictureUrl ?? undefined,
      displayName: identity.name ?? email,
      slug: email.split("@")[0],
      status: "active",
      roleId: subscriberRole?._id,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/clerkProvisioning.ts
git commit -m "feat(auth): just-in-time Clerk user provisioning for webhook race condition"
```

---

## Phase 5: Cleanup & First Admin User Setup

### Task 30: Create First Admin User Script

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/auth/setup.ts`

- [ ] **Step 1: Create setup action for first admin user**

This action creates the initial administrator account. It will later be called by the install wizard.

```typescript
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { hashPassword } from "./helpers";

/**
 * Create the first admin user. Only works if no admin users exist yet.
 */
export const createFirstAdmin = action({
  args: {
    email: v.string(),
    username: v.string(),
    password: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if any admin users already exist
    const existingAdmins = await ctx.runQuery(
      internal.auth.internals.checkExistingAdmins,
    );
    if (existingAdmins) {
      throw new Error("An administrator account already exists");
    }

    // Hash password
    const passwordHash = await hashPassword(args.password);

    // Create admin user
    const userId = await ctx.runMutation(
      internal.auth.internals.createAdminUser,
      {
        email: args.email,
        username: args.username,
        passwordHash,
        displayName: args.displayName ?? args.username,
      },
    );

    return { userId, message: "Administrator account created" };
  },
});
```

- [ ] **Step 2: Add supporting internal functions to internals.ts**

Add to `ConvexPress-Admin/packages/backend/convex/auth/internals.ts`:

```typescript
export const checkExistingAdmins = internalQuery({
  args: {},
  handler: async (ctx) => {
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();
    if (!adminRole) return false;

    const admin = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
      .first();

    return !!admin;
  },
});

export const createAdminUser = internalMutation({
  args: {
    email: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();

    const now = Date.now();

    return await ctx.db.insert("users", {
      authSource: "local",
      email: args.email,
      username: args.username,
      passwordHash: args.passwordHash,
      displayName: args.displayName,
      slug: args.username.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      emailVerified: true,
      status: "active",
      roleId: adminRole?._id,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/auth/setup.ts ConvexPress-Admin/packages/backend/convex/auth/internals.ts
git commit -m "feat(auth): first admin user creation action for install wizard"
```

---

### Task 31: Final Cleanup — Remove Remaining WorkOS References

- [ ] **Step 1: Search entire codebase for any remaining WorkOS references**

```bash
grep -ri "workos" ConvexPress-Admin/ ConvexPress-Website/ --include="*.ts" --include="*.tsx" --include="*.json" -l | grep -v node_modules | grep -v ".env"
```

Fix any remaining references.

- [ ] **Step 2: Verify no WorkOS packages remain in any package.json**

```bash
grep -r "@workos" ConvexPress-Admin/apps/web/package.json ConvexPress-Admin/packages/backend/package.json ConvexPress-Website/apps/web/package.json
grep -r "convex-dev/workos" ConvexPress-Admin/apps/web/package.json ConvexPress-Admin/packages/backend/package.json
```

- [ ] **Step 3: Run bun install to clean lockfiles**

```bash
cd ConvexPress-Admin && bun install
cd ConvexPress-Website && bun install
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove all remaining WorkOS references and clean dependencies"
```

---

### Task 32: Generate ES256 Key and Configure Convex Dashboard

**IMPORTANT:** This task should ideally be done right after Phase 1 tasks are complete, BEFORE the first deploy. The backend cannot validate JWTs without `AUTH_PRIVATE_KEY` set.

- [ ] **Step 1: Generate ES256 private key**

```bash
openssl ecparam -genkey -name prime256v1 -noout | openssl pkcs8 -topk8 -nocrypt
```

Copy the output (PEM-formatted private key).

- [ ] **Step 2: Set Convex environment variables**

In the Convex Dashboard (https://dashboard.convex.dev), set:
- `AUTH_PRIVATE_KEY` = the PEM private key from step 1
- `AUTH_ISSUER_URL` = `https://amiable-mongoose-989.convex.site`
- Remove: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`

When Clerk is configured later:
- `CLERK_JWT_ISSUER_DOMAIN` = Clerk Frontend API URL
- `CLERK_WEBHOOK_SECRET` = from Clerk Dashboard webhooks page

- [ ] **Step 3: Deploy backend**

```bash
cd ConvexPress-Admin/packages/backend && npx convex deploy --typecheck=disable
```

- [ ] **Step 4: Run authSource backfill migration**

In Convex Dashboard, run: `internal.auth.migrations.backfillAuthSource`

- [ ] **Step 5: Create first admin user**

In Convex Dashboard, run `auth.setup.createFirstAdmin` with:
```json
{
  "email": "admin@smithharper.com",
  "username": "admin",
  "password": "your-secure-password",
  "displayName": "Administrator"
}
```

---

## Summary

| Phase | Tasks | What It Does |
|-------|-------|-------------|
| Phase 1 | Tasks 1-13 | Backend: schema, JWT system, auth endpoints, `getCurrentUser()` update, WorkOS removal from backend |
| Phase 2 | Tasks 14-20 | Admin frontend: local auth hook, provider stack, login form, WorkOS removal |
| Phase 3 | Tasks 21-27 | Website frontend: Clerk packages, provider, auth pages with custom UI |
| Phase 4 | Tasks 28-29 | Clerk webhooks + JIT provisioning |
| Phase 5 | Tasks 30-32 | First admin setup, cleanup, deploy |

**Total: 32 tasks across 5 phases.**

Each phase is independently deployable (with `--typecheck=disable`). Phase 1+2 makes the admin work. Phase 3+4 makes the website work. Phase 5 ties it all together.
