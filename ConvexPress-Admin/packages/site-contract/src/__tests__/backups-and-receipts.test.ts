import { describe, expect, test } from "bun:test";

import { backupManifestSchema } from "../backups";
import {
  assertSecretFree,
  operationReceiptSchema,
  sanitizeReceiptSummary,
} from "../receipts";

describe("backup manifests", () => {
  test("binds a snapshot to one isolated site environment and its versions", () => {
    const manifest = backupManifestSchema.parse({
      snapshotId: "snapshot_20260902_001",
      websiteKey: "website_acme",
      instanceKey: "instance_prod",
      environmentKind: "live",
      siteContractVersion: "1.0.0",
      schemaVersion: "2026.9.0",
      engineVersion: "1.0.0",
      checksumSha256: "a".repeat(64),
      sizeBytes: 1500,
      tableCount: 32,
      storageObjectCount: 8,
      createdByControllerId: "controller_standalone",
      verificationStatus: "verified",
      createdAt: "2026-09-02T18:00:00.000Z",
    });

    expect(manifest.instanceKey).toBe("instance_prod");
    expect(manifest.checksumSha256).toHaveLength(64);
  });
});

describe("operation receipts", () => {
  test("records lifecycle evidence without storing credentials", () => {
    const receipt = operationReceiptSchema.parse({
      receiptId: "receipt_backup_001",
      operationCode: "site.backup.create",
      websiteKey: "website_acme",
      instanceKey: "instance_prod",
      status: "succeeded",
      startedAt: "2026-09-02T18:00:00.000Z",
      completedAt: "2026-09-02T18:00:10.000Z",
      preBackupSnapshotId: "snapshot_20260902_000",
      summary: { snapshotId: "snapshot_20260902_001", tableCount: 32 },
    });

    expect(receipt.status).toBe("succeeded");
    expect(() => assertSecretFree(receipt)).not.toThrow();
  });

  test("strips secret-bearing fields recursively and rejects unsanitized receipts", () => {
    expect(
      sanitizeReceiptSummary({
        deploymentUrl: "https://example.com",
        adminKey: "must-not-survive",
        nested: { token: "must-not-survive", count: 4 },
      }),
    ).toEqual({
      deploymentUrl: "https://example.com",
      nested: { count: 4 },
    });

    expect(() =>
      operationReceiptSchema.parse({
        receiptId: "receipt_bad_001",
        operationCode: "site.attach",
        websiteKey: "website_acme",
        instanceKey: "instance_prod",
        status: "succeeded",
        startedAt: "2026-09-02T18:00:00.000Z",
        completedAt: "2026-09-02T18:00:01.000Z",
        summary: { credential: "plaintext" },
      }),
    ).toThrow("secret-bearing");
  });

  test("requires a verified pre-backup receipt for successful restore and promotion", () => {
    for (const operationCode of ["site.restore", "site.promote"] as const) {
      const completion = {
        receiptId: `receipt_${operationCode.replace("site.", "")}_001`,
        operationCode,
        websiteKey: "website_acme",
        instanceKey: "instance_prod",
        status: "succeeded",
        startedAt: "2026-09-02T18:00:00.000Z",
        completedAt: "2026-09-02T18:01:00.000Z",
        summary: {},
      };

      expect(() => operationReceiptSchema.parse(completion)).toThrow(
        "preBackupReceiptId",
      );
      expect(
        operationReceiptSchema.parse({
          ...completion,
          preBackupReceiptId: "receipt_prebackup_001",
        }).preBackupReceiptId,
      ).toBe("receipt_prebackup_001");
    }
  });
});
