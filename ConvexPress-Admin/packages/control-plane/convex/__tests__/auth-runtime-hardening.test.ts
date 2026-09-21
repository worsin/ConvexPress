import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../schema";
import { prepareSession } from "../siteBroker/internal";
import { listTargets } from "../siteBroker/revocationInternal";
import { update as updateOrganization } from "../organizations";
import { update as updateBusiness } from "../businesses";
import { update as updateWebsite } from "../websites";
import { upsertPermission, setPermissionStatus } from "../rbac/mutations";
import { resolveStoredAccess } from "../rbac/runtime";
import { checkManyAccess } from "../rbac/queries";
import { setActive } from "../context";
import { get as getContext } from "../context";
import { propagate } from "../siteBroker/revocation";
import { encryptCredentialPayload } from "../connections/crypto";
import { createControllerCredential } from "../connections/controllerCredentials";
import { generateKeyPairSync } from "node:crypto";

const modules = { "./convex/_generated/server.js": () => import("../_generated/server.js") };

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
        websiteKey: suffix,
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
        instanceKey: suffix,
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
  const documentReads: string[] = [];
  const invoke = (fn: any, args: any, operator = ids.operator) =>
    t.run(async (ctx) => {
      const user = (await ctx.db.get(operator))!;
      return fn._handler(
        {
          ...ctx,
          db: new Proxy(ctx.db, {
            get(target, property) {
              if (property === "get") return (id: any) => { documentReads.push(String(id)); return ctx.db.get(id); };
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
  return { t, ids, scheduled, reads, documentReads, invoke };
}

describe("authorization lifecycle handlers", () => {
  test("48-site portfolio loads shared roles once and refreshes grants on the next request", async () => {
    const f = await fixture(48);
    const context = await f.invoke(getContext, {});
    expect(context.websites).toHaveLength(48);
    expect(context.environments).toHaveLength(48);
    expect(f.reads.filter((table) => table === "overseer_roles")).toHaveLength(0);
    await f.t.run((ctx) =>
      ctx.db.insert("overseer_permissions", {
        subjectType: "role",
        subjectId: "admin",
        actionCode: "website.read",
        effect: "deny",
        status: "active",
      }),
    );
    expect((await f.invoke(getContext, {})).websites).toHaveLength(0);
    expect(f.reads.filter((table) => table === "overseer_roles")).toHaveLength(0);
  });

  test("restricted client cannot use a sibling connection or a disabled parent", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.ids.other, { role: "viewer", authUserId: "auth-client" });
      await ctx.db.insert("overseer_roles", {
        slug: "viewer",
        name: "Viewer",
        level: 1,
        type: "built-in",
        isDefault: false,
        status: "active",
        capabilities: ["site.read"],
        pageAccess: [],
      });
      await ctx.db.insert("overseer_websiteAccess", {
        subjectType: "user",
        subjectId: String(f.ids.other),
        websiteId: f.ids.alpha.website,
        level: "use",
        includeEnvironments: true,
        grantedAt: 1,
      });
    });
    const args = { requestedCapabilities: ["site.select"], requestedSiteRole: "subscriber" };
    await expect(
      f.invoke(prepareSession, { ...args, connectionId: f.ids.alpha.connection }, f.ids.other),
    ).resolves.toMatchObject({ websiteKey: "alpha" });
    await expect(
      f.invoke(prepareSession, { ...args, connectionId: f.ids.beta.connection }, f.ids.other),
    ).rejects.toThrow();
    await f.t.run((ctx) => ctx.db.patch(f.ids.alpha.organization, { isActive: false }));
    await expect(
      f.invoke(prepareSession, { ...args, connectionId: f.ids.alpha.connection }, f.ids.other),
    ).rejects.toThrow();
  });

  for (const scope of ["organization", "business", "website"] as const) {
  test(`revocation transport and retries preserve the disabled ${scope} target`, async () => {
    const f = await fixture();
    const key = Buffer.alloc(32, 7);
    const { privateKey } = generateKeyPairSync("ed25519");
    const credential = createControllerCredential({
      controllerId: "controller_test",
      keyId: "key_test",
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
      deploymentAdminKey: "synthetic-admin-key-12345",
      capabilities: ["session.exchange"],
    });
    const encrypted = encryptCredentialPayload({
      payload: { ...credential },
      key,
      keyVersion: 1,
      aad: `site_alpha|instance_alpha|${String(f.ids.alpha.connection)}`,
    });
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.ids.alpha.connection, { credentials: encrypted });
      await ctx.db.patch(f.ids.alpha.website, { websiteKey: "site_alpha" });
      await ctx.db.patch(f.ids.alpha.instance, { instanceKey: "instance_alpha" });
      await ctx.db.patch(f.ids.alpha[scope], scope === "website" ? { status: "inactive" } : { isActive: false });
    });
    const originalKeys = process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    const retried: any[] = [];
    process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = JSON.stringify({
      "1": key.toString("base64"),
    });
    globalThis.fetch = (async (url: any, init: any) => {
      requests.push(String(url));
      expect(JSON.parse(init.body).body).toEqual({ scope: "controller" });
      return new Response("retry", { status: 503 });
    }) as typeof fetch;
    try {
      const result = await (propagate as any)._handler(
        {
          runQuery: (_ref: any, args: any) => f.invoke(listTargets, args),
          scheduler: {
            runAfter: async (_delay: number, _ref: any, args: any) => retried.push(args),
          },
        },
        { scope: "controller", [`target${scope[0].toUpperCase()}${scope.slice(1)}Id`]: f.ids.alpha[scope], attempt: 0 },
      );
      expect(requests).toEqual([
        "https://alpha.convex.site/api/convexpress/management/session/revoke",
      ]);
      expect(result).toMatchObject({ targets: 1, failed: 1, retryScheduled: true });
      expect(retried).toEqual([
        expect.objectContaining({
          scope: "controller",
          [`target${scope[0].toUpperCase()}${scope.slice(1)}Id`]: f.ids.alpha[scope],
          attempt: 1,
        }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKeys === undefined) delete process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
      else process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = originalKeys;
    }
  });
  }
  for (const parent of ["organization", "business"] as const) {
    test(`inactive ${parent} blocks direct session exchange but not another client`, async () => {
      const f = await fixture();
      await f.t.run((ctx) => ctx.db.patch(f.ids.alpha[parent], { isActive: false }));
      const args = { requestedCapabilities: ["site.select"], requestedSiteRole: "subscriber" };
      await expect(
        f.invoke(prepareSession, { ...args, connectionId: f.ids.alpha.connection }),
      ).rejects.toThrow();
      await expect(
        f.invoke(prepareSession, { ...args, connectionId: f.ids.beta.connection }),
      ).resolves.toMatchObject({ websiteKey: "beta" });
    });

    test(`disabling ${parent} schedules only descendant session revocation`, async () => {
      const f = await fixture();
      await f.invoke(parent === "organization" ? updateOrganization : updateBusiness, {
        [`${parent}Id`]: f.ids.alpha[parent],
        isActive: false,
      });
      expect(f.scheduled).toEqual([
        expect.objectContaining({
          scope: "controller",
          [`target${parent === "organization" ? "Organization" : "Business"}Id`]:
            f.ids.alpha[parent],
        }),
      ]);
      const targets = await f.invoke(listTargets, { [`${parent}Id`]: f.ids.alpha[parent] });
      expect(targets.map((target: any) => target.websiteKey)).toEqual(["alpha"]);
    });
  }

  test("website disable revokes only its environments and permits authorized recovery", async () => {
    const f = await fixture();
    await f.invoke(updateWebsite, { websiteId: f.ids.alpha.website, status: "inactive" });
    expect(f.scheduled).toEqual([{ scope: "controller", targetWebsiteId: f.ids.alpha.website, attempt: 0 }]);
    const targets = await f.invoke(listTargets, { websiteId: f.ids.alpha.website });
    expect(targets.map((target: any) => target.websiteKey)).toEqual(["alpha"]);
    await expect(f.invoke(prepareSession, { connectionId: f.ids.alpha.connection, requestedCapabilities: ["site.select"], requestedSiteRole: "subscriber" })).rejects.toThrow();
    await expect(f.invoke(prepareSession, { connectionId: f.ids.beta.connection, requestedCapabilities: ["site.select"], requestedSiteRole: "subscriber" })).resolves.toMatchObject({ websiteKey: "beta" });
    await f.invoke(updateWebsite, { websiteId: f.ids.alpha.website, status: "inactive" });
    expect(f.scheduled).toHaveLength(1);
    await expect(f.invoke(updateWebsite, { websiteId: f.ids.alpha.website, status: "active", makeDefault: true })).resolves.toMatchObject({ status: "active", isDefault: true });
    expect(f.scheduled).toHaveLength(1);
  });

  test("inactive website update preserves website denies and active-parent checks", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.alpha.website, { status: "inactive" });
      await ctx.db.insert("overseer_permissions", {
        subjectType: "user", subjectId: String(f.ids.operator), actionCode: "website.update",
        effect: "deny", status: "active", constraints: { websiteId: String(f.ids.alpha.website) },
      });
    });
    await expect(f.invoke(updateWebsite, { websiteId: f.ids.alpha.website, status: "active" })).rejects.toThrow();
    await expect(f.invoke(updateWebsite, { websiteId: f.ids.beta.website, title: "Unrelated site" })).resolves.toMatchObject({ title: "Unrelated site" });
    await f.t.run(ctx => ctx.db.patch(f.ids.alpha.business, { isActive: false }));
    await expect(f.invoke(updateWebsite, { websiteId: f.ids.alpha.website, status: "active" }, f.ids.owner)).rejects.toThrow();
    expect((await f.t.run(ctx => ctx.db.get(f.ids.alpha.website)))?.status).toBe("inactive");
  });

  test("inactive lifecycle exception cannot grant a restricted operator another website", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.other, { authUserId: "auth-client" });
      await ctx.db.patch(f.ids.alpha.website, { status: "inactive" });
      await ctx.db.patch(f.ids.beta.website, { status: "inactive" });
      await ctx.db.insert("overseer_permissions", {
        subjectType: "user", subjectId: String(f.ids.other), actionCode: "website.update",
        effect: "allow", status: "active", constraints: { websiteId: String(f.ids.alpha.website) },
      });
    });
    await expect(f.invoke(updateWebsite, { websiteId: f.ids.beta.website, status: "active" }, f.ids.other)).rejects.toThrow();
    await expect(f.invoke(updateWebsite, { websiteId: f.ids.alpha.website, status: "active" }, f.ids.other)).resolves.toMatchObject({ status: "active" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.beta.website)))?.status).toBe("inactive");
  });

  test("permission reassignment revokes the old and new operators", async () => {
    const f = await fixture();
    const permissionId = await f.t.run((ctx) =>
      ctx.db.insert("overseer_permissions", {
        subjectType: "user",
        subjectId: String(f.ids.owner),
        actionCode: "site.read",
        effect: "allow",
        status: "active",
      }),
    );
    await f.invoke(upsertPermission, {
      permissionId,
      subjectType: "user",
      subjectId: String(f.ids.other),
      selectorType: "capability",
      selectorCode: "site.read",
      effect: "allow",
      status: "active",
    });
    expect(f.scheduled.map((job) => job.controllerSubjectId).sort()).toEqual(
      [String(f.ids.owner), String(f.ids.other)].sort(),
    );
  });

  test("moving a role permission to a user revokes controller-wide sessions", async () => {
    const f = await fixture();
    const permissionId = await f.t.run((ctx) =>
      ctx.db.insert("overseer_permissions", {
        subjectType: "role",
        subjectId: "member",
        roleSlug: "member",
        actionCode: "site.read",
        effect: "allow",
        status: "active",
      }),
    );
    await f.invoke(upsertPermission, {
      permissionId,
      subjectType: "user",
      subjectId: String(f.ids.other),
      selectorType: "capability",
      selectorCode: "site.read",
      effect: "allow",
      status: "active",
    });
    expect(f.scheduled).toEqual([expect.objectContaining({ scope: "controller" })]);
  });

  for (const subjectType of ["user", "role"] as const) {
    test(`admin cannot reactivate an owner ${subjectType} deny`, async () => {
      const f = await fixture();
      const permissionId = await f.t.run((ctx) =>
        ctx.db.insert("overseer_permissions", {
          subjectType,
          subjectId: subjectType === "user" ? String(f.ids.owner) : "owner",
          actionCode: "site.read",
          effect: "deny",
          status: "inactive",
        }),
      );
      await expect(
        f.invoke(setPermissionStatus, { permissionId, status: "active" }),
      ).rejects.toThrow("Only an owner");
      await expect(
        f.invoke(setPermissionStatus, { permissionId, status: "active" }, f.ids.owner),
      ).resolves.toBe(permissionId);
    });
  }

  test("permissions beyond the read limit cannot disappear before deny evaluation", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 500; i++)
        await ctx.db.insert("overseer_permissions", {
          subjectType: "role",
          subjectId: "unrelated",
          actionCode: "site.read",
          effect: "deny",
          status: "inactive",
        });
      await ctx.db.insert("overseer_permissions", {
        subjectType: "role",
        subjectId: "admin",
        actionCode: "site.read",
        effect: "deny",
        status: "active",
      });
    });
    const allowed = await f.t.run(async (ctx) => {
      try {
        return (
          await resolveStoredAccess(ctx, (await ctx.db.get(f.ids.operator))!, {
            selector: { type: "capability", code: "site.read" },
            target: {},
          })
        ).allowed;
      } catch {
        return false;
      }
    });
    expect(allowed).toBe(false);
  });
});


test("batched access reads hierarchy once but checks every requested stamp", async () => {
  const f = await fixture();
  const scope = { websiteId: String(f.ids.alpha.website), instanceId: String(f.ids.alpha.instance) };
  const check = { selectorType: "capability", code: "environment.read", ...scope };
  const results = await f.invoke(checkManyAccess, { checks: Array.from({ length: 32 }, () => check) });
  expect(results.every((result: { allowed: boolean }) => result.allowed)).toBe(true);
  for (const id of [f.ids.alpha.website, f.ids.alpha.instance, f.ids.alpha.organization, f.ids.alpha.business]) {
    expect(f.documentReads.filter(value => value === String(id)).length).toBe(1);
  }
  await expect(f.invoke(checkManyAccess, { checks: [check, { ...check, businessId: String(f.ids.beta.business) }] })).rejects.toThrow("inconsistent");
  await f.t.run(ctx => ctx.db.patch(f.ids.alpha.organization, { isActive: false }));
  await expect(f.invoke(checkManyAccess, { checks: [check] })).rejects.toThrow("not active");
});

test("context shares authenticated operator and selection does one authorization pass", async () => {
  const f = await fixture();
  const loaded = await f.invoke(getContext, {});
  expect(loaded.operator).toEqual({ userId: f.ids.operator, email: null, name: null, role: "admin" });
  expect(f.documentReads.filter(value => value === String(f.ids.alpha.organization)).length).toBe(1);
  f.reads.length = 0;
  const selected = await f.invoke(setActive, {
    organizationId: f.ids.beta.organization, businessId: f.ids.beta.business,
    websiteId: f.ids.beta.website, instanceId: f.ids.beta.instance,
  });
  expect(selected.active.instanceId).toBe(f.ids.beta.instance);
  expect(f.reads.filter(value => value === "overseer_websiteAccess").length).toBe(1);
});
