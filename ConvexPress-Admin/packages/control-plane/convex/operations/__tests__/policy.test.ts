import { describe, expect, test } from "bun:test";

import {
  assertLifecycleRequestSafety,
  assertSnapshotCompatibleForTarget,
  createOperationFingerprint,
  isExclusiveTargetOperation,
  requiresVerifiedPreBackup,
} from "../policy";

describe("site lifecycle operation policy", () => {
  test("allows compatible snapshot versions and rejects major-version imports", () => {
    expect(() =>
      assertSnapshotCompatibleForTarget({
        source: {
          siteContractVersion: "1.4.0",
          schemaVersion: "2026.9.0",
          engineVersion: "1.1.0",
        },
        target: {
          siteContractVersion: "1.0.0",
          schemaVersion: "2026.3.0",
          engineVersion: "1.8.0",
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertSnapshotCompatibleForTarget({
        source: {
          siteContractVersion: "2.0.0",
          schemaVersion: "2026.9.0",
          engineVersion: "1.0.0",
        },
        target: {
          siteContractVersion: "1.0.0",
          schemaVersion: "2026.9.0",
          engineVersion: "1.0.0",
        },
      }),
    ).toThrow("site contract");
  });

  test("serializes every operation that can mutate or snapshot a target", () => {
    for (const operationCode of [
      "site.engine.deploy",
      "site.backup.create",
      "site.clone",
      "site.promote",
      "site.restore",
      "site.credential.rotate",
      "site.authority.grant",
      "site.authority.revoke",
      "site.handoff.export",
    ] as const) {
      expect(isExclusiveTargetOperation(operationCode)).toBe(true);
    }

    for (const operationCode of [
      "site.health.check",
      "site.compatibility.check",
      "site.select",
      "site.session.exchange",
      "site.operation.resume",
    ] as const) {
      expect(isExclusiveTargetOperation(operationCode)).toBe(false);
    }
  });

  test("requires verified target pre-backups for every database replacement", () => {
    expect(requiresVerifiedPreBackup("site.restore")).toBe(true);
    expect(requiresVerifiedPreBackup("site.promote")).toBe(true);
    expect(requiresVerifiedPreBackup("site.clone")).toBe(true);
    expect(requiresVerifiedPreBackup("site.backup.create")).toBe(false);
  });

  test("requires semantic confirmation for restore and promotion", () => {
    expect(() =>
      assertLifecycleRequestSafety({
        operationCode: "site.restore",
        targetInstanceKey: "northstar_live",
        targetKind: "live",
        snapshotId: "snapshot_20260902",
        confirmation: "restore",
      }),
    ).toThrow("RESTORE northstar_live");

    expect(() =>
      assertLifecycleRequestSafety({
        operationCode: "site.promote",
        targetInstanceKey: "northstar_live",
        targetKind: "live",
        sourceInstanceKey: "northstar_staging",
        confirmation: "PROMOTE northstar_staging",
      }),
    ).toThrow("PROMOTE TO northstar_live");

    expect(
      assertLifecycleRequestSafety({
        operationCode: "site.restore",
        targetInstanceKey: "northstar_live",
        targetKind: "live",
        snapshotId: "snapshot_20260902",
        confirmation: "RESTORE northstar_live",
      }),
    ).toBeUndefined();

    expect(
      assertLifecycleRequestSafety({
        operationCode: "site.promote",
        targetInstanceKey: "northstar_live",
        targetKind: "live",
        sourceInstanceKey: "northstar_staging",
        confirmation: "PROMOTE TO northstar_live",
      }),
    ).toBeUndefined();
  });

  test("rejects clone or promotion when source and target are the same", () => {
    for (const operationCode of ["site.clone", "site.promote"] as const) {
      expect(() =>
        assertLifecycleRequestSafety({
          operationCode,
          targetInstanceKey: "northstar_staging",
          targetKind: "staging",
          sourceInstanceKey: "northstar_staging",
          confirmation:
            operationCode === "site.promote"
              ? "PROMOTE TO northstar_staging"
              : undefined,
        }),
      ).toThrow("different");
    }
  });

  test("never permits clone to select a live destination", () => {
    expect(() =>
      assertLifecycleRequestSafety({
        operationCode: "site.clone",
        targetInstanceKey: "northstar_live",
        targetKind: "live",
        sourceInstanceKey: "northstar_staging",
      }),
    ).toThrow("non-live");
  });

  test("reserves promotion for a live destination", () => {
    expect(() =>
      assertLifecycleRequestSafety({
        operationCode: "site.promote",
        targetInstanceKey: "northstar_beta",
        targetKind: "beta",
        sourceInstanceKey: "northstar_staging",
        confirmation: "PROMOTE TO northstar_beta",
      }),
    ).toThrow("live destination");
  });

  test("makes retries stable while detecting changed replay input", () => {
    const first = createOperationFingerprint({
      operationCode: "site.restore",
      websiteKey: "northstar",
      targetInstanceKey: "northstar_live",
      sourceInstanceKey: undefined,
      snapshotId: "snapshot_20260902",
      includeStorage: true,
    });
    const reordered = createOperationFingerprint({
      snapshotId: "snapshot_20260902",
      includeStorage: true,
      sourceInstanceKey: undefined,
      targetInstanceKey: "northstar_live",
      websiteKey: "northstar",
      operationCode: "site.restore",
    });
    const changed = createOperationFingerprint({
      operationCode: "site.restore",
      websiteKey: "northstar",
      targetInstanceKey: "northstar_live",
      snapshotId: "snapshot_other",
      includeStorage: true,
    });

    expect(first).toBe(reordered);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
