import { describe, expect, test } from "bun:test";

import {
  createHandoffBundle,
  parseHandoffBundle,
} from "../handoffs";

const manifest = {
  handoffId: "handoff_northstar_20260902",
  sourceControllerId: "controller_convexpress_standalone",
  exportedAt: "2026-09-02T18:00:00.000Z",
  expiresAt: "2026-09-09T18:00:00.000Z",
  website: {
    websiteKey: "acceptance:northstar:shop",
    title: "Northstar Shop",
    primaryDomain: "shop.northstar.example",
  },
  environments: [
    {
      instanceKey: "acceptance:northstar:shop:live",
      environmentKind: "live" as const,
      label: "Production",
      deploymentOrigin: "http://127.0.0.1:4820/",
      managementOrigin: "http://127.0.0.1:4821/",
      siteOrigin: "https://shop.northstar.example/",
      siteContractVersion: "1.0.0",
      schemaVersion: "2026.9.0",
      engineVersion: "1.0.0",
      snapshot: {
        snapshotId: "snapshot_northstar_live_20260902",
        checksumSha256: "a".repeat(64),
        sizeBytes: 4_096,
        tableCount: 255,
        storageObjectCount: 3,
        createdAt: "2026-09-02T17:55:00.000Z",
      },
    },
  ],
  runbook: {
    version: "1.0.0",
    steps: [
      "Install the standalone ConvexPress control plane.",
      "Import this handoff package into an authorized business.",
      "Attach each environment with credentials supplied out of band.",
      "Verify health before revoking the prior controller authority.",
    ],
  },
};

describe("portable client handoff bundle", () => {
  test("normalizes public origins and verifies the canonical checksum", () => {
    const bundle = createHandoffBundle(manifest);
    expect(bundle.format).toBe("convexpress-handoff");
    expect(bundle.formatVersion).toBe("1.0.0");
    expect(bundle.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.manifest.environments[0]?.deploymentOrigin).toBe(
      "http://127.0.0.1:4820",
    );
    expect(parseHandoffBundle(JSON.stringify(bundle))).toEqual(bundle);
  });

  test("rejects a modified manifest, cross-site instance, and secret-bearing data", () => {
    const bundle = createHandoffBundle(manifest);
    expect(() =>
      parseHandoffBundle({
        ...bundle,
        manifest: {
          ...bundle.manifest,
          website: { ...bundle.manifest.website, title: "Changed" },
        },
      }),
    ).toThrow("checksum");

    expect(() =>
      createHandoffBundle({
        ...manifest,
        environments: [
          {
            ...manifest.environments[0]!,
            instanceKey: "acceptance:other:site:live",
          },
        ],
      }),
    ).toThrow("website key");

    expect(() =>
      parseHandoffBundle({
        ...bundle,
        deployKey: "must-never-travel",
      }),
    ).toThrow();
  });
});
