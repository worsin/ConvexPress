import { pageForInstance, pageBackupsForInstance } from "../../operations/queries";
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { save, remove } from "../mutations";
import { tick, dispatch, healthResult, healthTarget } from "../jobs";
import { sweep } from "../retention";
import { get, history } from "../queries";
import { probeIdentity } from "../health";
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

const settings = {
  expectedRevision: 0,
  backupEnabled: true,
  backupIntervalHours: 24,
  healthEnabled: true,
  healthIntervalMinutes: 5,
  retentionEnabled: true,
  retentionDays: 7,
  keepBackups: 2,
};
test("actual policy handlers enforce scope, optimistic revisions, and paused hierarchy", async () => {
  const f = await fixture();
  await expect(
    f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance }, f.ids.other),
  ).rejects.toThrow();
  const result = await f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance });
  await expect(f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance })).rejects.toThrow(
    "changed",
  );
  const loaded = await f.invoke(get, { instanceId: f.ids.alpha.instance });
  expect(loaded.policy.policyId).toBe(result.policyId);
  await f.t.run((ctx) => ctx.db.patch(f.ids.alpha.organization, { isActive: false }));
  await f.invoke(dispatch, { policyId: result.policyId });
  const policy = await f.t.run((ctx) => ctx.db.get(result.policyId));
  expect(policy?.enabled).toBe(false);
  expect(policy?.pauseCode).toBe("POLICY_AUTHORIZATION_LOST");
  expect(f.scheduled).toHaveLength(0);
  await expect(f.invoke(get, { instanceId: f.ids.alpha.instance })).rejects.toThrow();
});
test("due ticks claim one backup and one health lease; sibling policies remain independent", async () => {
  const f = await fixture();
  const result = await f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance });
  await f.t.run((ctx) => ctx.db.patch(result.policyId, { nextBackupAt: Date.now() - 1 }));
  await Promise.all([f.invoke(tick, {}), f.invoke(tick, {})]);
  expect(f.scheduled.filter((row) => row.policyId === result.policyId)).toHaveLength(1);
  await f.invoke(dispatch, { policyId: result.policyId });
  await f.invoke(dispatch, { policyId: result.policyId });
  const operations = await f.t.run((ctx) => ctx.db.query("overseer_siteOperations").collect());
  expect(operations).toHaveLength(1);
  expect(operations[0]?.schedulePolicyId).toBe(result.policyId);
  expect(f.scheduled.filter((row) => row.lease)).toHaveLength(1);
  const page = await f.invoke(pageForInstance, {
    instanceId: f.ids.alpha.instance,
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(page.page[0].operationId).toBe(operations[0]?._id);
  expect(
    (
      await f.invoke(pageForInstance, {
        instanceId: f.ids.beta.instance,
        paginationOpts: { numItems: 1, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
  const sibling = await f.invoke(save, { ...settings, instanceId: f.ids.beta.instance });
  await f.t.run((ctx) => ctx.db.patch(sibling.policyId, { nextBackupAt: Date.now() - 1 }));
  await f.invoke(dispatch, { policyId: sibling.policyId });
  expect(await f.t.run((ctx) => ctx.db.query("overseer_siteOperations").collect())).toHaveLength(2);
});
test("revoked policy author pauses dispatch and stale health completions cannot change state", async () => {
  const f = await fixture();
  const result = await f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance });
  await f.invoke(dispatch, { policyId: result.policyId });
  const job = f.scheduled.find((row) => row.lease)!;
  const target = await f.invoke(healthTarget, job);
  expect(target).not.toBe(null);
  await f.invoke(healthResult, {
    ...job,
    targetRevision: target.targetRevision,
    latencyMs: 10,
  });
  await f.invoke(healthResult, {
    ...job,
    targetRevision: target.targetRevision,
    latencyMs: 10,
  });
  const incidentRows = await f.t.run((ctx) => ctx.db.query("overseer_fleetIncidents").collect());
  expect(incidentRows.filter((row) => row.kind === "health")).toHaveLength(1);
  expect(incidentRows.find((row) => row.kind === "health")?.occurrences).toBe(1);
  await f.t.run((ctx) => ctx.db.patch(f.ids.operator, { isActive: false }));
  await f.invoke(dispatch, { policyId: result.policyId }, f.ids.owner);
  expect((await f.t.run((ctx) => ctx.db.get(result.policyId)))?.enabled).toBe(false);
});
test("history pages have stable scope and bounded size", async () => {
  const f = await fixture();
  await f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance });
  await f.invoke(save, { ...settings, expectedRevision: 1, instanceId: f.ids.alpha.instance });
  const first = await f.invoke(history, {
    instanceId: f.ids.alpha.instance,
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(first.page).toHaveLength(1);
  expect(first.isDone).toBe(false);
  const second = await f.invoke(history, {
    instanceId: f.ids.alpha.instance,
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
  });
  expect(second.page[0].eventId).not.toBe(first.page[0].eventId);
  expect(
    (
      await f.invoke(history, {
        instanceId: f.ids.beta.instance,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
  await expect(
    f.invoke(history, {
      instanceId: f.ids.alpha.instance,
      paginationOpts: { numItems: 101, cursor: null },
    }),
  ).rejects.toThrow("page size");
});

test("retention deletes only owned expired snapshots and protects newest, receipts and active work", async () => {
  const f = await fixture();
  const result = await f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance });
  await f.t.run((ctx) => ctx.db.patch(result.policyId, { nextBackupAt: Date.now() - 1 }));
  await f.invoke(dispatch, { policyId: result.policyId });
  const backups = await f.t.run(async (ctx) => {
    const original = (await ctx.db.query("overseer_siteOperations").first())!;
    await ctx.db.patch(original._id, { state: "succeeded", exclusiveTargetLock: false });
    const refs = [];
    for (let i = 0; i < 6; i++) {
      const artifactStorageId = await ctx.storage.store(new Blob([`synthetic snapshot ${i}`]));
      const createdAt = Date.now() - (20 - i) * 86400000;
      const backupId = await ctx.db.insert("overseer_siteBackups", {
        snapshotId: `snapshot_${i}`,
        sourceOperationId: original._id,
        ...(i === 1 ? {} : { schedulePolicyId: result.policyId }),
        purpose: "manual",
        websiteId: f.ids.alpha.website,
        instanceId: f.ids.alpha.instance,
        websiteKey: "website_alpha",
        instanceKey: "instance_alpha",
        environmentKind: "staging",
        siteContractVersion: "1.0.0",
        schemaVersion: "1.0.0",
        engineVersion: "1.0.0",
        checksumSha256: "a".repeat(64),
        sizeBytes: 20,
        tableCount: 1,
        storageObjectCount: 0,
        artifactStorageId,
        manifestJson: "{}",
        verificationStatus: "verified",
        createdByControllerId: "controller_test",
        createdByUserId: f.ids.operator,
        immutableAt: createdAt,
        createdAt,
      });
      refs.push({ backupId, artifactStorageId });
    }
    await ctx.db.insert("overseer_operationReceipts", {
      receiptId: "protected-recovery",
      operationId: original._id,
      operationCode: "site.backup.create",
      websiteKey: "website_alpha",
      instanceKey: "instance_alpha",
      status: "succeeded",
      preBackupSnapshotId: "snapshot_2",
      startedAt: 1,
      completedAt: 2,
      createdAt: 2,
    });
    return refs;
  });
  expect((await f.invoke(sweep, { policyId: result.policyId })).deleted).toBe(2);
  const statuses = await f.t.run(async (ctx) =>
    Promise.all(backups.map((ref) => ctx.db.get(ref.backupId))),
  );
  const historyPage = await f.invoke(pageBackupsForInstance, {
    instanceId: f.ids.alpha.instance,
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(historyPage.page).toHaveLength(2);
  expect(historyPage.isDone).toBe(false);
  expect(statuses.map((row) => row?.verificationStatus)).toEqual([
    "deleted",
    "verified",
    "verified",
    "deleted",
    "verified",
    "verified",
  ]);
  expect(
    await f.t.run(async (ctx) => (await ctx.storage.get(backups[0]!.artifactStorageId)) === null),
  ).toBe(true);
  expect(
    await f.t.run(async (ctx) => (await ctx.storage.get(backups[2]!.artifactStorageId)) !== null),
  ).toBe(true);
  // A fresh active operation freezes retention for the entire website.
  await f.t.run((ctx) =>
    ctx.db.patch(result.policyId, {
      nextBackupAt: Date.now() - 1,
      keepBackups: 1,
      retentionCursor: undefined,
    }),
  );
  await f.invoke(dispatch, { policyId: result.policyId });
  expect((await f.invoke(sweep, { policyId: result.policyId })).deleted).toBe(0);
  await f.invoke(remove, { policyId: result.policyId, expectedRevision: 1 });
  expect((await f.invoke(sweep, { policyId: result.policyId })).deleted).toBe(0);
});

test("health probe rejects wrong identity and oversized bodies, without creating auth sessions", async () => {
  const target = {
    managementOrigin: "https://alpha.convex.site",
    websiteKey: "website_alpha",
    instanceKey: "instance_alpha",
  };
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    urls.push(String(url));
    return new Response("x".repeat(65537));
  };
  expect(await probeIdentity(target, fetchImpl)).toBe(false);
  expect(urls).toEqual(["https://alpha.convex.site/api/convexpress/management/health"]);
  expect(
    await probeIdentity(target, async () => new Response(JSON.stringify({ websiteKey: "other" }))),
  ).toBe(false);
});

test("health success resolves one incident and degraded reports remain failures", async () => {
  const f = await fixture();
  const result = await f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance });
  await f.invoke(dispatch, { policyId: result.policyId });
  const first = f.scheduled.find((row) => row.lease)!;
  const target = await f.invoke(healthTarget, first);
  await f.invoke(healthResult, {
    ...first,
    targetRevision: target.targetRevision,
    latencyMs: 20,
  });
  await f.t.run((ctx) => ctx.db.patch(result.policyId, { nextHealthAt: Date.now() - 1 }));
  await f.invoke(dispatch, { policyId: result.policyId });
  const last = f.scheduled.filter((row) => row.lease).at(-1)!;
  const current = await f.invoke(healthTarget, last);
  const response = {
    status: "healthy",
    checkedAt: new Date().toISOString(),
    websiteKey: "website_alpha",
    instanceKey: "instance_alpha",
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
    storageStatus: "healthy",
    authStatus: "healthy",
  };
  await f.invoke(healthResult, {
    ...last,
    targetRevision: current.targetRevision,
    report: response,
    latencyMs: 10,
  });
  const incidents = await f.t.run((ctx) => ctx.db.query("overseer_fleetIncidents").collect());
  expect(incidents.find((row) => row.kind === "health")?.open).toBe(false);
  expect(await f.t.run(ctx => ctx.db.get(f.ids.alpha.instance))).toMatchObject({ health: "ok", compatibility: "compatible", siteContractVersion: response.siteContractVersion, schemaVersion: response.schemaVersion, engineVersion: response.engineVersion });
  const input = {
    managementOrigin: "https://alpha.convex.site",
    websiteKey: response.websiteKey,
    instanceKey: response.instanceKey,
  };
  expect(await probeIdentity(input, async () => new Response(JSON.stringify(response)))).toBe(true);
  expect(
    await probeIdentity(
      input,
      async () => new Response(JSON.stringify({ ...response, status: "degraded" })),
    ),
  ).toBe(false);
});

test("permission revocation and disabled businesses stop queued health work", async () => {
  const f = await fixture();
  const result = await f.invoke(save, { ...settings, instanceId: f.ids.alpha.instance });
  await f.invoke(dispatch, { policyId: result.policyId });
  const job = f.scheduled.find((row) => row.lease)!;
  const target = await f.invoke(healthTarget, job);
  await f.t.run((ctx) => ctx.db.patch(f.ids.alpha.business, { isActive: false }));
  expect(await f.invoke(healthTarget, job)).toBe(null);
  await f.invoke(healthResult, {
    ...job,
    targetRevision: target.targetRevision,
    latencyMs: 1,
  });
  expect((await f.t.run((ctx) => ctx.db.get(f.ids.alpha.instance)))?.health).toBe("ok");
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.ids.alpha.business, { isActive: true });
    await ctx.db.insert("overseer_permissions", {
      subjectType: "user",
      subjectId: String(f.ids.operator),
      actionCode: "site.backup.create",
      effect: "deny",
      status: "active",
    });
  });
  await f.invoke(dispatch, { policyId: result.policyId });
  expect((await f.t.run((ctx) => ctx.db.get(result.policyId)))?.enabled).toBe(false);
});

test("history query return contracts accept native page splitting metadata", async () => {
  const f = await fixture();
  for (const query of [history, pageForInstance, pageBackupsForInstance]) {
    const page = await f.invoke(query, {
      instanceId: f.ids.alpha.instance,
      paginationOpts: { numItems: 10, cursor: null },
    });
    // The real self-hosted backend emits these even on an empty history page.
    // Convex-test omits them, so explicitly exercise the runtime result shape.
    const runtimePage = { ...page, pageStatus: "SplitRequired", splitCursor: "split-cursor" };
    const declared = JSON.parse(query.exportReturns()).value;
    expect(Object.keys(runtimePage).filter((key) => !(key in declared))).toEqual([]);
    expect(declared.pageStatus.optional).toBe(true);
    expect(declared.pageStatus.fieldType.value).toContainEqual({ type: "literal", value: "SplitRequired" });
    expect(declared.splitCursor.optional).toBe(true);
  }
});


test("live maintenance reads each shared authorization rule set only once", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.alpha.instance, { kind: "live" }));
  f.reads.length = 0;
  const result = await f.invoke(get, { instanceId: f.ids.alpha.instance });
  expect(result.canManage).toBe(true);
  expect(f.reads.filter(table => table === "overseer_roleAssignments").length).toBe(2);
  expect(f.reads.filter(table => table === "overseer_websiteAccess").length).toBe(1);
  expect(f.reads.filter(table => table === "overseer_roles").length).toBe(0);
});
