import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import schema from "../../schema";
import { commitVerified, prepareUse } from "../accounts";
import * as receipts from "../provisioning";
import * as deploymentCredentials from "../deploymentCredentials";
import { credential } from "../deploy";
import * as deployActions from "../deploy";
import { createConvexEnvironments, adoptConvexProject } from "../provision";
import { encryptCredentialPayload } from "../../connections/crypto";
import { hostingCredentialAad } from "../policy";
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

async function scenario(run: (f: any) => Promise<void>) {
  const f = await fixture();
  const oldVersion = process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION;
  process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION = "1";
  const oldFetch = globalThis.fetch,
    oldKeys = process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
  const key = Buffer.alloc(32, 8);
  process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = JSON.stringify({ 1: key.toString("base64") });
  const metadata = {
    organizationId: f.ids.alpha.organization,
    businessId: f.ids.alpha.business,
    provider: "convex",
    externalAccountId: "532079",
  };
  const credentials = encryptCredentialPayload({
    payload: { token: "synthetic-convex-team-token" },
    key,
    keyVersion: 1,
    aad: hostingCredentialAad(metadata),
  });
  const account = await f.invoke(commitVerified, {
    ...metadata,
    label: "Synthetic team",
    expectedRevision: 0,
    credentials,
  });
  const state = {
    projects: [] as any[],
    deployKeys: [] as any[],
    onKeyList: undefined as undefined | (() => Promise<void>),
    deployments: [] as any[],
    posts: [] as string[],
    teamId: 532079,
    failure: "" as string,
    onRead: undefined as undefined | (() => Promise<void>),
    sameUrl: false,
    operator: f.ids.operator,
    onKeyWrite: undefined as undefined | (() => Promise<void>),
    wrongProject: false,
  };
  const respond = (value: any) => new Response(JSON.stringify(value), { status: 200 });
  globalThis.fetch = (async (input: any, init: any) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    if (method === "GET" && state.onRead && path.includes("/projects")) {
      const callback = state.onRead;
      state.onRead = undefined;
      await callback();
    }
    if (path === "/v1/token_details")
      return respond({ type: "teamToken", teamId: state.teamId, name: "Synthetic" });
    if (method === "GET" && path.endsWith("/projects"))
      return respond({ items: state.projects, pagination: { hasMore: false } });
    if (method === "GET" && path.endsWith("/list_deployments")) return respond(state.deployments);
    if (method === "GET" && path.endsWith("/list_deploy_keys")) {
      if (state.onKeyList) {
        const callback = state.onKeyList;
        state.onKeyList = undefined;
        await callback();
      }
      return respond(state.deployKeys);
    }
    if (method === "POST") {
      state.posts.push(path);
      const body = JSON.parse(init.body);
      const failure = state.failure;
      state.failure = "";
      if (failure === "rejected") return new Response("rejected", { status: 400 });
      if (failure === "uncertain-empty") throw Error("synthetic network interruption");
      let value: any;
      if (path.endsWith("/create_project")) {
        value = { id: 111, slug: "synthetic-project", name: body.projectName };
        state.projects.push(value);
      } else if (path.endsWith("/create_deployment")) {
        value = {
          name: `synthetic-${body.reference}`,
          deploymentUrl: `https://${state.sameUrl ? "same" : `synthetic-${body.reference}`}.convex.cloud`,
          projectId: state.wrongProject ? 222 : 111,
          kind: "cloud",
          deploymentType: body.type,
          reference: body.reference,
        };
        state.deployments.push(value);
      } else if (path.endsWith("/create_deploy_key")) {
        const name = path.split("/").at(-2)!;
        value = {
          deployKey: `${name.includes("production") ? "prod" : "dev"}:${name}|synthetic-deployment-key`,
        };
        state.deployKeys.push({
          id: state.deployKeys.length,
          name: body.name,
          creationTime: Date.now(),
          allowedActions: ["deployment:deploy"],
        });
        if (state.onKeyWrite) await state.onKeyWrite();
      } else if (path.endsWith("/delete_deploy_key")) {
        state.deployKeys = state.deployKeys.filter((k: any) => k.name !== body.id);
        value = {};
      } else throw Error("Unexpected write " + path);
      if (failure === "uncertain-created") throw Error("synthetic response lost after creation");
      return respond(value);
    }
    throw Error("Unexpected HTTP " + path);
  }) as typeof fetch;
  const dispatch = (ref: any, args: any) => {
    const [moduleName, name] = getFunctionName(ref).split(":");
    const handler =
      moduleName === "hosting/accounts"
        ? prepareUse
        : moduleName === "hosting/provisioning"
          ? (receipts as any)[name]
          : (deploymentCredentials as any)[name];
    if (!handler) throw Error("Unexpected internal function " + moduleName + ":" + name);
    const validator = JSON.parse(handler.exportArgs());
    for (const key of Object.keys(args))
      if (!(key in validator.value)) throw Error(`Unexpected argument ${key}`);
    for (const [key, field] of Object.entries(validator.value) as [string, any][]) {
      if (args[key] === undefined) {
        if (!field.optional) throw Error(`Missing argument ${key}`);
      } else if (field.fieldType.type === "id" && typeof args[key] !== "string")
        throw Error(`Invalid argument ${key}`);
    }
    return f.invoke(handler, args, state.operator);
  };
  const actionCtx = { runQuery: dispatch, runMutation: dispatch };

  const args = {
    accountId: account.accountId,
    websiteId: f.ids.alpha.website,
    idempotencyKey: "synthetic-action-request",
    name: "Synthetic website",
  };
  const create = () => (createConvexEnvironments as any)._handler(actionCtx, args);
  const adopt = (projectId = 111) =>
    (adoptConvexProject as any)._handler(actionCtx, {
      accountId: account.accountId,
      websiteId: f.ids.alpha.website,
      projectId,
    });
  try {
    await run({
      ...f,
      state,
      account,
      args,
      create,
      adopt,
      credential: (instanceId: any) => (credential as any)._handler(actionCtx, { instanceId }),
      recover: (args: any) => (deployActions as any).recoverCredential._handler(actionCtx, args),
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldVersion === undefined) delete process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION;
    else process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION = oldVersion;
    if (oldKeys === undefined) delete process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
    else process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = oldKeys;
  }
}
const existingDeployments = () =>
  ["production", "staging"].map((reference) => ({
    name: `synthetic-${reference}`,
    deploymentUrl: `https://synthetic-${reference}.convex.cloud`,
    projectId: 111,
    kind: "cloud",
    deploymentType: reference === "production" ? "prod" : "dev",
    reference,
  }));
test("real create action resumes confirmed resources without duplicate writes", () =>
  scenario(async (f) => {
    const created = await f.create();
    expect(f.state.posts).toHaveLength(3);
    expect(created.production.name).not.toBe(created.staging.name);
    expect(created.production.deploymentUrl).not.toBe(created.staging.deploymentUrl);
    expect(await f.create()).toEqual(created);
    expect(f.state.posts).toHaveLength(3);
  }));
test("real adoption verifies and resumes existing independent databases without writes", () =>
  scenario(async (f) => {
    f.state.projects = [{ id: 111, slug: "existing", name: "Existing" }];
    f.state.deployments = existingDeployments();
    const result = await f.adopt();
    expect(result.projectId).toBe(111);
    expect(await f.adopt()).toEqual(result);
    expect(f.state.posts).toHaveLength(0);
  }));
test("real action retries explicit rejection but uncertain writes require reconciliation", () =>
  scenario(async (f) => {
    f.state.failure = "rejected";
    await expect(f.create()).rejects.toThrow("400");
    expect(f.state.posts).toHaveLength(1);
    await f.create();
    expect(f.state.posts).toHaveLength(4);
  }));
test("real action reconciles a lost project response without recreating it", () =>
  scenario(async (f) => {
    f.state.failure = "uncertain-created";
    await expect(f.create()).rejects.toThrow("confirmed");
    expect(f.state.projects).toHaveLength(1);
    await f.create();
    expect(f.state.posts.filter((p: string) => p.endsWith("create_project"))).toHaveLength(1);
  }));
test("real action does not retry a write whose existence remains unknown", () =>
  scenario(async (f) => {
    f.state.failure = "uncertain-empty";
    await expect(f.create()).rejects.toThrow();
    await expect(f.create()).rejects.toThrow("unconfirmed");
    expect(f.state.posts).toHaveLength(1);
  }));
test("real action reauthorizes account revision immediately before provider writes", () =>
  scenario(async (f) => {
    f.state.onRead = () =>
      f.t.run((ctx: any) => ctx.db.patch(f.account.accountId, { revision: 2 }));
    await expect(f.create()).rejects.toThrow("credentials changed");
    expect(f.state.posts).toHaveLength(0);
  }));
test("real action rejects changed team and adoption outside its verified team", () =>
  scenario(async (f) => {
    f.state.teamId = 999;
    await expect(f.create()).rejects.toThrow("team identity changed");
    expect(f.state.posts).toHaveLength(0);
    f.state.teamId = 532079;
    await expect(f.adopt()).rejects.toThrow("not in the connected");
    expect(f.state.posts).toHaveLength(0);
  }));
test("real action rejects provider deployment project mismatch", () =>
  scenario(async (f) => {
    f.state.wrongProject = true;
    await expect(f.create()).rejects.toThrow("identity does not match");
    expect(f.state.posts).toHaveLength(2);
    await expect(f.create()).rejects.toThrow("project identity mismatch");
    expect(f.state.posts).toHaveLength(2);
  }));
test("real action refuses a shared production and staging URL", () =>
  scenario(async (f) => {
    f.state.projects = [{ id: 111, slug: "existing", name: "Existing" }];
    f.state.deployments = existingDeployments().map((d) => ({
      ...d,
      deploymentUrl: "https://same.convex.cloud",
    }));
    await expect(f.adopt()).rejects.toThrow("Deployment URL does not match its name");
    expect(f.state.posts).toHaveLength(0);
  }));

test("confirmed cloud receipt attaches both environments atomically and repeats without duplicates", () =>
  scenario(async (f) => {
    const { attach } = await import("../instances");
    const receipt = await f.create();
    const args = {
      receiptId: receipt.receiptId,
      productionSiteOrigin: "https://site.example",
      stagingSiteOrigin: "https://staging.site.example",
    };
    const result = await f.invoke(attach, args);
    expect(result.production.kind).toBe("live");
    expect(result.staging.kind).toBe("staging");
    expect(result.production.deploymentOrigin).toBe("https://synthetic-production.convex.cloud");
    expect(result.staging.managementOrigin).toBe("https://synthetic-staging.convex.site");
    expect(await f.invoke(attach, args)).toEqual(result);
    expect(
      await f.t.run(
        async (ctx: any) => (await ctx.db.query("overseer_hostingAttachments").collect()).length,
      ),
    ).toBe(1);
    await expect(
      f.invoke(attach, { ...args, productionSiteOrigin: "https://changed.example" }),
    ).rejects.toThrow("different");
    await f.t.run((ctx: any) => ctx.db.patch(f.ids.alpha.business, { isActive: false }));
    await expect(f.invoke(attach, args)).rejects.toThrow("not active");
  }));
test("receipt attachment recovers a manually attached production target and rejects identity drift", () =>
  scenario(async (f) => {
    const { attach } = await import("../instances");
    const { attach: manualAttach } = await import("../../websiteInstances");
    const receipt = await f.create();
    const production = await f.invoke(manualAttach, {
      websiteId: f.ids.alpha.website,
      instanceKey: "synthetic_existing_production",
      kind: "live",
      label: "Production",
      deploymentOrigin: "https://synthetic-production.convex.cloud",
      managementOrigin: "https://synthetic-production.convex.site",
      siteOrigin: "https://site.example",
      deploymentName: "synthetic-production",
      projectRef: "111",
      makeDefault: true,
    });
    const result = await f.invoke(attach, {
      receiptId: receipt.receiptId,
      productionSiteOrigin: "https://site.example",
      stagingSiteOrigin: "https://staging.site.example",
    });
    expect(result.production.instanceId).toBe(production.instanceId);
    await f.t.run((ctx: any) => ctx.db.patch(result.production.instanceId, { projectRef: "999" }));
    await expect(
      f.invoke(attach, {
        receiptId: receipt.receiptId,
        productionSiteOrigin: "https://site.example",
        stagingSiteOrigin: "https://staging.site.example",
      }),
    ).rejects.toThrow("different");
  }));
test("attachment rolls back production when staging origin is occupied", () =>
  scenario(async (f) => {
    const { attach } = await import("../instances");
    const receipt = await f.create();
    await expect(
      f.invoke(attach, {
        receiptId: receipt.receiptId,
        productionSiteOrigin: "https://site.example",
        stagingSiteOrigin: "https://beta.example",
      }),
    ).rejects.toThrow("already attached");
    expect(
      await f.t.run(
        async (ctx: any) =>
          (
            await ctx.db
              .query("overseer_websiteInstances")
              .withIndex("by_deployment_origin", (q: any) =>
                q.eq("deploymentOrigin", "https://synthetic-production.convex.cloud"),
              )
              .collect()
          ).length,
      ),
    ).toBe(0);
  }));

test("attached provider identity cannot be edited away from its immutable receipt", () =>
  scenario(async (f) => {
    const { attach } = await import("../instances");
    const { update } = await import("../../websiteInstances");
    const receipt = await f.create();
    const attached = await f.invoke(attach, {
      receiptId: receipt.receiptId,
      productionSiteOrigin: "https://site.example",
      stagingSiteOrigin: "https://staging.site.example",
    });
    for (const patch of [
      { deploymentOrigin: "https://other.convex.cloud" },
      { managementOrigin: "https://other.convex.site" },
      { projectRef: "999" },
      { deploymentName: "other" },
    ])
      await expect(
        f.invoke(update, { instanceId: attached.production.instanceId, ...patch }),
      ).rejects.toThrow("confirmed hosting receipt");
    expect(
      (
        await f.invoke(update, {
          instanceId: attached.production.instanceId,
          label: "Renamed production",
        })
      ).label,
    ).toBe("Renamed production");
  }));

async function registered(f: any) {
  const { attach } = await import("../instances");
  const result = await f.create();
  return f.invoke(attach, {
    receiptId: result.receiptId,
    productionSiteOrigin: "https://site.example",
    stagingSiteOrigin: "https://staging.site.example",
  });
}
const keyWrites = (f: any) =>
  f.state.posts.filter((path: string) => path.endsWith("/create_deploy_key"));
test("deployment credential action caches encrypted target key and rechecks account revocation", () =>
  scenario(async (f) => {
    const attached = await registered(f);
    const first = await f.credential(attached.production.instanceId);
    expect(first.deploymentAdminKey).toBe("prod:synthetic-production|synthetic-deployment-key");
    expect(first.websiteKey).toBe("website_alpha");
    expect(await f.credential(attached.production.instanceId)).toEqual(first);
    expect(keyWrites(f)).toHaveLength(1);
    const stored = await f.t.run(
      async (ctx: any) =>
        (await ctx.db.query("overseer_hostingDeploymentCredentials").collect())[0],
    );
    expect(JSON.stringify(stored)).not.toContain("synthetic-deployment-key");
    await f.t.run((ctx: any) =>
      ctx.db.patch(f.account.accountId, { status: "revoked", credentials: undefined }),
    );
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow("revoked");
    expect(keyWrites(f)).toHaveLength(1);
  }));
test("deployment credential action denies customer and live-denied operators including cached access", () =>
  scenario(async (f) => {
    const attached = await registered(f);
    await f.credential(attached.production.instanceId);
    f.state.operator = f.ids.other;
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow();
    f.state.operator = f.ids.operator;
    await f.t.run((ctx: any) =>
      ctx.db.insert("overseer_permissions", {
        subjectType: "user",
        subjectId: String(f.ids.operator),
        actionCode: "environment.live.operate",
        effect: "deny",
        status: "active",
      }),
    );
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow();
    expect(keyWrites(f)).toHaveLength(1);
    expect((await f.credential(attached.staging.instanceId)).environmentKind).toBe("staging");
  }));
test("concurrent deployment credential actions issue only one provider key", () =>
  scenario(async (f) => {
    const attached = await registered(f);
    const results = await Promise.allSettled([
      f.credential(attached.production.instanceId),
      f.credential(attached.production.instanceId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThan(0);
    expect(keyWrites(f)).toHaveLength(1);
  }));
test("uncertain deployment key issuance never automatically issues a duplicate", () =>
  scenario(async (f) => {
    const attached = await registered(f);
    f.state.failure = "uncertain-created";
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow("confirmed");
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow(
      "pending reconciliation",
    );
    expect(keyWrites(f)).toHaveLength(1);
  }));
test("definitive deployment key rejection allows one corrected retry", () =>
  scenario(async (f) => {
    const attached = await registered(f);
    f.state.failure = "rejected";
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow("400");
    expect((await f.credential(attached.production.instanceId)).deploymentAdminKey).toContain(
      "prod:synthetic-production|",
    );
    expect(keyWrites(f)).toHaveLength(2);
  }));
test("deployment key is not released if account revokes during provider response", () =>
  scenario(async (f) => {
    const attached = await registered(f);
    f.state.onKeyWrite = () =>
      f.t.run((ctx: any) =>
        ctx.db.patch(f.account.accountId, { status: "revoked", credentials: undefined }),
      );
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow("revoked");
    expect(keyWrites(f)).toHaveLength(1);
  }));
test("deployment credential rejects encrypted envelope transplanted across targets and identity drift", () =>
  scenario(async (f) => {
    const attached = await registered(f);
    await f.credential(attached.production.instanceId);
    await f.credential(attached.staging.instanceId);
    await f.t.run(async (ctx: any) => {
      const rows = await ctx.db.query("overseer_hostingDeploymentCredentials").collect();
      const production = rows.find((r: any) => r.instanceId === attached.production.instanceId),
        staging = rows.find((r: any) => r.instanceId === attached.staging.instanceId);
      await ctx.db.patch(staging._id, { envelope: production.envelope });
    });
    await expect(f.credential(attached.staging.instanceId)).rejects.toThrow();
    expect(keyWrites(f)).toHaveLength(2);
    await f.t.run((ctx: any) =>
      ctx.db.patch(attached.production.instanceId, { deploymentName: "other" }),
    );
    await expect(f.credential(attached.production.instanceId)).rejects.toThrow(
      "confirmed resource",
    );
  }));

async function pendingRecovery(f: any) {
  const attached = await registered(f);
  f.state.failure = "uncertain-created";
  await expect(f.credential(attached.production.instanceId)).rejects.toThrow();
  const row = await f.t.run(
    async (ctx: any) => (await ctx.db.query("overseer_hostingDeploymentCredentials").collect())[0],
  );
  const args = {
    instanceId: attached.production.instanceId,
    credentialId: row._id,
    confirmationDeploymentName: row.deploymentName,
  };
  return {
    attached,
    row,
    args,
    age: () =>
      f.t.run((ctx: any) => ctx.db.patch(row._id, { updatedAt: Date.now() - 16 * 60_000 })),
  };
}
test("explicit recovery revokes only the stale receipt key then permits a fenced fresh issuance", () =>
  scenario(async (f) => {
    const p = await pendingRecovery(f);
    f.state.deployKeys.push({
      id: 100,
      name: "Customer CI",
      creationTime: Date.now(),
      allowedActions: [],
    });
    await expect(f.recover(p.args)).rejects.toThrow("15 minutes");
    await p.age();
    expect(await f.recover(p.args)).toEqual({ state: "retry_ready" });
    expect(f.state.deployKeys.map((k: any) => k.name)).toEqual(["Customer CI"]);
    expect(keyWrites(f)).toHaveLength(1);
    await f.credential(p.attached.production.instanceId);
    expect(keyWrites(f)).toHaveLength(2);
    expect(f.state.deployKeys[1].name).toBe(`ConvexPress ${p.row._id} attempt 1`);
    await expect(f.recover(p.args)).rejects.toThrow("ready");
  }));
test("recovery rejects ambiguous names, wrong confirmation, and revoked scope without deletion", () =>
  scenario(async (f) => {
    const p = await pendingRecovery(f);
    await p.age();
    await expect(f.recover({ ...p.args, confirmationDeploymentName: "wrong" })).rejects.toThrow(
      "confirmation",
    );
    f.state.deployKeys.push({ ...f.state.deployKeys[0], id: 101 });
    await expect(f.recover(p.args)).rejects.toThrow("ambiguous");
    expect(f.state.posts.filter((x: string) => x.endsWith("/delete_deploy_key"))).toHaveLength(0);
    await p.age();
    f.state.deployKeys.pop();
    f.state.onKeyList = () =>
      f.t.run((ctx: any) => ctx.db.patch(f.account.accountId, { status: "revoked" }));
    await expect(f.recover(p.args)).rejects.toThrow("revoked");
    expect(f.state.posts.filter((x: string) => x.endsWith("/delete_deploy_key"))).toHaveLength(0);
  }));
test("lost recovery deletion response resumes after lease expiry without reissuing or touching other keys", () =>
  scenario(async (f) => {
    const p = await pendingRecovery(f);
    await p.age();
    f.state.failure = "uncertain-created";
    await expect(f.recover(p.args)).rejects.toThrow();
    expect(f.state.deployKeys).toHaveLength(0);
    expect(keyWrites(f)).toHaveLength(1);
    await expect(f.recover(p.args)).rejects.toThrow("15 minutes");
    await p.age();
    expect(await f.recover(p.args)).toEqual({ state: "retry_ready" });
    expect(f.state.posts.filter((x: string) => x.endsWith("/delete_deploy_key"))).toHaveLength(1);
  }));

test("concurrent recovery claims delete the receipt orphan once and stale generations cannot commit", () =>
  scenario(async (f) => {
    const p = await pendingRecovery(f);
    await p.age();
    const results = await Promise.allSettled([f.recover(p.args), f.recover(p.args)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.state.posts.filter((x: string) => x.endsWith("/delete_deploy_key"))).toHaveLength(1);
    const claimed = await f.invoke(deploymentCredentials.claim, {
      instanceId: p.args.instanceId,
      accountRevision: 1,
    });
    expect(claimed.generation).toBe(1);
    const envelope = encryptCredentialPayload({
      payload: { deployKey: "synthetic-old" },
      key: Buffer.alloc(32, 8),
      keyVersion: 1,
      aad: "synthetic",
    });
    await expect(
      f.invoke(deploymentCredentials.commit, { credentialId: p.row._id, generation: 0, envelope }),
    ).rejects.toThrow("not pending");
    await f.invoke(deploymentCredentials.rejected, { credentialId: p.row._id, generation: 0 });
    const row = await f.t.run((ctx: any) => ctx.db.get(p.row._id));
    expect(row.state).toBe("intent");
    expect(row.generation).toBe(1);
  }));
test("recovery fences an abandoned recovery worker and hides unavailable recovery status", () =>
  scenario(async (f) => {
    const p = await pendingRecovery(f);
    await p.age();
    const lease = "00000000-0000-4000-8000-000000000001";
    await f.invoke(deploymentCredentials.claimRecovery, { ...p.args, accountRevision: 1, lease });
    await p.age();
    await f.recover(p.args);
    await expect(
      f.invoke(deploymentCredentials.finishRecovery, {
        credentialId: p.row._id,
        generation: 0,
        lease,
      }),
    ).rejects.toThrow("lease changed");
    expect(
      await f.invoke(deploymentCredentials.recoveryStatus, { instanceId: p.args.instanceId }),
    ).toBeNull();
    const claimed = await f.invoke(deploymentCredentials.claim, {
      instanceId: p.args.instanceId,
      accountRevision: 1,
    });
    expect(claimed.create).toBe(true);
    const status = await f.invoke(deploymentCredentials.recoveryStatus, {
      instanceId: p.args.instanceId,
    });
    expect(status.state).toBe("intent");
    expect(JSON.stringify(status)).not.toContain("envelope");
    expect(
      await f.invoke(
        deploymentCredentials.recoveryStatus,
        { instanceId: p.args.instanceId },
        f.ids.other,
      ),
    ).toBeNull();
  }));
test("recovery never unlocks issuance while the provider still lists the receipt key", () =>
  scenario(async (f) => {
    const p = await pendingRecovery(f);
    await p.age();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) =>
      String(url).endsWith("/delete_deploy_key")
        ? new Response("{}", { status: 200 })
        : originalFetch(url, init)) as typeof fetch;
    await expect(f.recover(p.args)).rejects.toThrow("revocation could not be confirmed");
    await expect(f.credential(p.args.instanceId)).rejects.toThrow("pending reconciliation");
    expect(keyWrites(f)).toHaveLength(1);
  }));
test("recovery refuses changed team or project and current live permission denial before deletion", () =>
  scenario(async (f) => {
    const p = await pendingRecovery(f);
    await p.age();
    f.state.teamId = 123;
    await expect(f.recover(p.args)).rejects.toThrow("team identity");
    f.state.teamId = 532079;
    const projects = f.state.projects;
    f.state.projects = [];
    await expect(f.recover(p.args)).rejects.toThrow("project no longer");
    f.state.projects = projects;
    await f.t.run((ctx: any) =>
      ctx.db.insert("overseer_permissions", {
        subjectType: "user",
        subjectId: String(f.ids.operator),
        actionCode: "environment.live.operate",
        effect: "deny",
        status: "active",
      }),
    );
    await expect(f.recover(p.args)).rejects.toThrow();
    expect(f.state.posts.filter((x: string) => x.endsWith("/delete_deploy_key"))).toHaveLength(0);
  }));
