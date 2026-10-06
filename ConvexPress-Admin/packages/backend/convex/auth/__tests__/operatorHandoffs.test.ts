import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { create, consume, expire } from "../operatorHandoffs";
import { operatorHandoffHandler, operatorHandoffPreflight } from "../operatorHttp";
import { hashRefreshToken } from "../helpers";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";

const run = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);
const codeHash = "a".repeat(64), origin = "https://site.example";
function fixture(managed = false) {
  const ctx = commerceHarness({
    users: [{ _id: "admin", authSource: managed ? "management" : "local", status: "active", roleId: "role", email: "operator@example.invalid" }],
    settings: [{ _id: "general", section: "general", values: { siteUrl: origin } }],
    convexpress_siteIdentity: [{ _id: "identity", identityKey: "site-identity", websiteKey: "one", instanceKey: "one:staging" }],
    convexpress_managementAuthorities: [{ _id: "authority", status: "active", notBefore: 0, capabilityRevision: 1, controllerId: "controller", websiteKey: "one", instanceKey: "one:staging" }],
    convexpress_managementBindings: [{ _id: "binding", status: "active", authorityId: "authority", controllerId: "controller", capabilityRevision: 1, userId: "admin" }],
    convexpress_managementSessions: [{ _id: "session", status: "active", userId: "admin", authorityId: "authority", bindingId: "binding", capabilityRevision: 1, websiteKey: "one", instanceKey: "one:staging", siteRoleSlug: "administrator", siteCapabilities: ["manage_options"], expiresAt: Date.now() + 120_000 }],
  });
  if (managed) ctx.auth.getUserIdentity = async () => ({ subject: "session", tokenIdentifier: "https://convexpress-management.local|session" });
  ctx.handlers["auth/operatorHandoffs:consume"] = consume;
  return ctx;
}

test("only authorized local/managed operators can create website handoffs", async () => {
  const anonymous = fixture(); anonymous.auth.getUserIdentity = async () => null;
  await expect(run(create, anonymous, { codeHash })).rejects.toBeDefined();
  const customer = fixture(); Object.assign(customer.tables.users[0], { authSource: "clerk", clerkUserId: "clerk-customer" });
  customer.auth.getUserIdentity = async () => ({ subject: "clerk-customer", tokenIdentifier: "https://clerk.example|clerk-customer" });
  await expect(run(create, customer, { codeHash })).rejects.toBeDefined();
  const denied = fixture(); denied.tables.roles[0].capabilities = [];
  await expect(run(create, denied, { codeHash })).rejects.toBeDefined();
  const disabled = fixture(); disabled.tables.roles[0].status = "inactive";
  await expect(run(create, disabled, { codeHash })).rejects.toBeDefined();
  expect(anonymous.tables.websiteOperatorHandoffs).toBeUndefined();
  expect(customer.tables.websiteOperatorHandoffs).toBeUndefined();
});

test("origin-bound handoff consumes exactly once and stores no bearer credential", async () => {
  const ctx = fixture(); const issued = await run(create, ctx, { codeHash });
  expect(issued.url).toBe(origin + "/?customize=1");
  expect(await run(consume, ctx, { codeHash, origin: "https://other.example" })).toBeNull();
  expect(ctx.tables.websiteOperatorHandoffs).toHaveLength(1);
  expect(Object.keys(ctx.tables.websiteOperatorHandoffs[0]).sort()).toEqual(["_creationTime", "_id", "authority", "codeHash", "expiresAt", "instanceKey", "origin", "userId", "websiteKey"]);
  expect((await run(consume, ctx, { codeHash, origin })).userId).toBe("admin");
  expect(await run(consume, ctx, { codeHash, origin })).toBeNull();
});

test("expiry, installation changes and current local authority are rechecked at redemption", async () => {
  for (const change of [
    (ctx: any) => { ctx.tables.websiteOperatorHandoffs[0].expiresAt = Date.now() - 1; },
    (ctx: any) => { ctx.tables.convexpress_siteIdentity[0].instanceKey = "other:staging"; },
    (ctx: any) => { ctx.tables.settings[0].values.siteUrl = "https://changed.example"; },
    (ctx: any) => { ctx.tables.users[0].lastPasswordChangedAt = Date.now(); },
    (ctx: any) => { ctx.tables.users[0].status = "inactive"; },
    (ctx: any) => { ctx.tables.roles[0].status = "inactive"; },
    (ctx: any) => { ctx.tables.roles[0].capabilities = []; },
  ]) {
    const ctx = fixture(); await run(create, ctx, { codeHash }); change(ctx);
    expect(await run(consume, ctx, { codeHash, origin })).toBeNull();
  }
});

test("managed handoff cannot outlive or escape its parent authority", async () => {
  const ctx = fixture(true); await run(create, ctx, { codeHash });
  const accepted = await run(consume, ctx, { codeHash, origin });
  expect(accepted.managementSessionId).toBe("session");
  expect(accepted.expiresAt).toBeLessThanOrEqual(ctx.tables.convexpress_managementSessions[0].expiresAt);
  for (const table of ["convexpress_managementSessions", "convexpress_managementAuthorities", "convexpress_managementBindings"]) {
    const revoked = fixture(true); await run(create, revoked, { codeHash }); revoked.tables[table][0].status = "revoked";
    expect(await run(consume, revoked, { codeHash, origin })).toBeNull();
  }
  const ceiling = fixture(true); await run(create, ceiling, { codeHash }); ceiling.tables.convexpress_managementSessions[0].siteCapabilities = [];
  expect(await run(consume, ceiling, { codeHash, origin })).toBeNull();
});

test("pending handoffs are bounded and expiry callbacks are idempotent", async () => {
  const ctx = fixture();
  for (let i = 0; i < 5; i++) await run(create, ctx, { codeHash: i.toString(16).padStart(64, "0") });
  await expect(run(create, ctx, { codeHash })).rejects.toBeDefined();
  const row = ctx.tables.websiteOperatorHandoffs[0];
  await run(expire, ctx, { id: row._id }); expect(ctx.tables.websiteOperatorHandoffs).toHaveLength(5);
  row.expiresAt = Date.now() - 1;
  await run(expire, ctx, { id: row._id }); await run(expire, ctx, { id: row._id });
  expect(ctx.tables.websiteOperatorHandoffs).toHaveLength(4);
});

test("HTTP exchange rejects invalid origins and signs a bounded existing-provider token once", async () => {
  const previousKey = process.env.AUTH_PRIVATE_KEY;
  const keys = await generateKeyPair("ES256", { extractable: true });
  process.env.AUTH_PRIVATE_KEY = await exportPKCS8(keys.privateKey);
  try {
    const code = "b".repeat(64), ctx = fixture();
    await run(create, ctx, { codeHash: await hashRefreshToken(code) });
    const request = (from = origin, body = JSON.stringify({ code })) => new Request("https://backend.example/auth/operator-handoff", { method: "POST", headers: { Origin: from, "Content-Type": "application/json" }, body });
    expect((await run(operatorHandoffHandler, ctx, request("null"))).status).toBe(403);
    expect((await run(operatorHandoffHandler, ctx, request("https://other.example"))).status).toBe(403);
    expect((await run(operatorHandoffHandler, ctx, request(origin, "x".repeat(1100)))).status).toBe(403);
    const result = await run(operatorHandoffHandler, ctx, request());
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    const data = await result.json();
    expect(data.userId).toBe("admin");
    expect(data.viewerSubject).toBe("admin");
    const verified = await jwtVerify(data.token, keys.publicKey, { issuer: "https://convexpress-admin.local", audience: "convexpress-admin" });
    expect(verified.payload.sub).toBe("admin"); expect(verified.payload.exp! * 1000).toBeLessThanOrEqual(Date.now() + 300_000);
    expect((await run(operatorHandoffHandler, ctx, request())).status).toBe(403);
    expect((await run(operatorHandoffPreflight, ctx, request())).status).toBe(204);
  } finally { if (previousKey === undefined) delete process.env.AUTH_PRIVATE_KEY; else process.env.AUTH_PRIVATE_KEY = previousKey; }
});


test("managed handoff exposes its signed subject separately from the operator user", async()=>{
 const previous=process.env.AUTH_PRIVATE_KEY,keys=await generateKeyPair("ES256",{extractable:true});
 process.env.AUTH_PRIVATE_KEY=await exportPKCS8(keys.privateKey);
 try {
  const ctx=fixture(true),code="c".repeat(64);await run(create,ctx,{codeHash:await hashRefreshToken(code)});
  const response=await run(operatorHandoffHandler,ctx,new Request(origin+"/auth/operator-handoff",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({code})}));
  expect(response.status).toBe(200);const data=await response.json();
  const verified=await jwtVerify(data.token,keys.publicKey,{issuer:"https://convexpress-management.local",audience:"convexpress-admin"});
  expect(data.viewerSubject).toBe(verified.payload.sub);expect(data.viewerSubject).toBe("session");expect(data.userId).toBe("admin");
 } finally {if(previous===undefined)delete process.env.AUTH_PRIVATE_KEY;else process.env.AUTH_PRIVATE_KEY=previous;}
});
