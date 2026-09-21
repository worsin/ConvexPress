import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { begin, dispatch, recordProject, recordDeployment, heartbeat, interrupted, prepare, status, complete } from "../vercelReleases";
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
        siteOrigin: `https://${suffix}.vercel.app`,
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
  const account = await f.invoke(commitVerified, { organizationId: f.ids.alpha.organization, businessId: f.ids.alpha.business, provider: "vercel", externalAccountId: "team_agency", label: "Synthetic Vercel", expectedRevision: 0, credentials: envelope });
  const input = { instanceId: f.ids.alpha.instance, accountId: account.accountId, projectName: "alpha", artifactHash: "b".repeat(64) };
  return { ...f, account, input };
}
const leaseOf = (r: any) => ({ releaseId: r.releaseId, leaseToken: r.leaseToken });
async function projectReady(f: Awaited<ReturnType<typeof setup>>, lease: ReturnType<typeof leaseOf>) {
  const prepared = await f.invoke(prepare, lease);
  await f.invoke(dispatch, { ...lease, step: "project" });
  await f.invoke(recordProject, { ...lease, projectId: "prj_alpha", hostingTarget: prepared.hostingTarget });
}
test("Vercel release requires agency/site scope and keeps credentials and leases out of status", async () => {
  const f = await setup();
  await expect(f.invoke(begin, f.input, f.ids.other)).rejects.toThrow();
  await expect(f.invoke(begin, { ...f.input, instanceId: f.ids.beta.instance })).rejects.toThrow();
  const r = await f.invoke(begin, f.input);
  const view = await f.invoke(status, { instanceId: f.input.instanceId });
  expect(view.latest.releaseId).toBe(r.releaseId);
  expect(JSON.stringify(view)).not.toContain("synthetic-ciphertext");
  expect(JSON.stringify(view)).not.toContain(r.leaseToken);
  await expect(f.invoke(begin, f.input)).rejects.toThrow("active");
});
test("Project dispatch is atomic and remains spent across interruption and lease takeover", async () => {
  const f = await setup(), r = await f.invoke(begin, f.input), lease = leaseOf(r);
  const claims = await Promise.all([f.invoke(dispatch, { ...lease, step: "project" }), f.invoke(dispatch, { ...lease, step: "project" })]);
  expect(claims.sort()).toEqual([false, true]);
  await f.invoke(interrupted, lease);
  const resumed = leaseOf(await f.invoke(begin, f.input));
  expect(resumed.releaseId).toBe(r.releaseId);
  expect(resumed.leaseToken).not.toBe(lease.leaseToken);
  expect(await f.invoke(dispatch, { ...resumed, step: "project" })).toBe(false);
  await expect(f.invoke(dispatch, { ...lease, step: "project" })).rejects.toThrow("lease");
  await expect(f.invoke(begin, { ...f.input, artifactHash: "c".repeat(64) })).rejects.toThrow("active");
  await f.invoke(interrupted, resumed);
  const revised = leaseOf(await f.invoke(begin, { ...f.input, artifactHash: "c".repeat(64) }));
  expect(revised.releaseId).not.toBe(r.releaseId);
  expect(await f.invoke(dispatch, { ...revised, step: "project" })).toBe(false);
});
test("Lease expiry cannot reset an uncertain deployment dispatch or change runtime settings", async () => {
  const f = await setup(), r = await f.invoke(begin, f.input), lease = leaseOf(r);
  await projectReady(f, lease);
  expect(await f.invoke(dispatch, { ...lease, step: "deployment" })).toBe(true);
  await f.t.run(ctx => ctx.db.patch(r.releaseId, { leaseUntil: Date.now() - 1 }));
  const resumed = leaseOf(await f.invoke(begin, f.input));
  expect(await f.invoke(dispatch, { ...resumed, step: "deployment" })).toBe(false);
  expect((await f.invoke(prepare, resumed)).deploymentDispatched).toBe(true);
  await f.t.run(ctx => ctx.db.patch(f.input.instanceId, { siteOrigin: "https://other.example" }));
  await expect(f.invoke(heartbeat, resumed)).rejects.toThrow("changed");
});
test("Unverified IDs cannot be attached before dispatch, and confirmed project/deployment IDs are immutable", async () => {
  const f = await setup(), r = await f.invoke(begin, f.input), lease = leaseOf(r);
  const p = await f.invoke(prepare, lease);
  await expect(f.invoke(recordProject, { ...lease, projectId: "prj_alpha", hostingTarget: p.hostingTarget })).rejects.toThrow("receipt");
  await f.invoke(dispatch, { ...lease, step: "project" });
  await expect(f.invoke(recordProject, { ...lease, projectId: "prj_alpha", hostingTarget: "wrong-marker" })).rejects.toThrow("receipt");
  await f.invoke(recordProject, { ...lease, projectId: "prj_alpha", hostingTarget: p.hostingTarget });
  await expect(f.invoke(recordProject, { ...lease, projectId: "prj_other", hostingTarget: p.hostingTarget })).rejects.toThrow("receipt");
  await expect(f.invoke(recordDeployment, { ...lease, deploymentId: "dpl_alpha" })).rejects.toThrow("receipt");
  await f.invoke(dispatch, { ...lease, step: "deployment" });
  await f.invoke(recordDeployment, { ...lease, deploymentId: "dpl_alpha" });
  await expect(f.invoke(recordDeployment, { ...lease, deploymentId: "dpl_other" })).rejects.toThrow("receipt");
});
test("Account revocation stops all new provider authorization but permits the original operator to record interruption", async () => {
  const f = await setup(), r = await f.invoke(begin, f.input), lease = leaseOf(r);
  await f.invoke(dispatch, { ...lease, step: "project" });
  await f.invoke(revoke, { accountId: f.account.accountId, expectedRevision: 1 });
  await expect(f.invoke(prepare, lease)).rejects.toThrow();
  await expect(f.invoke(dispatch, { ...lease, step: "project" })).rejects.toThrow();
  await f.invoke(interrupted, lease);
  expect((await f.t.run(ctx => ctx.db.get(r.releaseId)))?.state).toBe("pending");
});
test("Live publishing requires explicit confirmation and respects direct capability denial", async () => {
  const f = await setup();
  await f.t.run(ctx => ctx.db.patch(f.input.instanceId, { kind: "live" }));
  await expect(f.invoke(begin, f.input)).rejects.toThrow("Confirm");
  await f.t.run(ctx => ctx.db.insert("overseer_permissions", { subjectType: "user", subjectId: String(f.ids.operator), actionCode: "environment.live.operate", effect: "deny", status: "active" }));
  await expect(f.invoke(begin, { ...f.input, confirmLive: true })).rejects.toThrow();
});
function evidence(releaseId: string, result = "verified") {
  return { releaseId, instanceKey: "instance_alpha", artifactHash: "b".repeat(64), siteOrigin: "https://alpha.vercel.app", checkedAt: Date.now(), attempts: 1, result,
    routes: ["/", "/document-preview/"].map(path => ({ path, code: result === "verified" ? "ok" : "http", status: result === "verified" ? 200 : 500, bytes: result === "verified" ? 100 : 0 })) };
}
test("Completion needs a confirmed deployment and fresh exact SSR evidence; interruption cannot erase success", async () => {
  const f = await setup(), r = await f.invoke(begin, f.input), lease = leaseOf(r);
  await expect(f.invoke(complete, { ...lease, verification: evidence(r.releaseId) })).rejects.toThrow("deployment");
  await projectReady(f, lease);
  await f.invoke(dispatch, { ...lease, step: "deployment" });
  await f.invoke(recordDeployment, { ...lease, deploymentId: "dpl_alpha" });
  for (const verification of [{ ...evidence(r.releaseId), artifactHash: "c".repeat(64) }, { ...evidence(r.releaseId), checkedAt: Date.now() - 60000 }, { ...evidence(r.releaseId), siteOrigin: "https://other.example" }])
    await expect(f.invoke(complete, { ...lease, verification })).rejects.toThrow("verification");
  await f.invoke(complete, { ...lease, verification: evidence(r.releaseId) });
  await f.invoke(interrupted, lease);
  expect((await f.invoke(status, { instanceId: f.input.instanceId })).latest.state).toBe("succeeded");
  await expect(f.invoke(dispatch, { ...lease, step: "deployment" })).rejects.toThrow("lease");
});

test("Unused target names can be corrected while dispatched project identities remain immutable", async () => {
 const f=await setup(), r=await f.invoke(begin,f.input); await f.invoke(interrupted,leaseOf(r));
 const next=await f.invoke(begin,{...f.input,projectName:"corrected-name"}); expect(next.releaseId).not.toBe(r.releaseId);
 const old=await f.t.run(ctx=>ctx.db.get(r.releaseId)); const oldTarget=await f.t.run(ctx=>ctx.db.get(old!.targetId)); expect(oldTarget!.active).toBe(false);
 await f.invoke(dispatch,{...leaseOf(next),step:"project"}); await f.invoke(interrupted,leaseOf(next));
 await expect(f.invoke(begin,{...f.input,projectName:"different-again"})).rejects.toThrow("bound");
});
test("Unknown deployment writes require their original artifact even after expiry", async () => {
 const f=await setup(), r=await f.invoke(begin,f.input), lease=leaseOf(r); await projectReady(f,lease);
 await f.invoke(dispatch,{...lease,step:"deployment"}); await f.invoke(interrupted,lease);
 await expect(f.invoke(begin,{...f.input,artifactHash:"c".repeat(64)})).rejects.toThrow("original artifact");
});
test("Retry of a known committed success returns that receipt; only an explicit new publish creates another release", async () => {
 const f=await setup(), r=await f.invoke(begin,f.input), lease=leaseOf(r); await projectReady(f,lease);
 await f.invoke(dispatch,{...lease,step:"deployment"}); await f.invoke(recordDeployment,{...lease,deploymentId:"dpl_alpha"});
 await f.invoke(complete,{...lease,verification:evidence(r.releaseId)});
 const retried=await f.invoke(begin,{...f.input,resumeReleaseId:r.releaseId}); expect(retried.releaseId).toBe(r.releaseId);expect(retried.alreadySucceeded).toBe(true);
 const fresh=await f.invoke(begin,f.input);expect(fresh.releaseId).not.toBe(r.releaseId);
 await expect(f.invoke(begin,{...f.input,resumeReleaseId:r.releaseId})).rejects.toThrow("superseded");
});


test("Vercel release persists exact editor origin and refuses to change it on retry", async () => {
  const f = await setup();
  const editorOrigin = "http://127.0.0.1:4105";
  const release = await f.invoke(begin, { ...f.input, editorOrigin });
  const lease = { releaseId: release.releaseId, leaseToken: release.leaseToken };
  expect((await f.invoke(prepare, lease)).editorOrigin).toBe(editorOrigin);
  await f.t.run(ctx => ctx.db.patch(release.releaseId, { deploymentDispatched: true, leaseUntil: 0 }));
  await expect(f.invoke(begin, { ...f.input, editorOrigin: "https://other.example" })).rejects.toThrow();
  const resumed = await f.invoke(begin, { ...f.input, editorOrigin });
  expect(resumed.releaseId).toBe(release.releaseId);
  expect((await f.invoke(prepare, { releaseId: resumed.releaseId, leaseToken: resumed.leaseToken })).editorOrigin).toBe(editorOrigin);
});

test("Vercel release rejects opaque and credential-bearing editor origins", async () => {
  const f = await setup();
  for (const editorOrigin of ["null", "file://", "https://user:pass@editor.example", "http://editor.example", "https://editor.example/path", "https://editor.example\\evil"]) {
    await expect(f.invoke(begin, { ...f.input, editorOrigin })).rejects.toThrow();
  }
});
