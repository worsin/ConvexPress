import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { startClone, startPromotion, startRestore, resumeOperation } from "../mutations";
import { prepareSnapshot, prepareReplacement, prepareRestore } from "../internal";
import { createOperationRecord, resumeOperationRecord } from "../records";
import { importReplacementSnapshot, importRestoreSnapshot } from "../actions";
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
          ...ctx, operator: user,
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

const refusal = "Full snapshot replacement between environments is disabled";
async function legacy(f: Awaited<ReturnType<typeof fixture>>, operationCode: "site.clone" | "site.promote", state: "queued" | "running" | "interrupted" | "resuming") {
 return f.t.run(async ctx => {
  const operation = await createOperationRecord(ctx, { operationCode: "site.backup.create", idempotencyKey: "legacy-replacement", websiteId: f.ids.alpha.website, instanceId: f.ids.alpha.instance, requestedByUserId: f.ids.operator, provider: "manual", includeStorage: true });
  await ctx.db.patch(operation.operationId, { operationCode, state, workflowId: "legacy-workflow", currentStep: "target.snapshot.import", sourceInstanceId: f.ids.beta.instance });
  return operation.operationId;
 });
}
test("actual public full-replacement starts refuse before workflow or database writes", async () => {
 for (const handler of [startClone, startPromotion]) {
  const f = await fixture();
  await f.t.run(async ctx => {
   const a = (await ctx.db.get(f.ids.alpha.instance))!;
   await ctx.db.patch(f.ids.beta.instance, { website_id: a.website_id, organization_id: a.organization_id, business_id: a.business_id });
   if (handler === startPromotion) await ctx.db.patch(a._id, { kind: "live" });
  });
  await expect(f.invoke(handler, { instanceId: f.ids.alpha.instance, sourceInstanceId: f.ids.beta.instance, idempotencyKey: "blocked-start", ...(handler === startPromotion ? { confirmation: "PROMOTE TO instance_alpha" } : {}) })).rejects.toThrow(refusal);
  expect(await f.t.run(ctx => ctx.db.query("overseer_siteOperations").collect())).toHaveLength(0);
 }
});
test("legacy queued, running and resumed replacements cannot prepare or import a snapshot", async () => {
 for (const code of ["site.clone", "site.promote"] as const) for (const state of ["queued", "running", "resuming"] as const) {
  const f = await fixture(), operationId = await legacy(f, code, state);
  await expect(f.invoke(prepareSnapshot, { operationId, purpose: code === "site.clone" ? "clone-source" : "promote-source" })).rejects.toThrow(refusal);
  await expect(f.invoke(prepareReplacement, { operationId })).rejects.toThrow(refusal);
 }
 let calls = 0;
 await expect((importReplacementSnapshot as any)._handler({ runQuery: async () => { calls++; throw Error("query reached"); }, storage: { getUrl: async () => { calls++; throw Error("remote reached"); } } }, { operationId: "legacy" })).rejects.toThrow(refusal);
 expect(calls).toBe(0);
});
test("interrupted legacy replacements cannot resume through public or record handler", async () => {
 const f = await fixture(), operationId = await legacy(f, "site.promote", "interrupted");
 await expect(f.invoke(resumeOperation, { operationId })).rejects.toThrow(refusal);
 await expect(f.t.run(ctx => resumeOperationRecord(ctx, { operationId, expectedRevision: 0 }))).rejects.toThrow(refusal);
 expect((await f.t.run(ctx => ctx.db.get(operationId)))!.state).toBe("interrupted");
});
test("restore import refuses foreign or missing identity before storage URLs or remote calls", async () => {
 const target = { websiteId: "website-a", instanceId: "instance-a", websiteKey: "website_alpha", instanceKey: "instance_alpha", environmentKind: "staging", existing: { backupId: "pre", artifactStorageId: "pre-artifact" } };
 const source = { websiteId: target.websiteId, instanceId: target.instanceId, websiteKey: target.websiteKey, instanceKey: target.instanceKey, environmentKind: target.environmentKind, artifactStorageId: "source-artifact" };
 for (const mismatch of [{ instanceId: "other" }, { websiteId: "other" }, { instanceKey: "other" }, { websiteKey: "other" }, { environmentKind: "live" }, { instanceId: undefined }]) {
  let reads = 0, remote = 0;
  const ctx = { runQuery: async () => ++reads === 1 ? target : { source: { ...source, ...mismatch }, preBackup: target.existing }, storage: { getUrl: async () => { remote++; throw Error("REMOTE_BOUNDARY_REACHED"); } } };
  await expect((importRestoreSnapshot as any)._handler(ctx, { operationId: "restore" })).rejects.toThrow("same environment");
  expect(remote).toBe(0);
 }
 // Same-environment identity proceeds to existing artifact checks; no live network is called.
 let reads = 0, remote = 0;
 const ctx = { runQuery: async () => ++reads === 1 ? target : { source, preBackup: target.existing }, storage: { getUrl: async () => { remote++; throw Error("VERIFIED_RESTORE_ARTIFACT_PATH"); } } };
 await expect((importRestoreSnapshot as any)._handler(ctx, { operationId: "restore" })).rejects.toThrow("VERIFIED_RESTORE_ARTIFACT_PATH"); expect(remote).toBe(2);
});

test("actual restore start and queued import preparation require exact source identity, preserving valid disaster restore", async () => {
 const f = await fixture();
 const seeded = await f.t.run(async ctx => {
  await ctx.db.patch(f.ids.alpha.instance, { siteContractVersion: "1.0.0", schemaVersion: "2026.9.0", engineVersion: "1.0.0" });
  const operation = await createOperationRecord(ctx, { operationCode: "site.restore", idempotencyKey: "same-environment-restore", websiteId: f.ids.alpha.website, instanceId: f.ids.alpha.instance, requestedByUserId: f.ids.operator, provider: "manual", snapshotId: "source-snapshot", confirmation: "RESTORE instance_alpha" });
  await ctx.db.patch(operation.operationId, { workflowId: "existing-workflow" });
  const artifact = await ctx.storage.store(new Blob(["local fixture"]));
  const snapshot = { sourceOperationId: operation.operationId, purpose: "manual" as const, websiteId: f.ids.alpha.website, instanceId: f.ids.alpha.instance, websiteKey: "website_alpha", instanceKey: "instance_alpha", environmentKind: "staging" as const, siteContractVersion: "1.0.0", schemaVersion: "2026.9.0", engineVersion: "1.0.0", checksumSha256: "a".repeat(64), sizeBytes: 13, tableCount: 1, storageObjectCount: 0, artifactStorageId: artifact, manifestJson: "{}", verificationStatus: "verified" as const, createdByControllerId: "controller_test", createdByUserId: f.ids.operator, immutableAt: 1, verifiedAt: 1, createdAt: 1 };
  const backupId = await ctx.db.insert("overseer_siteBackups", { ...snapshot, snapshotId: "source-snapshot" });
  const preBackupId = await ctx.db.insert("overseer_siteBackups", { ...snapshot, snapshotId: "pre-snapshot", purpose: "pre-restore" });
  await ctx.db.insert("overseer_operationReceipts", { receiptId: "pre-receipt", operationId: operation.operationId, operationCode: "site.backup.create", websiteKey: "website_alpha", instanceKey: "instance_alpha", status: "succeeded", preBackupSnapshotId: "pre-snapshot", startedAt: 1, completedAt: 1, createdAt: 1 });
  return { operationId: operation.operationId, backupId, preBackupId };
 });
 const request = { instanceId: f.ids.alpha.instance, snapshotId: "source-snapshot", confirmation: "RESTORE instance_alpha", idempotencyKey: "same-environment-restore" };
 expect((await f.invoke(startRestore, request)).idempotent).toBe(true);
 await f.t.run(ctx => ctx.db.patch(seeded.operationId, { state: "resuming", preBackupId: seeded.preBackupId, preBackupReceiptId: "pre-receipt" }));
 expect((await f.invoke(prepareRestore, { operationId: seeded.operationId })).source.instanceId).toBe(f.ids.alpha.instance);
 for (const patch of [{ instanceId: f.ids.beta.instance }, { websiteKey: "website_beta" }, { instanceKey: "instance_beta" }, { environmentKind: "live" as const }]) {
  const original = await f.t.run(ctx => ctx.db.get(seeded.backupId));
  await f.t.run(ctx => ctx.db.patch(seeded.backupId, patch));
  await expect(f.invoke(startRestore, request)).rejects.toThrow("same environment");
  await expect(f.invoke(prepareRestore, { operationId: seeded.operationId })).rejects.toThrow("same environment");
  await expect(f.invoke(prepareSnapshot, { operationId: seeded.operationId, purpose: "pre-restore" })).rejects.toThrow("same environment");
  await f.t.run(ctx => ctx.db.patch(seeded.operationId, { state: "interrupted", currentStep: "snapshot.import" }));
  await expect(f.invoke(resumeOperation, { operationId: seeded.operationId })).rejects.toThrow("same environment");
  await f.t.run(ctx => ctx.db.patch(seeded.operationId, { state: "resuming" }));
  await f.t.run(ctx => ctx.db.patch(seeded.backupId, { instanceId: original!.instanceId, websiteKey: original!.websiteKey, instanceKey: original!.instanceKey, environmentKind: original!.environmentKind }));
 }
});
