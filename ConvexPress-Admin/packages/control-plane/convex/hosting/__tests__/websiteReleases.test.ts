import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { begin, checkpoint, interrupted, prepare, status, complete } from "../websiteReleases";
import { commitVerified, revoke } from "../accounts";
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
        siteOrigin: `https://${suffix}.team.workers.dev`,
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

const envelope = { encrypted: "synthetic-ciphertext", iv: "synthetic-iv", authTag: "synthetic-tag", version: 1, createdAt: 1, updatedAt: 1, lastRotatedAt: 1 };
async function setup() {
  const f = await fixture();
  const account = await f.invoke(commitVerified, { organizationId: f.ids.alpha.organization, businessId: f.ids.alpha.business, provider: "cloudflare", externalAccountId: "a".repeat(32), label: "Synthetic Cloudflare", expectedRevision: 0, credentials: envelope });
  const input = { instanceId: f.ids.alpha.instance, accountId: account.accountId, workerName: "alpha", artifactHash: "b".repeat(64) };
  return { ...f, account, input };
}
test("durable release excludes credentials and leases from public status, rejects cross-business/member access", async () => {
  const f = await setup();
  await expect(f.invoke(begin, f.input, f.ids.other)).rejects.toThrow();
  await expect(f.invoke(begin, { ...f.input, instanceId: f.ids.beta.instance })).rejects.toThrow();
  const release = await f.invoke(begin, f.input);
  const view = await f.invoke(status, { instanceId: f.input.instanceId });
  expect(view.latest.releaseId).toBe(release.releaseId);
  expect(JSON.stringify(view)).not.toContain("synthetic-ciphertext");
  expect(JSON.stringify(view)).not.toContain(release.leaseToken);
  await expect(f.invoke(begin, f.input)).rejects.toThrow("active");
});
test("Worker binding is immutable and cannot be shared across environments", async () => {
  const f = await setup(); const r = await f.invoke(begin, f.input);
  await f.invoke(interrupted, { releaseId: r.releaseId, leaseToken: r.leaseToken });
  await expect(f.invoke(begin, { ...f.input, workerName: "beta" })).rejects.toThrow();
  const alternate = await f.invoke(commitVerified, { organizationId: f.ids.alpha.organization, businessId: f.ids.alpha.business, provider: "cloudflare", externalAccountId: "c".repeat(32), label: "Other", expectedRevision: 0, credentials: envelope });
  await expect(f.invoke(begin, { ...f.input, accountId: alternate.accountId })).rejects.toThrow("bound");
});
test("uncertain upload retries keep receipt and hash, stale leases and revoked accounts cannot upload", async () => {
  const f = await setup(); const r = await f.invoke(begin, f.input); const lease = { releaseId: r.releaseId, leaseToken: r.leaseToken };
  await f.invoke(checkpoint, { ...lease, phase: "worker" }); await f.invoke(interrupted, lease);
  await expect(f.invoke(begin, { ...f.input, artifactHash: "c".repeat(64) })).rejects.toThrow("original artifact");
  const resumed = await f.invoke(begin, f.input); expect(resumed.releaseId).toBe(r.releaseId); expect(resumed.leaseToken).not.toBe(r.leaseToken);
  await expect(f.invoke(checkpoint, { ...lease, phase: "worker" })).rejects.toThrow("lease");
  await f.invoke(revoke, { accountId: f.account.accountId, expectedRevision: 1 });
  await expect(f.invoke(prepare, { releaseId: resumed.releaseId, leaseToken: resumed.leaseToken })).rejects.toThrow();
});
test("live confirmation and registered runtime identity are rechecked", async () => {
  const f = await setup(); await f.t.run(ctx => ctx.db.patch(f.input.instanceId, { kind: "live" }));
  await expect(f.invoke(begin, f.input)).rejects.toThrow("Confirm");
  const r = await f.invoke(begin, { ...f.input, confirmLive: true });
  await f.t.run(ctx => ctx.db.patch(f.input.instanceId, { deploymentOrigin: "https://different.convex.cloud" }));
  await expect(f.invoke(checkpoint, { releaseId: r.releaseId, leaseToken: r.leaseToken, phase: "assets" })).rejects.toThrow("changed");
});

test("explicit live-operation denial stops publication even for agency administrators", async () => {
  const f = await setup(); await f.t.run(async ctx => {
    await ctx.db.patch(f.input.instanceId, { kind: "live" });
    await ctx.db.insert("overseer_permissions", { subjectType: "user", subjectId: String(f.ids.operator), actionCode: "environment.live.operate", effect: "deny", status: "active" });
  });
  await expect(f.invoke(begin, { ...f.input, confirmLive: true })).rejects.toThrow();
});

function evidence(releaseId: string, result: "verified" | "failed" = "verified") {
  return { releaseId, instanceKey: "instance_alpha", artifactHash: "b".repeat(64), siteOrigin: "https://alpha.team.workers.dev", checkedAt: Date.now(), attempts: 1, result, routes: ["/", "/document-preview/"].map(path => ({ path, code: result === "verified" ? "ok" : "http", status: result === "verified" ? 200 : 500, bytes: result === "verified" ? 100 : 0 })) };
}
test("actual completion requires fresh exact release evidence for both real routes", async () => {
  const f = await setup(); const r = await f.invoke(begin, f.input); const lease = { releaseId: r.releaseId, leaseToken: r.leaseToken };
  for (const verification of [{ ...evidence(r.releaseId), releaseId: "another" }, { ...evidence(r.releaseId), checkedAt: Date.now() - 60_000 }, { ...evidence(r.releaseId), routes: evidence(r.releaseId).routes.slice(0, 1) }, { ...evidence(r.releaseId), instanceKey: "wrong_instance" }]) await expect(f.invoke(complete, { ...lease, verification })).rejects.toThrow("verification");
  expect((await f.invoke(status, { instanceId: f.input.instanceId })).latest.state).toBe("intent");
  await f.invoke(complete, { ...lease, verification: evidence(r.releaseId) });
  const stored = await f.t.run(ctx => ctx.db.get(r.releaseId)); expect(stored?.state).toBe("succeeded"); expect(stored?.runtimeVerification?.routes).toHaveLength(2);
});
test("failed public runtime persists after desktop interruption; same-release retry can verify without a new receipt", async () => {
  const f = await setup(); const r = await f.invoke(begin, f.input); const lease = { releaseId: r.releaseId, leaseToken: r.leaseToken };
  await f.invoke(checkpoint, { ...lease, phase: "worker" });
  await f.invoke(complete, { ...lease, verification: evidence(r.releaseId, "failed") });
  await f.invoke(interrupted, lease); await f.invoke(interrupted, lease);
  const failed = await f.t.run(ctx => ctx.db.get(r.releaseId)); expect(failed?.state).toBe("uncertain"); expect(failed?.phase).toContain("failed verification"); expect(failed?.runtimeVerification?.result).toBe("failed");
  const retried = await f.invoke(begin, f.input); expect(retried.releaseId).toBe(r.releaseId);
  await f.invoke(complete, { releaseId: retried.releaseId, leaseToken: retried.leaseToken, verification: evidence(retried.releaseId) });
  const latest = (await f.invoke(status, { instanceId: f.input.instanceId })).latest;
  expect(latest.state).toBe("succeeded"); expect(latest.runtimeFailure.result).toBe("failed"); expect(latest.runtimeVerification.result).toBe("verified");
});
test("corrected artifact can supersede a recorded failed runtime while retaining the original failure receipt", async () => {
  const f = await setup(); const r = await f.invoke(begin, f.input);
  await f.invoke(complete, { releaseId: r.releaseId, leaseToken: r.leaseToken, verification: evidence(r.releaseId, "failed") });
  const replacement = await f.invoke(begin, { ...f.input, artifactHash: "c".repeat(64) }); expect(replacement.releaseId).not.toBe(r.releaseId);
  expect((await f.t.run(ctx => ctx.db.get(r.releaseId)))?.runtimeVerification?.result).toBe("failed");
});


test("Cloudflare release persists exact editor origin and refuses to change it on retry", async () => {
  const f = await setup();
  const editorOrigin = "http://127.0.0.1:4105";
  const release = await f.invoke(begin, { ...f.input, editorOrigin });
  const lease = { releaseId: release.releaseId, leaseToken: release.leaseToken };
  expect((await f.invoke(prepare, lease)).editorOrigin).toBe(editorOrigin);
  await f.invoke(checkpoint, { ...lease, phase: "worker" });
  await f.invoke(interrupted, lease);
  await expect(f.invoke(begin, { ...f.input, editorOrigin: "https://other.example" })).rejects.toThrow();
  const resumed = await f.invoke(begin, { ...f.input, editorOrigin });
  expect(resumed.releaseId).toBe(release.releaseId);
  expect((await f.invoke(prepare, { releaseId: resumed.releaseId, leaseToken: resumed.leaseToken })).editorOrigin).toBe(editorOrigin);
});

test("Cloudflare release rejects opaque and credential-bearing editor origins", async () => {
  const f = await setup();
  for (const editorOrigin of ["null", "file://", "https://user:pass@editor.example", "http://editor.example", "https://editor.example/path", "https://editor.example\\evil"]) {
    await expect(f.invoke(begin, { ...f.input, editorOrigin })).rejects.toThrow();
  }
});
