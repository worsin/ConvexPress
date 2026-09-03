import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";

import {
  inspectConvexSnapshot,
  verifyConvexSnapshotChecksum,
} from "../snapshotArchive";

function fixtureSnapshot(overrides?: { identity?: unknown; omitReadme?: boolean }) {
  const identity =
    overrides?.identity ??
    {
      _id: "identity_document",
      _creationTime: 1_788_400_000_000,
      identityKey: "site-identity",
      websiteKey: "website_northstar",
      instanceKey: "instance_northstar_live",
      environmentKind: "live",
      deploymentOrigin: "http://127.0.0.1:4820",
      managementOrigin: "http://127.0.0.1:4821",
      siteOrigin: "http://127.0.0.1:4105",
      siteContractVersion: "1.0.0",
      schemaVersion: "1.0.0",
      engineVersion: "1.0.0",
      managementCapabilities: ["health.read", "backup.create"],
      initializedAt: 1_788_400_000_000,
      updatedAt: 1_788_400_000_000,
    };
  return zipSync({
    ...(overrides?.omitReadme ? {} : { "README.md": strToU8("snapshot") }),
    "_tables/documents.jsonl": strToU8("{}\n"),
    "_storage/documents.jsonl": strToU8(
      '{"_id":"storage_one"}\n{"_id":"storage_two"}\n',
    ),
    "convexpress_siteIdentity/documents.jsonl": strToU8(
      `${JSON.stringify(identity)}\n`,
    ),
    "convexpress_siteIdentity/generated_schema.jsonl": strToU8("{}\n"),
    "posts/documents.jsonl": strToU8('{"title":"Distinctive post"}\n'),
    "posts/generated_schema.jsonl": strToU8("{}\n"),
  });
}

describe("Convex snapshot inspection", () => {
  test("verifies structure, site identity, versions, checksum, and inventory", async () => {
    const inspected = await inspectConvexSnapshot({
      bytes: fixtureSnapshot(),
      snapshotId: "snapshot_northstar_001",
      expectedWebsiteKey: "website_northstar",
      expectedInstanceKey: "instance_northstar_live",
      expectedEnvironmentKind: "live",
      createdByControllerId: "controller_standalone",
      createdAt: new Date("2026-09-02T20:30:00.000Z"),
    });

    expect(inspected.manifest).toMatchObject({
      snapshotId: "snapshot_northstar_001",
      websiteKey: "website_northstar",
      instanceKey: "instance_northstar_live",
      environmentKind: "live",
      siteContractVersion: "1.0.0",
      schemaVersion: "1.0.0",
      engineVersion: "1.0.0",
      sizeBytes: inspected.bytes.byteLength,
      tableCount: 2,
      storageObjectCount: 2,
      createdByControllerId: "controller_standalone",
      verificationStatus: "verified",
    });
    expect(inspected.manifest.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.tableNames).toEqual([
      "convexpress_siteIdentity",
      "posts",
    ]);
    expect(JSON.stringify(inspected.manifest)).not.toMatch(
      /adminKey|privateKey|token|credential/i,
    );
  });

  test("rejects a missing snapshot marker or required site identity", async () => {
    await expect(
      inspectConvexSnapshot({
        bytes: fixtureSnapshot({ omitReadme: true }),
        snapshotId: "snapshot_northstar_001",
        expectedWebsiteKey: "website_northstar",
        expectedInstanceKey: "instance_northstar_live",
        expectedEnvironmentKind: "live",
        createdByControllerId: "controller_standalone",
      }),
    ).rejects.toThrow("README");

    await expect(
      inspectConvexSnapshot({
        bytes: zipSync({
          "README.md": strToU8("snapshot"),
          "_tables/documents.jsonl": strToU8("{}\n"),
          "_storage/documents.jsonl": strToU8(""),
          "posts/documents.jsonl": strToU8("{}\n"),
          "posts/generated_schema.jsonl": strToU8("{}\n"),
        }),
        snapshotId: "snapshot_northstar_001",
        expectedWebsiteKey: "website_northstar",
        expectedInstanceKey: "instance_northstar_live",
        expectedEnvironmentKind: "live",
        createdByControllerId: "controller_standalone",
      }),
    ).rejects.toThrow("site identity");
  });

  test("rejects a snapshot from the wrong website, environment, or deployment", async () => {
    await expect(
      inspectConvexSnapshot({
        bytes: fixtureSnapshot(),
        snapshotId: "snapshot_northstar_001",
        expectedWebsiteKey: "website_other",
        expectedInstanceKey: "instance_northstar_live",
        expectedEnvironmentKind: "live",
        createdByControllerId: "controller_standalone",
      }),
    ).rejects.toThrow("identity");

    await expect(
      inspectConvexSnapshot({
        bytes: fixtureSnapshot(),
        snapshotId: "snapshot_northstar_001",
        expectedWebsiteKey: "website_northstar",
        expectedInstanceKey: "instance_northstar_staging",
        expectedEnvironmentKind: "staging",
        createdByControllerId: "controller_standalone",
      }),
    ).rejects.toThrow("identity");
  });

  test("detects stored artifact corruption by checksum", async () => {
    const bytes = fixtureSnapshot();
    const inspected = await inspectConvexSnapshot({
      bytes,
      snapshotId: "snapshot_northstar_001",
      expectedWebsiteKey: "website_northstar",
      expectedInstanceKey: "instance_northstar_live",
      expectedEnvironmentKind: "live",
      createdByControllerId: "controller_standalone",
    });
    expect(
      verifyConvexSnapshotChecksum(bytes, inspected.manifest.checksumSha256),
    ).toBe(true);

    const corrupted = bytes.slice();
    corrupted[10] = (corrupted[10] ?? 0) ^ 0xff;
    expect(() =>
      verifyConvexSnapshotChecksum(
        corrupted,
        inspected.manifest.checksumSha256,
      ),
    ).toThrow("checksum");
  });
});
