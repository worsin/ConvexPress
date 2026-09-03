import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import schema from "../../schema";
import { recordVerifiedSnapshot } from "../backups";
import {
  completeOperationRecord,
  createOperationRecord,
  transitionOperationRecord,
} from "../records";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seed(t: ReturnType<typeof createHarness>) {
  return await t.run(async (ctx) => {
    const now = 1_788_400_000_000;
    const userId = await ctx.db.insert("overseer_users", {
      email: "owner@example.com",
      role: "owner",
      isActive: true,
      createdAt: now,
    });
    const organizationId = await ctx.db.insert("overseer_organizations", {
      name: "Agency",
      slug: "agency",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const businessId = await ctx.db.insert("overseer_businesses", {
      organizationId,
      name: "Business",
      slug: "business",
      isActive: true,
      order: 1,
      createdAt: now,
      updatedAt: now,
    });
    const websiteId = await ctx.db.insert("overseer_websites", {
      organization_id: organizationId,
      business_id: businessId,
      websiteKey: "website_northstar",
      engine: "convexpress",
      title: "Northstar",
      primaryDomain: "northstar.example",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const instanceId = await ctx.db.insert("overseer_websiteInstances", {
      organization_id: organizationId,
      business_id: businessId,
      website_id: websiteId,
      instanceKey: "instance_northstar_live",
      kind: "live",
      deploymentOrigin: "http://127.0.0.1:4820",
      managementOrigin: "http://127.0.0.1:4821",
      siteOrigin: "http://127.0.0.1:4105",
      siteContractVersion: "1.0.0",
      schemaVersion: "1.0.0",
      engineVersion: "1.0.0",
      compatibility: "compatible",
      provisioning: "ready",
      health: "ok",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, websiteId, instanceId };
  });
}

function manifest(snapshotId: string, checksumSha256 = "a".repeat(64)) {
  return {
    snapshotId,
    websiteKey: "website_northstar",
    instanceKey: "instance_northstar_live",
    environmentKind: "live" as const,
    siteContractVersion: "1.0.0",
    schemaVersion: "1.0.0",
    engineVersion: "1.0.0",
    checksumSha256,
    sizeBytes: 128,
    tableCount: 2,
    storageObjectCount: 1,
    createdByControllerId: "controller_standalone",
    verificationStatus: "verified" as const,
    createdAt: "2026-09-02T20:30:00.000Z",
  };
}

describe("verified site backup records", () => {
  test("stores one immutable storage-backed manual snapshot", async () => {
    const t = createHarness();
    const target = await seed(t);
    const operation = await t.run((ctx) =>
      createOperationRecord(ctx, {
        operationCode: "site.backup.create",
        idempotencyKey: "backup_manual_001",
        websiteId: target.websiteId,
        instanceId: target.instanceId,
        requestedByUserId: target.userId,
        provider: "manual",
        includeStorage: true,
      }),
    );
    await t.run((ctx) =>
      transitionOperationRecord(ctx, {
        operationId: operation.operationId,
        expectedRevision: 0,
        to: "running",
      }),
    );

    const recorded = await t.run(async (ctx) => {
      const artifactStorageId = await ctx.storage.store(new Blob(["snapshot"]));
      return await recordVerifiedSnapshot(ctx, {
        operationId: operation.operationId,
        purpose: "manual",
        artifactStorageId,
        manifest: manifest("snapshot_manual_001"),
      });
    });
    expect(recorded.idempotent).toBe(false);

    const replayed = await t.run((ctx) =>
      recordVerifiedSnapshot(ctx, {
        operationId: operation.operationId,
        purpose: "manual",
        artifactStorageId: recorded.artifactStorageId,
        manifest: manifest("snapshot_manual_001"),
      }),
    );
    expect(replayed).toEqual({ ...recorded, idempotent: true });

    await expect(
      t.run((ctx) =>
        recordVerifiedSnapshot(ctx, {
          operationId: operation.operationId,
          purpose: "manual",
          artifactStorageId: recorded.artifactStorageId,
          manifest: manifest("snapshot_manual_001", "b".repeat(64)),
        }),
      ),
    ).rejects.toThrow("immutable");

    const backups = await t.run((ctx) =>
      ctx.db.query("overseer_siteBackups").take(10),
    );
    expect(backups).toHaveLength(1);
    expect(backups[0]?.artifactStorageId).toBe(recorded.artifactStorageId);
    expect(backups[0]?.verificationStatus).toBe("verified");
  });

  test("atomically receipts and attaches a verified pre-restore snapshot", async () => {
    const t = createHarness();
    const target = await seed(t);
    const operation = await t.run((ctx) =>
      createOperationRecord(ctx, {
        operationCode: "site.restore",
        idempotencyKey: "restore_live_001",
        websiteId: target.websiteId,
        instanceId: target.instanceId,
        requestedByUserId: target.userId,
        provider: "manual",
        snapshotId: "snapshot_restore_source",
        confirmation: "RESTORE instance_northstar_live",
      }),
    );
    await t.run((ctx) =>
      transitionOperationRecord(ctx, {
        operationId: operation.operationId,
        expectedRevision: 0,
        to: "running",
      }),
    );

    const preBackup = await t.run(async (ctx) => {
      const artifactStorageId = await ctx.storage.store(new Blob(["prebackup"]));
      return await recordVerifiedSnapshot(ctx, {
        operationId: operation.operationId,
        purpose: "pre-restore",
        artifactStorageId,
        manifest: manifest("snapshot_pre_restore_002"),
      });
    });
    expect(preBackup.preBackupReceiptId).toMatch(/^receipt_/);

    const stored = await t.run(async (ctx) => ({
      operation: await ctx.db.get(operation.operationId),
      receipts: await ctx.db.query("overseer_operationReceipts").take(10),
    }));
    expect(stored.operation?.preBackupId).toBe(preBackup.backupId);
    expect(stored.operation?.preBackupReceiptId).toBe(
      preBackup.preBackupReceiptId,
    );
    expect(stored.operation?.revision).toBe(2);
    expect(stored.receipts).toHaveLength(1);
    expect(stored.receipts[0]?.status).toBe("succeeded");

    const completed = await t.run((ctx) =>
      completeOperationRecord(ctx, {
        operationId: operation.operationId,
        expectedRevision: 2,
        state: "succeeded",
        summary: { restoredSnapshotId: "snapshot_restore_source" },
      }),
    );
    expect(completed.status).toBe("succeeded");
  });
});
