import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { hashRefreshToken } from "../helpers";

const SOURCE = "https://source-environment.convex.site";
const TARGET = "https://target-environment.convex.site";
const originalEnv = { issuer: process.env.AUTH_ISSUER_URL, key: process.env.AUTH_PRIVATE_KEY };
beforeEach(() => {
  process.env.AUTH_ISSUER_URL = SOURCE;
  process.env.AUTH_PRIVATE_KEY = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
});
afterEach(() => {
  for (const [name, value] of [["AUTH_ISSUER_URL", originalEnv.issuer], ["AUTH_PRIVATE_KEY", originalEnv.key]]) {
    if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
  }
});
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/http.ts": () => import("../../http"),
  "./convex/auth/internals.ts": () => import("../internals"),
  "./convex/api/internals.ts": () => import("../../api/internals"),
  "./convex/api/mutations.ts": () => import("../../api/mutations"),
};
const mutation = (name: string) => makeFunctionReference<"mutation">(name);
const query = (name: string) => makeFunctionReference<"query">(name);
async function harness() {
  const t = convexTest({ schema, modules });
  const userId = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", { name: "Operator", slug: "operator", description: "Fixture", level: 100, type: "internal", isDefault: false, isProtected: false, capabilities: ["api.create_key"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("users", { authSource: "local", email: "fixture@example.invalid", username: "fixture", displayName: "Fixture", slug: "fixture", emailVerified: true, status: "active", isInternal: true, roleId, registrationMethod: "self", registeredAt: 1, createdAt: 1, updatedAt: 1 });
  });
  return { t, userId, admin: t.withIdentity({ issuer: "https://convexpress-admin.local", subject: userId, tokenIdentifier: `https://convexpress-admin.local|${userId}` }) };
}

describe("credential environment isolation", () => {
  test("copied refresh token cannot mint a target access token; same-environment restore can refresh", async () => {
    const { t, userId } = await harness();
    const raw = "ab".repeat(32);
    const tokenHash = await hashRefreshToken(raw);
    await t.mutation(mutation("auth/internals:createRefreshToken"), { tokenHash, userId, expiresAt: Date.now() + 60000 });
    const saved = await t.query(query("auth/internals:findRefreshToken"), { tokenHash });
    expect(saved.environmentBinding).toBe(SOURCE);
    // Identical copied snapshot rows, but the target retains its own deployment environment.
    process.env.AUTH_ISSUER_URL = TARGET;
    const denied = await t.fetch("/auth/refresh", { method: "POST", headers: { "x-convexpress-refresh": raw } });
    expect(denied.status).toBe(401);
    expect(await t.mutation(mutation("auth/internals:rotateRefreshToken"), { tokenHash, userId, nextTokenHash: "must-not-exist", expiresAt: Date.now() + 60000 })).toEqual({ rotated: false, reason: "missing" });
    expect((await t.run((ctx) => ctx.db.query("refreshTokens").collect()))).toHaveLength(1);
    process.env.AUTH_ISSUER_URL = SOURCE;
    const restored = await t.fetch("/auth/refresh", { method: "POST", headers: { "x-convexpress-refresh": raw, "x-convexpress-session": "token" } });
    expect(restored.status).toBe(200);
    const body = await restored.json();
    expect(typeof body.accessToken).toBe("string");
    const next = await t.query(query("auth/internals:findRefreshToken"), { tokenHash: await hashRefreshToken(body.refreshToken) });
    expect(next.environmentBinding).toBe(SOURCE);
  });

  test("copied API key is denied without usage writes, while same-environment restored key works", async () => {
    const { t, admin } = await harness();
    const issued = await admin.mutation(mutation("api/mutations:createKey"), { name: "Fixture integration", scopes: ["read:posts"] });
    const saved = await t.run((ctx) => ctx.db.get("apiKeys", issued.keyId));
    expect(saved!.environmentBinding).toBe(SOURCE);
    const args = { authorizationHeader: `Bearer ${issued.key}`, requiredScope: "read:posts", clientIp: "127.0.0.1" };
    process.env.AUTH_ISSUER_URL = TARGET;
    expect((await t.mutation(mutation("api/internals:authenticateRequest"), args)).authenticated).toBe(false);
    expect(await t.run((ctx) => ctx.db.get("apiKeys", issued.keyId))).toEqual(saved);
    expect(await t.run((ctx) => ctx.db.query("apiRateLimitWindows").collect())).toEqual([]);
    process.env.AUTH_ISSUER_URL = SOURCE;
    expect((await t.mutation(mutation("api/internals:authenticateRequest"), args)).authenticated).toBe(true);
  });

  test("legacy unstamped rows and missing environment fail closed", async () => {
    const { t, userId, admin } = await harness();
    const tokenHash = await hashRefreshToken("cd".repeat(32));
    await t.run((ctx) => ctx.db.insert("refreshTokens", { tokenHash, userId, expiresAt: Date.now() + 60000, createdAt: 1 }));
    expect(await t.query(query("auth/internals:findRefreshToken"), { tokenHash })).toBeNull();
    const issued = await admin.mutation(mutation("api/mutations:createKey"), { name: "Legacy fixture", scopes: ["read:posts"] });
    await t.run((ctx) => ctx.db.patch("apiKeys", issued.keyId, { environmentBinding: undefined }));
    expect((await t.mutation(mutation("api/internals:authenticateRequest"), { authorizationHeader: `Bearer ${issued.key}`, requiredScope: "read:posts", clientIp: "127.0.0.1" })).authenticated).toBe(false);
    delete process.env.AUTH_ISSUER_URL;
    await expect(t.mutation(mutation("auth/internals:createRefreshToken"), { tokenHash: "new", userId, expiresAt: Date.now() + 60000 })).rejects.toThrow("environment");
    await expect(admin.mutation(mutation("api/mutations:createKey"), { name: "Missing environment", scopes: ["read:posts"] })).rejects.toThrow("environment");
  });
});
