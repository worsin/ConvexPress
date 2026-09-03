import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";
import { unzipSync, zipSync } from "fflate";

import {
  MANAGEMENT_TABLES_PRESERVED_ON_IMPORT,
  prepareTargetBoundSnapshot,
} from "../snapshotRestoreArchive";

const encoder = new TextEncoder();

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonLine(value: unknown) {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

function snapshot(input: {
  instanceKey: string;
  environmentKind: "live" | "staging";
  marker: string;
}) {
  const identity = {
    _id: `identity-${input.marker}`,
    _creationTime: 1,
    identityKey: "site-identity",
    websiteKey: "website-northstar",
    instanceKey: input.instanceKey,
    environmentKind: input.environmentKind,
    deploymentOrigin: "http://127.0.0.1:4800",
    managementOrigin: "http://127.0.0.1:4801",
    siteOrigin: "http://127.0.0.1:4100",
    siteContractVersion: "1.0.0",
    schemaVersion: "1.0.0",
    engineVersion: "1.0.0",
    managementCapabilities: ["site.restore"],
    initializedAt: 1,
    updatedAt: 1,
  };
  const files: Record<string, Uint8Array> = {
    "README.md": encoder.encode("snapshot"),
    "_tables/documents.jsonl": jsonLine({ name: "posts" }),
    "_storage/documents.jsonl": new Uint8Array(),
    "convexpress_siteIdentity/documents.jsonl": jsonLine(identity),
    "convexpress_siteIdentity/generated_schema.jsonl": jsonLine({ schema: true }),
    "posts/documents.jsonl": jsonLine({ _id: `post-${input.marker}`, title: input.marker }),
    "posts/generated_schema.jsonl": jsonLine({ schema: true }),
  };
  for (const table of MANAGEMENT_TABLES_PRESERVED_ON_IMPORT) {
    if (table === "convexpress_siteIdentity") continue;
    files[`${table}/documents.jsonl`] =
      table === "convexpress_managementAuthorities"
        ? jsonLine({
            _id: `authority-${input.marker}`,
            controllerId: `controller-${input.marker}`,
            keyId: `key-${input.marker}`,
            marker: input.marker,
          })
        : table === "convexpress_managementBindings"
          ? jsonLine({
              _id: `binding-${input.marker}`,
              authorityId: `authority-${input.marker}`,
              controllerId: `controller-${input.marker}`,
              syntheticOperatorId: `user-${input.marker}`,
              userId: `user-${input.marker}`,
              marker: input.marker,
              capabilityRevision: 1.0,
              updatedAt: 1.0,
            })
          : jsonLine({
              _id: `${table}-${input.marker}`,
              marker: input.marker,
            });
    files[`${table}/generated_schema.jsonl`] = jsonLine({ schema: true });
  }
  return zipSync(files);
}

describe("target-bound snapshot preparation", () => {
  test("copies content, preserves target authorities, and resets target sessions", async () => {
    const source = snapshot({
      instanceKey: "northstar-staging",
      environmentKind: "staging",
      marker: "source",
    });
    const target = snapshot({
      instanceKey: "northstar-live",
      environmentKind: "live",
      marker: "target",
    });
    const result = await prepareTargetBoundSnapshot({
      sourceBytes: source,
      sourceChecksumSha256: checksum(source),
      sourceSnapshotId: "snapshot-source",
      sourceIdentity: {
        websiteKey: "website-northstar",
        instanceKey: "northstar-staging",
        environmentKind: "staging",
      },
      targetPreBackupBytes: target,
      targetPreBackupChecksumSha256: checksum(target),
      targetPreBackupSnapshotId: "snapshot-target-prebackup",
      targetIdentity: {
        websiteKey: "website-northstar",
        instanceKey: "northstar-live",
        environmentKind: "live",
      },
    });
    const files = unzipSync(result.bytes);

    expect(new TextDecoder().decode(files["posts/documents.jsonl"])).toContain(
      "source",
    );
    for (const table of [
      "convexpress_siteIdentity",
      "convexpress_managementAuthorities",
    ]) {
      expect(
        new TextDecoder().decode(files[`${table}/documents.jsonl`]),
      ).toContain("target");
    }
    const bindings = JSON.parse(
      new TextDecoder()
        .decode(files["convexpress_managementBindings/documents.jsonl"])
        .trim(),
    );
    expect(bindings.userId).toBeUndefined();
    expect(bindings.syntheticOperatorId).toBe(
      "controller:controller-target:key-target",
    );
    expect(
      new TextDecoder().decode(
        files["convexpress_managementBindings/documents.jsonl"],
      ),
    ).toContain('"capabilityRevision":1.0');
    expect(
      files["convexpress_managementSessions/documents.jsonl"],
    ).toHaveLength(0);
    expect(
      files["convexpress_managementNonces/documents.jsonl"],
    ).toHaveLength(0);
    expect(result.checksumSha256).toBe(checksum(result.bytes));
    expect(result.preservedTables).toEqual([
      ...MANAGEMENT_TABLES_PRESERVED_ON_IMPORT,
    ]);
  });

  test("rejects either artifact when its immutable checksum changed", async () => {
    const source = snapshot({
      instanceKey: "northstar-staging",
      environmentKind: "staging",
      marker: "source",
    });
    const target = snapshot({
      instanceKey: "northstar-live",
      environmentKind: "live",
      marker: "target",
    });
    await expect(
      prepareTargetBoundSnapshot({
        sourceBytes: source,
        sourceChecksumSha256: "0".repeat(64),
        sourceSnapshotId: "snapshot-source",
        sourceIdentity: {
          websiteKey: "website-northstar",
          instanceKey: "northstar-staging",
          environmentKind: "staging",
        },
        targetPreBackupBytes: target,
        targetPreBackupChecksumSha256: checksum(target),
        targetPreBackupSnapshotId: "snapshot-target-prebackup",
        targetIdentity: {
          websiteKey: "website-northstar",
          instanceKey: "northstar-live",
          environmentKind: "live",
        },
      }),
    ).rejects.toThrow("checksum");
  });
});
