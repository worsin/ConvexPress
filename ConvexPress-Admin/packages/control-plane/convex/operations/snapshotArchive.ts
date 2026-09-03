"use node";

import { createHash } from "node:crypto";

import {
  assertSecretFree,
  backupManifestSchema,
  siteIdentitySchema,
  type BackupManifest,
  type EnvironmentKind,
} from "@convexpress/site-contract";
import yauzl from "yauzl";

const MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 20_000;
const MAX_REQUIRED_ENTRY_BYTES = 64 * 1024 * 1024;
const REQUIRED_FILE_NAMES = new Set([
  "README.md",
  "_tables/documents.jsonl",
  "_storage/documents.jsonl",
  "convexpress_siteIdentity/documents.jsonl",
]);

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function nonEmptyJsonLines(bytes: Uint8Array, label: string): unknown[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`${label} contains invalid JSON lines`);
      }
    });
}

function siteIdentityFromArchive(files: Record<string, Uint8Array>) {
  const bytes = files["convexpress_siteIdentity/documents.jsonl"];
  if (!bytes) throw new Error("Convex snapshot is missing site identity");
  const rows = nonEmptyJsonLines(bytes, "Snapshot site identity");
  if (rows.length !== 1) {
    throw new Error("Convex snapshot must contain exactly one site identity");
  }
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Convex snapshot site identity is invalid");
  }
  const source = row as Record<string, unknown>;
  return siteIdentitySchema.parse({
    websiteKey: source.websiteKey,
    instanceKey: source.instanceKey,
    environmentKind: source.environmentKind,
    deploymentOrigin: source.deploymentOrigin,
    managementOrigin: source.managementOrigin,
    siteOrigin: source.siteOrigin,
    siteContractVersion: source.siteContractVersion,
    schemaVersion: source.schemaVersion,
    engineVersion: source.engineVersion,
    managementCapabilities: source.managementCapabilities,
  });
}

async function readSnapshotDirectory(bytes: Uint8Array): Promise<{
  names: string[];
  files: Record<string, Uint8Array>;
}> {
  return await new Promise((resolve, reject) => {
    const source = Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    yauzl.fromBuffer(
      source,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(new Error("Convex snapshot archive is invalid"));
          return;
        }
        const names: string[] = [];
        const files: Record<string, Uint8Array> = {};
        let settled = false;
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          zipFile.close();
          reject(new Error(message));
        };
        zipFile.on("error", () => fail("Convex snapshot archive is invalid"));
        zipFile.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({ names, files });
        });
        zipFile.on("entry", (entry) => {
          const name = entry.fileName;
          if (
            name.startsWith("/") ||
            name.includes("\\") ||
            name.split("/").some((segment: string) => segment === "..")
          ) {
            fail("Convex snapshot contains an unsafe archive path");
            return;
          }
          names.push(name);
          if (names.length > MAX_ARCHIVE_ENTRIES) {
            fail("Convex snapshot archive entry count is invalid");
            return;
          }
          if (!REQUIRED_FILE_NAMES.has(name)) {
            zipFile.readEntry();
            return;
          }
          if (entry.uncompressedSize > MAX_REQUIRED_ENTRY_BYTES) {
            fail("Convex snapshot required metadata is too large");
            return;
          }
          zipFile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail("Convex snapshot required metadata could not be read");
              return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            stream.on("data", (chunk: Buffer) => {
              length += chunk.byteLength;
              if (length > MAX_REQUIRED_ENTRY_BYTES) {
                stream.destroy();
                fail("Convex snapshot required metadata is too large");
                return;
              }
              chunks.push(chunk);
            });
            stream.on("error", () =>
              fail("Convex snapshot required metadata could not be read"),
            );
            stream.on("end", () => {
              if (settled) return;
              files[name] = Buffer.concat(chunks);
              zipFile.readEntry();
            });
          });
        });
        zipFile.readEntry();
      },
    );
  });
}

export async function inspectConvexSnapshot(input: {
  bytes: Uint8Array;
  snapshotId: string;
  expectedWebsiteKey: string;
  expectedInstanceKey: string;
  expectedEnvironmentKind: EnvironmentKind;
  createdByControllerId: string;
  createdAt?: Date;
}): Promise<{
  bytes: Uint8Array;
  manifest: BackupManifest & { verificationStatus: "verified" };
  tableNames: string[];
}> {
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_SNAPSHOT_BYTES
  ) {
    throw new Error("Convex snapshot size is invalid");
  }

  let directory: Awaited<ReturnType<typeof readSnapshotDirectory>>;
  try {
    directory = await readSnapshotDirectory(input.bytes);
  } catch {
    throw new Error("Convex snapshot archive is invalid");
  }
  const { files, names } = directory;
  if (names.length === 0 || names.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("Convex snapshot archive entry count is invalid");
  }
  if (!files["README.md"]) {
    throw new Error("Convex snapshot is missing README metadata");
  }
  if (!files["_tables/documents.jsonl"] || !files["_storage/documents.jsonl"]) {
    throw new Error("Convex snapshot is missing required database inventory");
  }

  const tableNames = names
    .filter((name) => {
      const [table, file, extra] = name.split("/");
      return Boolean(
        table &&
          !table.startsWith("_") &&
          file === "documents.jsonl" &&
          extra === undefined,
      );
    })
    .map((name) => name.slice(0, -"/documents.jsonl".length))
    .sort();
  if (tableNames.length === 0) {
    throw new Error("Convex snapshot contains no application tables");
  }
  const nameSet = new Set(names);
  for (const tableName of tableNames) {
    if (!nameSet.has(`${tableName}/generated_schema.jsonl`)) {
      throw new Error(`Convex snapshot table ${tableName} is missing its schema`);
    }
  }

  const identity = siteIdentityFromArchive(files);
  if (
    identity.websiteKey !== input.expectedWebsiteKey ||
    identity.instanceKey !== input.expectedInstanceKey ||
    identity.environmentKind !== input.expectedEnvironmentKind
  ) {
    throw new Error("Convex snapshot site identity does not match its target");
  }

  const storageObjectCount = nonEmptyJsonLines(
    files["_storage/documents.jsonl"]!,
    "Snapshot storage inventory",
  ).length;
  const manifest = backupManifestSchema.parse({
    snapshotId: input.snapshotId,
    websiteKey: identity.websiteKey,
    instanceKey: identity.instanceKey,
    environmentKind: identity.environmentKind,
    siteContractVersion: identity.siteContractVersion,
    schemaVersion: identity.schemaVersion,
    engineVersion: identity.engineVersion,
    checksumSha256: checksum(input.bytes),
    sizeBytes: input.bytes.byteLength,
    tableCount: tableNames.length,
    storageObjectCount,
    createdByControllerId: input.createdByControllerId,
    verificationStatus: "verified",
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  }) as BackupManifest & { verificationStatus: "verified" };
  assertSecretFree(manifest, "$backupManifest");

  return { bytes: input.bytes, manifest, tableNames };
}

export function verifyConvexSnapshotChecksum(
  bytes: Uint8Array,
  expectedChecksumSha256: string,
): true {
  if (checksum(bytes) !== expectedChecksumSha256) {
    throw new Error("Convex snapshot checksum does not match its manifest");
  }
  return true;
}
