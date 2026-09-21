import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import schema from "../../schema";
import * as records from "../cloudflareOAuthRecords";
import * as accounts from "../accounts";
import { begin, complete, getCloudflareToken } from "../cloudflareOAuth";
import { CLOUDFLARE_CALLBACK } from "../cloudflareOAuthClient";
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
      authUserId: "auth-member",
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
        provisioning: "ready",
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
      const fields = JSON.parse(fn.exportArgs()).value;
      for (const key of Object.keys(args)) if (!(key in fields)) throw Error(`Unexpected argument ${key}`);
      for (const [key, field] of Object.entries(fields) as [string, any][]) if (args[key] === undefined && !field.optional) throw Error(`Missing argument ${key}`);
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
async function flow() {
 const f = await fixture();
 const config = { CONVEXPRESS_CLOUDFLARE_OAUTH_CLIENT_ID: "convexpress-test-client", CONVEXPRESS_CLOUDFLARE_OAUTH_REDIRECT_URI: CLOUDFLARE_CALLBACK, CONVEXPRESS_CLOUDFLARE_OAUTH_SCOPES: "offline_access workers-test.write", CONVEXPRESS_CONNECTION_ENVELOPE_KEYS: JSON.stringify({ "1": Buffer.alloc(32, 7).toString("base64") }), CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION: "1" };
 const old = Object.fromEntries(Object.keys(config).map(k => [k, process.env[k]])); Object.assign(process.env, config);
 const oldFetch = globalThis.fetch;
 const state = { writes: 0, failure: "", afterWrite: null as null | (() => Promise<void>), operator: f.ids.operator };
 globalThis.fetch = (async (input: any, init: any) => {
  if (String(input) === "https://dash.cloudflare.com/oauth2/token") {
   expect(init.redirect).toBe("error"); const form = new URLSearchParams(init.body); expect(form.get("client_id")).toBe(config.CONVEXPRESS_CLOUDFLARE_OAUTH_CLIENT_ID); expect(form.has("client_secret")).toBe(false);
   if (form.get("grant_type") === "authorization_code") { expect(form.get("redirect_uri")).toBe(CLOUDFLARE_CALLBACK); expect(form.get("code_verifier")?.length).toBe(43); }
   state.writes++; if (state.afterWrite) await state.afterWrite();
   if (state.failure === "lost") throw Error("synthetic sensitive provider detail");
   return Response.json({ access_token: `synthetic-access-token-${state.writes}`, refresh_token: `synthetic-refresh-token-${state.writes}`, token_type: "Bearer", expires_in: 3600 });
  }
  expect(String(input)).toBe("https://api.cloudflare.com/client/v4/accounts/" + "a".repeat(32));
  if (state.failure === "verify") return new Response(null, { status: 503 });
  return Response.json({ success: true, result: { id: state.failure === "mismatch" ? "b".repeat(32) : "a".repeat(32), name: "Synthetic Cloudflare" } });
 }) as typeof fetch;
 const dispatch = (ref: any, args: any) => { const [module, name] = getFunctionName(ref).split(":"); return f.invoke((module.endsWith("cloudflareOAuthRecords") ? records : accounts as any)[name], args, state.operator); };
 const ctx = { runQuery: dispatch, runMutation: dispatch } as any;
 const args = { organizationId: f.ids.alpha.organization, businessId: f.ids.alpha.business, externalAccountId: "a".repeat(32), expectedRevision: 0 };
 const start = () => (begin as any)._handler(ctx, args);
 const finish = (state: string) => (complete as any)._handler(ctx, { state, code: "synthetic-code" });
 return { ...f, state, ctx, args, start, finish, cleanup() { globalThis.fetch = oldFetch; for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
}
test("PKCE encrypted state and exact-account callback are idempotent and secret-free", async () => {
 const f = await flow(); try {
  const auth = await f.start(); const url = new URL(auth.authorizationUrl);
  expect(url.origin + url.pathname).toBe("https://dash.cloudflare.com/oauth2/auth"); expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  const result = await f.finish(auth.state); expect(await f.finish(auth.state)).toEqual(result); expect(f.state.writes).toBe(1);
  const list = await f.invoke(accounts.list, { organizationId: f.args.organizationId, businessId: f.args.businessId });
  expect(list[0]).toMatchObject({ credentialKind: "oauth", credentialState: "ready", revision: 1 }); expect(JSON.stringify(list)).not.toContain("synthetic-access"); expect(JSON.stringify(list)).not.toContain("synthetic-refresh");
  const attempts = await f.t.run(ctx => ctx.db.query("overseer_hostingOAuthAttempts").collect()); expect(JSON.stringify(attempts)).not.toContain(auth.state); expect(attempts[0].tokens).toBeUndefined();
 } finally { f.cleanup(); }
});
test("wrong operator, state, account or inactive parent cannot finish authorization", async () => {
 for (const failure of ["operator", "state", "mismatch", "parent"]) { const f = await flow(); try {
  const auth = await f.start(); if (failure === "operator") f.state.operator = f.ids.owner;
  if (failure === "parent") await f.t.run(ctx => ctx.db.patch(f.ids.alpha.organization, { isActive: false })); f.state.failure = failure;
  await expect(f.finish(failure === "state" ? "x".repeat(43) : auth.state)).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("overseer_hostingAccounts").collect())).toHaveLength(0); if (failure !== "mismatch") expect(f.state.writes).toBe(0);
 } finally { f.cleanup(); } }
});
test("lost code exchange cannot replay; persisted response resumes verification", async () => {
 for (const failure of ["lost", "verify"]) { const f = await flow(); try {
  const auth = await f.start(); f.state.failure = failure; await expect(f.finish(auth.state)).rejects.toThrow(); f.state.failure = "";
  if (failure === "lost") await expect(f.finish(auth.state)).rejects.toThrow("uncertain"); else expect((await f.finish(auth.state)).provider).toBe("cloudflare"); expect(f.state.writes).toBe(1);
 } finally { f.cleanup(); } }
});
test("renewal rotates once, preserves account revision and fences concurrent claims", async () => {
 const f = await flow(); try {
  const auth = await f.start(); const a = await f.finish(auth.state); await f.t.run(ctx => ctx.db.patch(a.accountId, { credentialExpiresAt: Date.now() - 1 }));
  f.state.afterWrite = async () => { await expect(f.invoke(records.claimRefresh, { accountId: a.accountId, lease: "other-lease" })).rejects.toThrow("already running"); };
  const result = await getCloudflareToken(f.ctx, a.accountId); expect(result.revision).toBe(1); expect(result.generation).toBe(2); expect(f.state.writes).toBe(2);
  expect((await getCloudflareToken(f.ctx, a.accountId)).token).toBe(result.token); expect(f.state.writes).toBe(2);
 } finally { f.cleanup(); }
});
test("uncertain refresh reconnects, persisted refresh resumes, and revocation rejects completion", async () => {
 for (const failure of ["lost", "verify", "revoke"]) { const f = await flow(); try {
  const auth = await f.start(); const a = await f.finish(auth.state); await f.t.run(ctx => ctx.db.patch(a.accountId, { credentialExpiresAt: Date.now() - 1 })); f.state.failure = failure;
  if (failure === "revoke") f.state.afterWrite = async () => { await f.invoke(accounts.revoke, { accountId: a.accountId, expectedRevision: 1 }); };
  await expect(getCloudflareToken(f.ctx, a.accountId)).rejects.toThrow(); f.state.failure = "";
  if (failure === "verify") expect((await getCloudflareToken(f.ctx, a.accountId)).generation).toBe(2); else await expect(getCloudflareToken(f.ctx, a.accountId)).rejects.toThrow(); expect(f.state.writes).toBe(2);
 } finally { f.cleanup(); } }
});

test("expired API tokens stop before provider calls and replacing credentials keeps the account ID", async () => {
 const f = await flow(); try {
  const auth = await f.start(), a = await f.finish(auth.state);
  const original = await f.t.run(ctx => ctx.db.get(a.accountId));
  await f.t.run(ctx => ctx.db.patch(a.accountId, { credentialKind: "api_token", credentialExpiresAt: Date.now() - 1 }));
  await expect(getCloudflareToken(f.ctx, a.accountId)).rejects.toThrow("expired"); expect(f.state.writes).toBe(1);
  const replacement = await f.invoke(accounts.commitVerified, { ...f.args, provider: "cloudflare", label: "Synthetic replacement", expectedRevision: 1, credentials: original!.credentials, credentialKind: "api_token", credentialExpiresAt: Date.now() + 3600000 });
  expect(replacement.accountId).toBe(a.accountId); expect(replacement.revision).toBe(2); expect(replacement.credentialState).toBe("ready");
  expect((await getCloudflareToken(f.ctx, a.accountId)).revision).toBe(2);
 } finally { f.cleanup(); }
});
test("an expired in-flight refresh cannot be silently retried after process loss", async () => {
 const f = await flow(); try {
  const auth = await f.start(), a = await f.finish(auth.state);
  await f.t.run(ctx => ctx.db.patch(a.accountId, { credentialExpiresAt: Date.now() - 1 }));
  await f.invoke(records.claimRefresh, { accountId: a.accountId, lease: "crashed-process" });
  await f.t.run(ctx => ctx.db.patch(a.accountId, { refreshLeaseUntil: Date.now() - 1 }));
  await expect(getCloudflareToken(f.ctx, a.accountId)).rejects.toThrow("response was lost"); expect(f.state.writes).toBe(1);
 } finally { f.cleanup(); }
});
test("replacement during authorization prevents exchange under a superseded account revision", async () => {
 const f = await flow(); try {
  const auth = await f.start(), a = await f.finish(auth.state);
  f.args.expectedRevision = 1; const next = await f.start();
  await f.invoke(accounts.revoke, { accountId: a.accountId, expectedRevision: 1 });
  await expect(f.finish(next.state)).rejects.toThrow("changed"); expect(f.state.writes).toBe(1);
 } finally { f.cleanup(); }
});

test("actual API-token connect persists only verified lifetime and rejects expired provider metadata", async () => {
 const f = await flow(); try {
  const { connect } = await import("../actions");
  const providerFetch = globalThis.fetch; let expired = true;
  globalThis.fetch = (async (url: any, init: any) => String(url).endsWith("/user/tokens/verify") ? Response.json({ success: true, result: { id: "synthetic-token-id", status: expired ? "expired" : "active", expires_on: new Date(Date.now() + 3600000).toISOString() } }) : providerFetch(url, init)) as typeof fetch;
  const input = { ...f.args, provider: "cloudflare", cloudflareTokenKind: "user", token: "synthetic-user-api-token" };
  await expect((connect as any)._handler(f.ctx, input)).rejects.toThrow("API token verification failed");
  expect(await f.t.run(ctx => ctx.db.query("overseer_hostingAccounts").collect())).toHaveLength(0);
  expired = false; const a = await (connect as any)._handler(f.ctx, input);
  const stored = await f.invoke(accounts.prepareUse, { accountId: a.accountId });
  expect(stored.credentialKind).toBe("api_token"); expect(stored.credentialExpiresAt).toBeGreaterThan(Date.now());
  expect(JSON.stringify(a)).not.toContain(input.token);
 } finally { f.cleanup(); }
});
