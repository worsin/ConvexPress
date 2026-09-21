import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/management/sessionExpiry.ts": () => import("../sessionExpiry"),
};
const expire = makeFunctionReference<"mutation">("management/sessionExpiry:expire");
const sweep = makeFunctionReference<"mutation">("management/sessionExpiry:sweep");

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const authorityId = await ctx.db.insert("convexpress_managementAuthorities", {
      controllerId: "expiry-test", keyId: "test-key", publicKeyPem: "fixture", fingerprintSha256: "fixture",
      websiteKey: "site", instanceKey: "staging", capabilities: [], capabilityRevision: 1,
      status: "active", notBefore: now - 1000, enrolledAt: now, updatedAt: now,
    });
    const userId = await ctx.db.insert("users", {
      email: "expiry@example.invalid", displayName: "Expiry fixture", authSource: "management",
      emailVerified: false, status: "active", createdAt: now, updatedAt: now,
    });
    const bindingId = await ctx.db.insert("convexpress_managementBindings", {
      authorityId, controllerId: "expiry-test", syntheticOperatorId: "expiry-operator", userId,
      capabilityRevision: 1, status: "active", createdAt: now, updatedAt: now,
    });
    return { authorityId, userId, bindingId };
  });
  const add = (expiresAt: number, status: "active" | "revoked" = "active") => t.run(ctx => ctx.db.insert("convexpress_managementSessions", {
    ...ids, tokenHash: "fixture", websiteKey: "site", instanceKey: "staging", capabilities: [],
    siteRoleSlug: "administrator", siteCapabilities: [], capabilityRevision: 1, expiresAt, status, createdAt: Date.now(),
  }));
  return { t, add };
}

test("deadline expiration is guarded, durable and idempotent", async () => {
  const { t, add } = await fixture(), due = Date.now() - 1000;
  const sessionId = await add(due);
  await t.mutation(expire, { sessionId, expectedExpiresAt: due + 1 });
  expect((await t.run(ctx => ctx.db.get(sessionId)))?.status).toBe("active");
  await t.mutation(expire, { sessionId, expectedExpiresAt: due });
  const revoked = await t.run(ctx => ctx.db.get(sessionId));
  expect(revoked?.status).toBe("revoked");
  await t.mutation(expire, { sessionId, expectedExpiresAt: due });
  expect(await t.run(ctx => ctx.db.get(sessionId))).toEqual(revoked);
  const future = Date.now() + 60_000, futureId = await add(future);
  await t.mutation(expire, { sessionId: futureId, expectedExpiresAt: future });
  expect((await t.run(ctx => ctx.db.get(futureId)))?.status).toBe("active");
  const jobs = await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  expect(jobs).toHaveLength(1);
  expect(jobs[0].scheduledTime).toBe(future);
});

test("recovery expires bounded batches without touching future or already revoked sessions", async () => {
  const { t, add } = await fixture(), due = Date.now() - 1000;
  const expired = [];
  for (let i = 0; i < 101; i++) expired.push(await add(due));
  const future = await add(Date.now() + 60_000), previous = await add(due, "revoked");
  const preserved = await t.run(ctx => ctx.db.get(previous));
  await t.mutation(sweep, {});
  expect((await t.run(ctx => ctx.db.query("convexpress_managementSessions").withIndex("by_status_expiry", q => q.eq("status", "active").lte("expiresAt", due)).collect()))).toHaveLength(1);
  await t.mutation(sweep, {});
  for (const id of expired) expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe("revoked");
  expect((await t.run(ctx => ctx.db.get(future)))?.status).toBe("active");
  expect(await t.run(ctx => ctx.db.get(previous))).toEqual(preserved);
});
