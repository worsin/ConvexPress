import { describe, expect, test } from "bun:test";
import { assertSecretFree } from "@convexpress/site-contract";

import {
  buildHandoffBundleFromRecords,
  buildHandoffImportPlan,
} from "../handoffs";

const now = Date.parse("2026-09-02T18:00:00.000Z");

const website = {
  websiteKey: "acceptance:northstar:shop",
  title: "Northstar Shop",
  primaryDomain: "shop.northstar.example",
};

const environments = [
  {
    instanceKey: "acceptance:northstar:shop:live",
    kind: "live" as const,
    label: "Production",
    deploymentOrigin: "http://127.0.0.1:4820",
    managementOrigin: "http://127.0.0.1:4821",
    siteOrigin: "https://shop.northstar.example",
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
  },
  {
    instanceKey: "acceptance:northstar:shop:staging",
    kind: "staging" as const,
    label: "Staging",
    deploymentOrigin: "http://127.0.0.1:4830",
    managementOrigin: "http://127.0.0.1:4831",
    siteOrigin: "https://staging.shop.northstar.example",
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
  },
];

const backups = environments.map((environment, index) => ({
  instanceKey: environment.instanceKey,
  snapshotId: `snapshot_northstar_${index}`,
  checksumSha256: String(index + 1).repeat(64),
  sizeBytes: 8_192 + index,
  tableCount: 255,
  storageObjectCount: 2,
  siteContractVersion: environment.siteContractVersion,
  schemaVersion: environment.schemaVersion,
  engineVersion: environment.engineVersion,
  verificationStatus: "verified" as const,
  createdAt: now - index * 1_000,
}));

describe("control-plane handoff construction", () => {
  test("builds a secret-free package for every isolated environment and imports it", () => {
    const bundle = buildHandoffBundleFromRecords({
      handoffId: "handoff_northstar_20260902",
      sourceControllerId: "controller_convexpress_standalone",
      website,
      environments,
      backups,
      includeSnapshots: true,
      includeRunbook: true,
      now,
      expiresAt: now + 7 * 24 * 60 * 60_000,
    });

    expect(bundle.manifest.environments).toHaveLength(2);
    expect(bundle.manifest.environments.every((item) => item.snapshot)).toBe(true);
    expect(() => assertSecretFree(bundle)).not.toThrow();
    expect(JSON.stringify(bundle)).not.toContain("must-never-travel");

    const plan = buildHandoffImportPlan({ bundle, now: now + 1_000 });
    expect(plan.website).toEqual(website);
    expect(plan.environments.map((item) => item.instanceKey)).toEqual([
      "acceptance:northstar:shop:live",
      "acceptance:northstar:shop:staging",
    ]);
  });

  test("requires current verified snapshots and rejects expired imports", () => {
    expect(() =>
      buildHandoffBundleFromRecords({
        handoffId: "handoff_northstar_missing_backup",
        sourceControllerId: "controller_convexpress_standalone",
        website,
        environments,
        backups: backups.slice(0, 1),
        includeSnapshots: true,
        includeRunbook: false,
        now,
        expiresAt: now + 60_000,
      }),
    ).toThrow("verified snapshot");

    const bundle = buildHandoffBundleFromRecords({
      handoffId: "handoff_northstar_expired",
      sourceControllerId: "controller_convexpress_standalone",
      website,
      environments,
      backups,
      includeSnapshots: false,
      includeRunbook: false,
      now,
      expiresAt: now + 60_000,
    });
    expect(() =>
      buildHandoffImportPlan({ bundle, now: now + 60_001 }),
    ).toThrow("expired");
  });
});
