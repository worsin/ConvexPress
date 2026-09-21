import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import schema from "../../schema";
import {
  attachVerifiedPreBackup,
  completeOperationRecord,
  createOperationRecord,
  interruptOperationRecord,
  resumeOperationRecord,
  transitionOperationRecord,
} from "../records";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedTarget(t: ReturnType<typeof createHarness>) {
  return await t.run(async (ctx) => {
    const now = 1_788_400_000_000;
    const userId = await ctx.db.insert("overseer_users", {
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      isActive: true,
      createdAt: now,
    });
    const organizationId = await ctx.db.insert("overseer_organizations", {
      name: "Northstar Agency",
      slug: "northstar-agency",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const businessId = await ctx.db.insert("overseer_businesses", {
      organizationId,
      name: "Northstar Goods",
      slug: "northstar-goods",
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
      title: "Northstar Shop",
      primaryDomain: "northstar.example",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const liveInstanceId = await ctx.db.insert("overseer_websiteInstances", {
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
    const stagingInstanceId = await ctx.db.insert(
      "overseer_websiteInstances",
      {
        organization_id: organizationId,
        business_id: businessId,
        website_id: websiteId,
        instanceKey: "instance_northstar_staging",
        kind: "staging",
        deploymentOrigin: "http://127.0.0.1:4830",
        managementOrigin: "http://127.0.0.1:4831",
        siteOrigin: "http://127.0.0.1:4106",
        siteContractVersion: "1.0.0",
        schemaVersion: "1.0.0",
        engineVersion: "1.0.0",
        compatibility: "compatible",
        provisioning: "ready",
        health: "ok",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    );
    return { userId, websiteId, liveInstanceId, stagingInstanceId };
  });
}

describe("durable lifecycle operation records", () => {
  test("is idempotent for the same request and rejects changed replay input", async () => {
    const t = createHarness();
    const target = await seedTarget(t);
    const request = {
      operationCode: "site.backup.create" as const,
      idempotencyKey: "idempotency_backup_001",
      websiteId: target.websiteId,
      instanceId: target.liveInstanceId,
      requestedByUserId: target.userId,
      provider: "manual" as const,
      includeStorage: true,
    };

    const created = await t.run((ctx) => createOperationRecord(ctx, request));
    expect(created.idempotent).toBe(false);

    const replayed = await t.run((ctx) => createOperationRecord(ctx, request));
    expect(replayed).toEqual({ ...created, idempotent: true });

    await expect(
      t.run((ctx) =>
        createOperationRecord(ctx, { ...request, includeStorage: false }),
      ),
    ).rejects.toThrow("different request");

    const stored = await t.run(async (ctx) => ({
      operations: await ctx.db.query("overseer_siteOperations").take(10),
      steps: await ctx.db.query("overseer_operationSteps").take(20),
    }));
    expect(stored.operations).toHaveLength(1);
    expect(stored.operations[0]?.exclusiveTargetLock).toBe(true);
    expect(stored.steps.map((step) => step.stepKey)).toEqual([
      "target.revalidate",
      "snapshot.export",
      "snapshot.verify",
      "operation.finalize",
    ]);
  });

  test("allows only one exclusive operation per target until terminal completion", async () => {
    const t = createHarness();
    const target = await seedTarget(t);
    const first = await t.run((ctx) =>
      createOperationRecord(ctx, {
        operationCode: "site.backup.create",
        idempotencyKey: "idempotency_backup_001",
        websiteId: target.websiteId,
        instanceId: target.liveInstanceId,
        requestedByUserId: target.userId,
        provider: "manual",
        includeStorage: true,
      }),
    );

    await expect(
      t.run((ctx) =>
        createOperationRecord(ctx, {
          operationCode: "site.restore",
          idempotencyKey: "idempotency_restore_001",
          websiteId: target.websiteId,
          instanceId: target.liveInstanceId,
          requestedByUserId: target.userId,
          provider: "manual",
          snapshotId: "snapshot_existing_001",
          confirmation: "RESTORE instance_northstar_live",
        }),
      ),
    ).rejects.toThrow("already active");

    await t.run(async (ctx) => {
      await transitionOperationRecord(ctx, {
        operationId: first.operationId,
        expectedRevision: 0,
        to: "running",
      });
      await completeOperationRecord(ctx, {
        operationId: first.operationId,
        expectedRevision: 1,
        state: "succeeded",
        summary: { snapshotId: "snapshot_first_001" },
      });
    });

    const next = await t.run((ctx) =>
      createOperationRecord(ctx, {
        operationCode: "site.backup.create",
        idempotencyKey: "idempotency_backup_002",
        websiteId: target.websiteId,
        instanceId: target.liveInstanceId,
        requestedByUserId: target.userId,
        provider: "manual",
        includeStorage: true,
      }),
    );
    expect(next.idempotent).toBe(false);
  });

  test("refuses full clone and promotion record creation before allocating checkpoints", async () => {
    for (const operationCode of ["site.clone", "site.promote"] as const) {
      const t = createHarness(); const target = await seedTarget(t);
      await expect(t.run(ctx => createOperationRecord(ctx, {
        operationCode, idempotencyKey: "blocked-replacement", websiteId: target.websiteId,
        instanceId: operationCode === "site.clone" ? target.stagingInstanceId : target.liveInstanceId,
        sourceInstanceId: operationCode === "site.clone" ? target.liveInstanceId : target.stagingInstanceId,
        requestedByUserId: target.userId, provider: "manual", confirmation: "PROMOTE TO instance_northstar_live",
      }))).rejects.toThrow("Full snapshot replacement between environments is disabled");
      expect(await t.run(ctx => ctx.db.query("overseer_siteOperations").collect())).toHaveLength(0);
      expect(await t.run(ctx => ctx.db.query("overseer_operationSteps").collect())).toHaveLength(0);
    }
  });

  test("requires a verified backup and successful immutable receipt before restore succeeds", async () => {
    const t = createHarness();
    const target = await seedTarget(t);
    const restore = await t.run((ctx) =>
      createOperationRecord(ctx, {
        operationCode: "site.restore",
        idempotencyKey: "idempotency_restore_001",
        websiteId: target.websiteId,
        instanceId: target.liveInstanceId,
        requestedByUserId: target.userId,
        provider: "manual",
        snapshotId: "snapshot_existing_001",
        confirmation: "RESTORE instance_northstar_live",
      }),
    );

    await t.run((ctx) =>
      transitionOperationRecord(ctx, {
        operationId: restore.operationId,
        expectedRevision: 0,
        to: "running",
      }),
    );
    await expect(
      t.run((ctx) =>
        completeOperationRecord(ctx, {
          operationId: restore.operationId,
          expectedRevision: 1,
          state: "succeeded",
          summary: { restored: true },
        }),
      ),
    ).rejects.toThrow("pre-backup");

    await t.run(async (ctx) => {
      const artifactStorageId = await ctx.storage.store(
        new Blob(["fixture snapshot"]),
      );
      const backupId = await ctx.db.insert("overseer_siteBackups", {
        snapshotId: "snapshot_pre_restore_001",
        sourceOperationId: restore.operationId,
        purpose: "pre-restore",
        websiteId: target.websiteId,
        instanceId: target.liveInstanceId,
        websiteKey: "website_northstar",
        instanceKey: "instance_northstar_live",
        environmentKind: "live",
        siteContractVersion: "1.0.0",
        schemaVersion: "1.0.0",
        engineVersion: "1.0.0",
        checksumSha256: "a".repeat(64),
        sizeBytes: 16,
        tableCount: 1,
        storageObjectCount: 0,
        artifactStorageId,
        manifestJson: JSON.stringify({ snapshotId: "snapshot_pre_restore_001" }),
        verificationStatus: "verified",
        createdByControllerId: "controller_standalone",
        createdByUserId: target.userId,
        immutableAt: 1_788_400_000_000,
        verifiedAt: 1_788_400_000_000,
        createdAt: 1_788_400_000_000,
      });
      const receiptId = "receipt_pre_restore_001";
      await ctx.db.insert("overseer_operationReceipts", {
        receiptId,
        operationId: restore.operationId,
        operationCode: "site.backup.create",
        websiteKey: "website_northstar",
        instanceKey: "instance_northstar_live",
        status: "succeeded",
        preBackupSnapshotId: "snapshot_pre_restore_001",
        summaryJson: JSON.stringify({
          kind: "verified-pre-backup",
          snapshotId: "snapshot_pre_restore_001",
        }),
        startedAt: 1_788_400_000_000,
        completedAt: 1_788_400_000_000,
        createdAt: 1_788_400_000_000,
      });
      await attachVerifiedPreBackup(ctx, {
        operationId: restore.operationId,
        backupId,
        receiptId,
      });
    });

    const completed = await t.run((ctx) =>
      completeOperationRecord(ctx, {
        operationId: restore.operationId,
        expectedRevision: 2,
        state: "succeeded",
        summary: { restored: true },
      }),
    );
    expect(completed.status).toBe("succeeded");

    const receipts = await t.run((ctx) =>
      ctx.db.query("overseer_operationReceipts").take(10),
    );
    expect(receipts).toHaveLength(2);
    expect(receipts.every((receipt) => receipt.completedAt !== undefined)).toBe(
      true,
    );
  });

  test("persists only sanitized terminal failure details", async () => {
    const t = createHarness();
    const target = await seedTarget(t);
    const created = await t.run((ctx) =>
      createOperationRecord(ctx, {
        operationCode: "site.backup.create",
        idempotencyKey: "idempotency_backup_failure",
        websiteId: target.websiteId,
        instanceId: target.liveInstanceId,
        requestedByUserId: target.userId,
        provider: "manual",
        includeStorage: true,
      }),
    );
    await t.run((ctx) =>
      transitionOperationRecord(ctx, {
        operationId: created.operationId,
        expectedRevision: 0,
        to: "running",
      }),
    );
    await t.run((ctx) =>
      completeOperationRecord(ctx, {
        operationId: created.operationId,
        expectedRevision: 1,
        state: "failed",
        failure: new Error("adminKey=top-secret bearer=private"),
        failureCode: "SNAPSHOT_EXPORT_FAILED",
      }),
    );

    const stored = await t.run((ctx) => ctx.db.get(created.operationId));
    expect(stored?.failureCode).toBe("SNAPSHOT_EXPORT_FAILED");
    expect(stored?.failureMessage).toBe("The site operation failed safely.");
    expect(JSON.stringify(stored)).not.toContain("top-secret");
    expect(JSON.stringify(stored)).not.toContain("bearer=private");
  });

  test("keeps interrupted work locked and resumes it without a terminal receipt", async () => {
    const t = createHarness();
    const target = await seedTarget(t);
    const created = await t.run((ctx) =>
      createOperationRecord(ctx, {
        operationCode: "site.backup.create",
        idempotencyKey: "idempotency_backup_interrupted",
        websiteId: target.websiteId,
        instanceId: target.liveInstanceId,
        requestedByUserId: target.userId,
        provider: "manual",
        includeStorage: true,
      }),
    );
    await t.run((ctx) =>
      transitionOperationRecord(ctx, {
        operationId: created.operationId,
        expectedRevision: 0,
        to: "running",
      }),
    );
    await t.run(async (ctx) => {
      const steps = await ctx.db
        .query("overseer_operationSteps")
        .withIndex("by_operation_sequence", (q) =>
          q.eq("operationId", created.operationId),
        )
        .take(20);
      const activeStep = steps.find(
        (step) => step.stepKey === "snapshot.export",
      )!;
      await ctx.db.patch(activeStep._id, {
        state: "failed",
        attempt: 1,
        errorCode: "SITE_OPERATION_FAILED",
        completedAt: 1_788_400_000_100,
        updatedAt: 1_788_400_000_100,
      });
      await ctx.db.patch(created.operationId, {
        currentStep: "snapshot.export",
      });
    });

    const interrupted = await t.run((ctx) =>
      interruptOperationRecord(ctx, {
        operationId: created.operationId,
        expectedRevision: 1,
        failure: new Error("token=private provider outage"),
        failureCode: "SNAPSHOT_PROVIDER_UNAVAILABLE",
      }),
    );
    expect(interrupted).toEqual({ state: "interrupted", revision: 2 });

    let stored = await t.run(async (ctx) => ({
      operation: await ctx.db.get(created.operationId),
      receipts: await ctx.db.query("overseer_operationReceipts").take(10),
    }));
    expect(stored.operation?.exclusiveTargetLock).toBe(true);
    expect(stored.operation?.failureMessage).toBe(
      "The site operation failed safely.",
    );
    expect(stored.receipts).toHaveLength(0);

    const resumed = await t.run((ctx) =>
      resumeOperationRecord(ctx, {
        operationId: created.operationId,
        expectedRevision: 2,
      }),
    );
    expect(resumed).toEqual({ state: "running", revision: 4 });
    const resumedStep = await t.run(async (ctx) => {
      const steps = await ctx.db
        .query("overseer_operationSteps")
        .withIndex("by_operation_sequence", (q) =>
          q.eq("operationId", created.operationId),
        )
        .take(20);
      return steps.find((step) => step.stepKey === "snapshot.export");
    });
    expect(resumedStep).toMatchObject({
      state: "running",
      attempt: 2,
    });
    expect(resumedStep?.errorCode).toBeUndefined();
    expect(resumedStep?.completedAt).toBeUndefined();

    await t.run((ctx) =>
      completeOperationRecord(ctx, {
        operationId: created.operationId,
        expectedRevision: 4,
        state: "succeeded",
        summary: { resumed: true },
      }),
    );
    stored = await t.run(async (ctx) => ({
      operation: await ctx.db.get(created.operationId),
      receipts: await ctx.db.query("overseer_operationReceipts").take(10),
    }));
    expect(stored.operation?.exclusiveTargetLock).toBe(false);
    expect(stored.receipts).toHaveLength(1);
  });
});
