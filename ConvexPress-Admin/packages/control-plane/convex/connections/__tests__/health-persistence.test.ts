import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { prepare, recordHealth, revoke, saveEnvelope } from "../mutations";
import { environmentStatusText } from "../../../../../apps/web/src/components/shell/environment-presentation";
const modules = { "./convex/_generated/server.js": () => import("../../_generated/server.js") };

async function fixture(siteCount = 2) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const operator = await ctx.db.insert("overseer_users", {
      role: "admin",
      authUserId: "auth-admin",
      isActive: true,
      createdAt: 1,
    });
    const owner = await ctx.db.insert("overseer_users", {
      role: "owner",
      authUserId: "auth-owner",
      isActive: true,
      createdAt: 1,
    });
    const other = await ctx.db.insert("overseer_users", {
      role: "member",
      isActive: true,
      createdAt: 1,
    });
    const createSite = async (suffix: string) => {
      const organization = await ctx.db.insert("overseer_organizations", {
        name: suffix,
        slug: suffix,
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
      });
      const business = await ctx.db.insert("overseer_businesses", {
        organizationId: organization,
        name: suffix,
        slug: suffix,
        isActive: true,
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const stamps = { organization_id: organization, business_id: business };
      const website = await ctx.db.insert("overseer_websites", {
        ...stamps,
        websiteKey: `website_${suffix}`,
        engine: "convexpress",
        title: suffix,
        primaryDomain: `${suffix}.example`,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const instance = await ctx.db.insert("overseer_websiteInstances", {
        ...stamps,
        website_id: website,
        instanceKey: `instance_${suffix}`,
        kind: "staging",
        deploymentOrigin: `https://${suffix}.convex.cloud`,
        managementOrigin: `https://${suffix}.convex.site`,
        siteOrigin: `https://${suffix}.example`,
        health: "ok",
        compatibility: "compatible",
        provisioning: "unprovisioned",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const connection = await ctx.db.insert("overseer_connections", {
        ...stamps,
        website_id: website,
        instance_id: instance,
        owner_id: String(operator),
        name: suffix,
        serviceId: "convexpress",
        provider: "convexpress",
        track: "native",
        status: "connected",
        isActive: true,
        credentials: { encrypted: "synthetic", iv: "synthetic", authTag: "synthetic", version: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(instance, { connection_id: connection, health: "unknown", compatibility: "unknown" });
      return { organization, business, website, instance, connection };
    };
    const alpha = await createSite("alpha");
    const beta = await createSite("beta");
    for (let i = 2; i < siteCount; i++) await createSite(`extra-${i}`);
    return { operator, owner, other, alpha, beta };
  });
  const scheduled: Record<string, any>[] = [];
  const reads: string[] = [];
  const invoke = (fn: any, args: any, operator = ids.operator) =>
    t.run(async (ctx) => {
      const declared = JSON.parse(fn.exportArgs()).value;
      for (const key of Object.keys(args)) if (!(key in declared)) throw Error(`Unexpected argument ${key}`);
      for (const [key, field] of Object.entries(declared) as [string, any][]) {
        if (args[key] === undefined && !field.optional) throw Error(`Missing argument ${key}`);
        if (args[key] !== undefined && ["string", "number", "boolean"].includes(field.fieldType.type) && typeof args[key] !== field.fieldType.type) throw Error(`Invalid argument ${key}`);
      }
      const user = (await ctx.db.get(operator))!;
      return fn._handler(
        {
          ...ctx,
          db: new Proxy(ctx.db, {
            get(target, property) {
              if (property === "query")
                return (table: any) => {
                  reads.push(table);
                  return ctx.db.query(table);
                };
              return Reflect.get(target, property);
            },
          }),
          auth: {
            getUserIdentity: async () => ({ subject: user.authUserId, sessionId: "synthetic" }),
          },
          runQuery: async (_reference: any, query: any) =>
            query.model === "session"
              ? { _id: "synthetic", expiresAt: Date.now() + 60_000 }
              : { _id: user.authUserId, userId: String(user._id) },
          scheduler: {
            runAfter: async (_delay: number, _reference: any, payload: any) => {
              scheduled.push(payload);
              return "synthetic-job";
            },
          },
        },
        args,
      );
    });
  return { t, ids, scheduled, reads, invoke };
}

const report = { status: "healthy", checkedAt: new Date().toISOString(), websiteKey: "website_alpha", instanceKey: "instance_alpha", siteContractVersion: "1.0.0", schemaVersion: "2026.9.0", engineVersion: "1.0.0", storageStatus: "healthy", authStatus: "healthy" };
async function observation(f: Awaited<ReturnType<typeof fixture>>) {
 const target = await f.invoke(prepare, { connectionId: f.ids.alpha.connection });
 return { connectionId: f.ids.alpha.connection, targetRevision: target.targetRevision, connectionRevision: target.connectionRevision, credentialIv: target.credentials.iv, report: report as typeof report | undefined, latencyMs: 1860 };
}
test("signed-test evidence populates the actual environment card projection and runtime versions", async () => {
 const f = await fixture();
 await f.invoke(recordHealth, await observation(f));
 const instance = await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance));
 expect(environmentStatusText(instance!)).toBe("Healthy · Contract compatible");
 expect([instance!.siteContractVersion, instance!.schemaVersion, instance!.engineVersion]).toEqual(["1.0.0", "2026.9.0", "1.0.0"]);
 expect(instance!.provisioning).toBe("ready");
});
test("valid degraded and incompatible responses never become healthy or compatible", async () => {
 const f = await fixture();
 await f.invoke(recordHealth, { ...await observation(f), report: { ...report, status: "degraded", engineVersion: "2.0.0" } });
 const instance = await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance));
 expect(environmentStatusText(instance!)).toBe("Degraded · Contract incompatible");
 expect(instance!.provisioning).toBe("unprovisioned");
});
test("healthy checks preserve active or failed provisioning jobs and changed credentials require fresh proof", async () => {
 for (const provisioning of ["provisioning", "error"] as const) {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.alpha.instance, { provisioning, provisioningError: "job evidence" }));
  await f.invoke(recordHealth, await observation(f));
  const instance = await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance));
  expect(instance!.provisioning).toBe(provisioning);
  expect(instance!.provisioningError).toBe("job evidence");
 }
 const f = await fixture();
 await f.invoke(recordHealth, await observation(f));
 await f.invoke(saveEnvelope, { connectionId: f.ids.alpha.connection, envelope: { encrypted: "next", iv: "next", authTag: "next", createdAt: 1, updatedAt: 2, lastRotatedAt: 2, version: 1 } });
 const attached = await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance));
 expect(attached!.provisioning).toBe("unprovisioned");
 expect(attached!.health).toBe("unknown");
 await f.invoke(recordHealth, await observation(f));
 expect((await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance)))!.provisioning).toBe("ready");
});
test("mismatched, revoked, reconfigured, rotated and unauthorized test results cannot write", async () => {
 for (const change of ["identity", "revoke", "target", "rotation", "parent", "operator", "replacement"]) {
  const f = await fixture(); const args = await observation(f);
  if (change === "identity") args.report = { ...report, instanceKey: "instance_beta" };
  await f.t.run(async ctx => {
   if (change === "revoke") await ctx.db.patch(f.ids.alpha.connection, { isActive: false, status: "revoked" });
   if (change === "target") await ctx.db.patch(f.ids.alpha.instance, { updatedAt: 2, managementOrigin: "https://changed.convex.site" });
   if (change === "rotation") { const c = (await ctx.db.get(f.ids.alpha.connection))!; await ctx.db.patch(c._id, { credentials: { ...c.credentials!, iv: "rotated" } }); }
   if (change === "parent") await ctx.db.patch(f.ids.alpha.organization, { isActive: false });
   if (change === "operator") await ctx.db.patch(f.ids.operator, { isActive: false });
   if (change === "replacement") await ctx.db.patch(f.ids.alpha.instance, { connection_id: f.ids.beta.connection });
  });
  await expect(f.invoke(recordHealth, args)).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("overseer_connectionHealthHistory").collect())).toHaveLength(0);
 }
});
test("failed check preserves verified compatibility, retry works and stale concurrent result cannot win", async () => {
 const f = await fixture(); const first = await observation(f);
 await f.invoke(recordHealth, first);
 await expect(f.invoke(recordHealth, first)).rejects.toThrow();
 await f.invoke(recordHealth, { ...await observation(f), report: undefined, errorCode: "CONNECTION_TEST_FAILED" });
 let i = await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance));
 expect(environmentStatusText(i!)).toBe("Unreachable · Contract compatible");
 await f.invoke(recordHealth, await observation(f));
 await f.invoke(revoke, { connectionId: f.ids.alpha.connection });
 i = await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance));
 expect(i!.health).toBe("unknown");
 expect(i!.provisioning).toBe("unprovisioned");
});

test("actual action requires signed authority, persists degraded evidence, and suppresses late unauthorized failures", async () => {
 const { test: testAction } = await import("../actions");
 const { generateManagementKeyPair } = await import("@convexpress/site-contract/node");
 const { encryptCredentialPayload } = await import("../crypto");
 const previousFetch = globalThis.fetch;
 const previousKeys = process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
 const key = Buffer.alloc(32, 7);
 process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = JSON.stringify({ "1": key.toString("base64") });
 try {
  for (const scenario of ["healthy", "degraded", "authority-denied", "revoked", "identity-mismatch", "http200-only"]) {
   const f = await fixture();
   const credential = { kind: "convexpress-site-controller-v1", controllerId: "controller_test", keyId: "key_test", privateKeyPem: generateManagementKeyPair().privateKeyPem, deploymentAdminKey: "synthetic-test-admin-key", capabilities: ["health.read", "session.exchange"] };
   const envelope = encryptCredentialPayload({ payload: credential, key, keyVersion: 1, aad: `website_alpha|instance_alpha|${f.ids.alpha.connection}` });
   await f.t.run(ctx => ctx.db.patch(f.ids.alpha.connection, { credentials: envelope }));
   let signedCalls = 0;
   globalThis.fetch = (async (_url: any, init: any) => {
    if (init?.method !== "POST") return Response.json(scenario === "http200-only" ? {} : { ...report, ...(scenario === "degraded" ? { status: "degraded" } : {}), ...(scenario === "identity-mismatch" ? { websiteKey: "website_beta" } : {}) });
    signedCalls++;
    if (scenario === "revoked") await f.t.run(ctx => ctx.db.patch(f.ids.alpha.connection, { isActive: false, status: "revoked" }));
    if (["authority-denied", "revoked"].includes(scenario)) return new Response(null, { status: 401 });
    return Response.json({ token: "t".repeat(64), controllerId: credential.controllerId, syntheticOperatorId: "operator_test", capabilities: ["health.read"], siteRole: "subscriber", siteCapabilities: ["content.read"], expiresAt: Date.now() + 60000 });
   }) as typeof fetch;
   const invoke = () => (testAction as any)._handler({ runQuery: (_ref: any, args: any) => f.invoke(prepare, args), runMutation: (_ref: any, args: any) => f.invoke(recordHealth, args) }, { connectionId: f.ids.alpha.connection });
   if (scenario === "healthy") expect((await invoke()).status).toBe("healthy");
   else await expect(invoke()).rejects.toThrow();
   const instance = await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance));
   expect(instance!.health).toBe(scenario === "healthy" ? "ok" : scenario === "degraded" ? "degraded" : scenario === "revoked" ? "unknown" : "unreachable");
   expect(instance!.provisioning).toBe(scenario === "healthy" ? "ready" : "unprovisioned");
   expect(signedCalls).toBe(["identity-mismatch", "http200-only"].includes(scenario) ? 0 : 1);
   if (scenario === "revoked") expect(await f.t.run(ctx => ctx.db.query("overseer_connectionHealthHistory").collect())).toHaveLength(0);
  }
 } finally {
  globalThis.fetch = previousFetch;
  if (previousKeys === undefined) delete process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
  else process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = previousKeys;
 }
});

test("new connections verify signed authority automatically; sealed failures remain retryable and stale proof cannot win", async () => {
 const { create, test: testAction } = await import("../actions");
 const { createPending, markError } = await import("../mutations");
 const { getFunctionName } = await import("convex/server");
 const previousFetch = globalThis.fetch;
 const previousKeys = process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
 const previousVersion = process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION;
 process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = JSON.stringify({ "1": Buffer.alloc(32, 7).toString("base64") });
 process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION = "1";
 try {
  for (const scenario of ["healthy", "degraded", "incompatible", "authority-denied", "rotated", "operator-revoked", "before-enroll-revoked", "after-enroll-revoked"]) {
   const f = await fixture();
   await f.t.run(async ctx => { await ctx.db.patch(f.ids.alpha.connection, { isActive: false, status: "revoked" }); await ctx.db.patch(f.ids.alpha.instance, { connection_id: undefined }); });
   let enrollCalls = 0, revokeCalls = 0, signedCalls = 0, retry = false;
   let freshConnection: any;
   globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).endsWith("/api/mutation")) {
     const body = JSON.parse(init.body);
     if (body.path.endsWith(":enrollAuthority")) { enrollCalls++; if (scenario === "after-enroll-revoked") await f.t.run(ctx => ctx.db.patch(f.ids.operator, { isActive: false })); }
     if (body.path.endsWith(":revokeAuthority")) revokeCalls++;
     return Response.json({ status: "success", value: null });
    }
    if (init?.method !== "POST" && scenario === "before-enroll-revoked") await f.t.run(ctx => ctx.db.patch(f.ids.operator, { isActive: false }));
    if (init?.method !== "POST") return Response.json({ ...report, checkedAt: new Date().toISOString(), ...(scenario === "degraded" ? { status: "degraded" } : {}), ...(scenario === "incompatible" ? { engineVersion: "2.0.0" } : {}) });
    signedCalls++;
    if (scenario === "rotated") await f.t.run(async ctx => { const row = (await ctx.db.get(freshConnection))!; await ctx.db.patch(row._id, { credentials: { ...row.credentials!, iv: "newer-credential" } }); });
    if (scenario === "operator-revoked") await f.t.run(ctx => ctx.db.patch(f.ids.operator, { isActive: false }));
    if (scenario === "authority-denied" && !retry) return new Response(null, { status: 401 });
    const body = JSON.parse(init.body);
    return Response.json({ token: "t".repeat(64), controllerId: body.envelope.controllerId, syntheticOperatorId: "operator_test", capabilities: ["health.read"], siteRole: "subscriber", siteCapabilities: ["content.read"], expiresAt: Date.now() + 60000 });
   }) as typeof fetch;
   const mutationMap: Record<string, any> = { createPending, saveEnvelope, markError, recordHealth };
   const context = {
    runQuery: (_ref: any, args: any) => f.invoke(prepare, args),
    runMutation: async (reference: any, args: any) => { const result = await f.invoke(mutationMap[getFunctionName(reference).split(":")[1]], args); if (getFunctionName(reference).endsWith(":createPending")) freshConnection = result.connectionId; return result; },
   };
   const invoke = () => (create as any)._handler(context, { instanceId: f.ids.alpha.instance, name: "New controller", deploymentAdminKey: "synthetic-secret-admin-key" });
   if (scenario === "healthy") expect((await invoke()).status).toBe("healthy");
   else await expect(invoke()).rejects.toThrow();
   const instance = (await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance)))!;
   const connection = (await f.t.run(ctx => ctx.db.get(freshConnection)))!;
   expect(instance.provisioning).toBe(scenario === "healthy" ? "ready" : "unprovisioned");
   if (["before-enroll-revoked", "after-enroll-revoked"].includes(scenario)) {
    expect(enrollCalls).toBe(scenario === "after-enroll-revoked" ? 1 : 0); expect(signedCalls).toBe(0); expect(revokeCalls).toBe(scenario === "after-enroll-revoked" ? 1 : 0);
    expect(connection.isActive).toBe(false); expect(Boolean(connection.credentials)).toBe(false);
    continue;
   }
   expect(enrollCalls).toBe(1); expect(signedCalls).toBe(1); expect(revokeCalls).toBe(0);
   expect(connection.isActive).toBe(true); expect(Boolean(connection.credentials)).toBe(true);
   if (["rotated", "operator-revoked"].includes(scenario)) expect(await f.t.run(ctx => ctx.db.query("overseer_connectionHealthHistory").collect())).toHaveLength(0);
   if (scenario === "authority-denied") {
    retry = true;
    expect((await (testAction as any)._handler(context, { connectionId: freshConnection })).status).toBe("healthy");
    expect(enrollCalls).toBe(1);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance)))!.provisioning).toBe("ready");
   }
  }
 } finally {
  globalThis.fetch = previousFetch;
  if (previousKeys === undefined) delete process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS; else process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = previousKeys;
  if (previousVersion === undefined) delete process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION; else process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION = previousVersion;
 }
});
