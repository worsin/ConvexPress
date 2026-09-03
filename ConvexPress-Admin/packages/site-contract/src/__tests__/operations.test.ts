import { describe, expect, test } from "bun:test";

import {
  MUTATING_OPERATION_CODES,
  OPERATION_CODES,
  parseOperationRequest,
} from "../operations";

describe("portable management operations", () => {
  test("every mutating operation requires an idempotency key", () => {
    for (const operationCode of MUTATING_OPERATION_CODES) {
      expect(() =>
        parseOperationRequest({
          websiteKey: "website_acme",
          instanceKey: "instance_prod",
          operationCode,
          parameters: {},
        }),
      ).toThrow("idempotencyKey");
    }
  });

  test("read-only health and compatibility checks need no idempotency key", () => {
    for (const request of [
      { operationCode: OPERATION_CODES.healthCheck, parameters: {} },
      {
        operationCode: OPERATION_CODES.compatibilityCheck,
        parameters: {
          siteContractVersion: "1.0.0",
          schemaVersion: "2026.9.0",
          engineVersion: "1.0.0",
        },
      },
    ] as const) {
      expect(
        parseOperationRequest({
          websiteKey: "website_acme",
          instanceKey: "instance_prod",
          ...request,
        }).operationCode,
      ).toBe(request.operationCode);
    }
  });

  test("validates every lifecycle payload rather than accepting arbitrary JSON", () => {
    const cases = [
      {
        operationCode: OPERATION_CODES.attach,
        idempotencyKey: "attach-instance-001",
        parameters: {
          deploymentOrigin: "https://acme.convex.cloud",
          managementOrigin: "https://acme.convex.site",
          siteOrigin: "https://shop.example.com",
          environmentKind: "live",
          connectionRef: "connection_acme",
        },
      },
      {
        operationCode: OPERATION_CODES.healthCheck,
        parameters: {},
      },
      {
        operationCode: OPERATION_CODES.compatibilityCheck,
        parameters: {
          siteContractVersion: "1.0.0",
          schemaVersion: "2026.9.0",
          engineVersion: "1.0.0",
        },
      },
      {
        operationCode: OPERATION_CODES.sessionExchange,
        idempotencyKey: "session-exchange-001",
        parameters: { requestedCapabilities: ["health.read", "backup.create"] },
      },
      {
        operationCode: OPERATION_CODES.backupCreate,
        idempotencyKey: "backup-instance-001",
        parameters: { includeStorage: true },
      },
      {
        operationCode: OPERATION_CODES.clone,
        idempotencyKey: "clone-instance-001",
        parameters: { destinationInstanceKey: "instance_staging" },
      },
      {
        operationCode: OPERATION_CODES.promote,
        idempotencyKey: "promote-instance-001",
        parameters: {
          sourceInstanceKey: "instance_staging",
          confirmation: "PROMOTE TO LIVE",
        },
      },
      {
        operationCode: OPERATION_CODES.restore,
        idempotencyKey: "restore-instance-001",
        parameters: {
          snapshotId: "snapshot_20260902_001",
          confirmation: "RESTORE LIVE",
        },
      },
      {
        operationCode: OPERATION_CODES.credentialRotate,
        idempotencyKey: "rotate-instance-001",
        parameters: { connectionRef: "connection_acme" },
      },
      {
        operationCode: OPERATION_CODES.authorityRevoke,
        idempotencyKey: "revoke-authority-001",
        parameters: {
          controllerId: "controller_standalone",
          keyId: "key_primary_2026",
        },
      },
      {
        operationCode: OPERATION_CODES.operationResume,
        idempotencyKey: "resume-operation-001",
        parameters: { operationId: "operation_restore_001" },
      },
      {
        operationCode: OPERATION_CODES.handoffExport,
        idempotencyKey: "handoff-site-001",
        parameters: { includeRunbook: true, includeSnapshots: true },
      },
    ] as const;

    for (const item of cases) {
      expect(
        parseOperationRequest({
          websiteKey: "website_acme",
          instanceKey: "instance_prod",
          ...item,
        }).operationCode,
      ).toBe(item.operationCode);
    }
  });

  test("rejects an operation payload that belongs to a different lifecycle action", () => {
    expect(() =>
      parseOperationRequest({
        websiteKey: "website_acme",
        instanceKey: "instance_prod",
        operationCode: OPERATION_CODES.restore,
        idempotencyKey: "restore-instance-001",
        parameters: { destinationInstanceKey: "instance_staging" },
      }),
    ).toThrow("parameters");
  });

  test("all operations have an explicit website and environment audience", () => {
    expect(() =>
      parseOperationRequest({
        websiteKey: "website_acme",
        operationCode: OPERATION_CODES.backupCreate,
        idempotencyKey: "backup-2026-09-02-001",
        parameters: {},
      }),
    ).toThrow();
  });
});
