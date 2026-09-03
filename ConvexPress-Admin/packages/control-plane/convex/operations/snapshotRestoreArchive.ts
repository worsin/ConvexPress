"use node";

import { createHash } from "node:crypto";

import type { EnvironmentKind } from "@convexpress/site-contract";
import { zipSync } from "fflate";
import yauzl from "yauzl";

import {
  inspectConvexSnapshot,
  verifyConvexSnapshotChecksum,
} from "./snapshotArchive";

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 20_000;

export const MANAGEMENT_TABLES_PRESERVED_ON_IMPORT = [
  "convexpress_siteIdentity",
  "convexpress_managementAuthorities",
  "convexpress_managementBindings",
  "convexpress_managementNonces",
  "convexpress_managementSessions",
] as const;

type MinimalIdentity = {
  websiteKey: string;
  instanceKey: string;
  environmentKind: EnvironmentKind;
};

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJsonLines(bytes: Uint8Array, label: string) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        const value: unknown = JSON.parse(line);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("invalid");
        }
        return value as Record<string, unknown>;
      } catch {
        throw new Error(`${label} contains invalid JSON lines`);
      }
    });
}

function convexJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Target management binding contains a non-finite number");
    }
    return Number.isInteger(value) ? `${value}.0` : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => convexJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${JSON.stringify(key)}:${convexJson(entry)}`)
      .join(",")}}`;
  }
  throw new Error("Target management binding contains an unsupported value");
}

function jsonLines(rows: readonly Record<string, unknown>[]) {
  if (rows.length === 0) return new Uint8Array();
  return new TextEncoder().encode(
    `${rows.map((row) => convexJson(row)).join("\n")}\n`,
  );
}

function resetTargetManagementSessions(entries: Record<string, Uint8Array>) {
  const authoritiesPath =
    "convexpress_managementAuthorities/documents.jsonl";
  const bindingsPath = "convexpress_managementBindings/documents.jsonl";
  const authorities = parseJsonLines(
    entries[authoritiesPath]!,
    "Target management authorities",
  );
  const authorityById = new Map(
    authorities.map((authority) => [String(authority._id), authority]),
  );
  const bindings = parseJsonLines(
    entries[bindingsPath]!,
    "Target management bindings",
  ).map((binding) => {
    const authority = authorityById.get(String(binding.authorityId));
    if (
      !authority ||
      typeof authority.controllerId !== "string" ||
      typeof authority.keyId !== "string" ||
      binding.controllerId !== authority.controllerId
    ) {
      throw new Error("Target management binding authority is invalid");
    }
    const rebound = { ...binding };
    delete rebound.userId;
    rebound.syntheticOperatorId = `controller:${authority.controllerId}:${authority.keyId}`;
    return rebound;
  });
  entries[bindingsPath] = jsonLines(bindings);
  entries["convexpress_managementSessions/documents.jsonl"] =
    new Uint8Array();
  entries["convexpress_managementNonces/documents.jsonl"] = new Uint8Array();
}

function assertSafeName(name: string) {
  if (
    !name ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.split("/").some((segment) => segment === "..")
  ) {
    throw new Error("Snapshot contains an unsafe archive path");
  }
}

async function readAllEntries(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Snapshot archive size is invalid");
  }
  return await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    yauzl.fromBuffer(
      source,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(new Error("Snapshot archive is invalid"));
          return;
        }
        const entries: Record<string, Uint8Array> = {};
        let entryCount = 0;
        let totalBytes = 0;
        let settled = false;
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          zipFile.close();
          reject(new Error(message));
        };
        zipFile.on("error", () => fail("Snapshot archive is invalid"));
        zipFile.on("end", () => {
          if (settled) return;
          settled = true;
          resolve(entries);
        });
        zipFile.on("entry", (entry) => {
          const name = entry.fileName;
          try {
            assertSafeName(name);
          } catch {
            fail("Snapshot contains an unsafe archive path");
            return;
          }
          entryCount += 1;
          totalBytes += entry.uncompressedSize;
          if (
            entryCount > MAX_ARCHIVE_ENTRIES ||
            totalBytes > MAX_UNCOMPRESSED_BYTES
          ) {
            fail("Snapshot archive expands beyond the safe limit");
            return;
          }
          if (Object.prototype.hasOwnProperty.call(entries, name)) {
            fail("Snapshot archive contains duplicate paths");
            return;
          }
          if (name.endsWith("/")) {
            entries[name] = new Uint8Array();
            zipFile.readEntry();
            return;
          }
          zipFile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail("Snapshot archive entry could not be read");
              return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            stream.on("data", (chunk: Buffer) => {
              length += chunk.byteLength;
              if (length > entry.uncompressedSize || length > MAX_UNCOMPRESSED_BYTES) {
                stream.destroy();
                fail("Snapshot archive entry size is invalid");
                return;
              }
              chunks.push(chunk);
            });
            stream.on("error", () =>
              fail("Snapshot archive entry could not be read"),
            );
            stream.on("end", () => {
              if (settled) return;
              entries[name] = Buffer.concat(chunks);
              zipFile.readEntry();
            });
          });
        });
        zipFile.readEntry();
      },
    );
  });
}

export async function prepareTargetBoundSnapshot(input: {
  sourceBytes: Uint8Array;
  sourceChecksumSha256: string;
  sourceSnapshotId: string;
  sourceIdentity: MinimalIdentity;
  targetPreBackupBytes: Uint8Array;
  targetPreBackupChecksumSha256: string;
  targetPreBackupSnapshotId: string;
  targetIdentity: MinimalIdentity;
}): Promise<{
  bytes: Uint8Array;
  checksumSha256: string;
  preservedTables: readonly string[];
}> {
  verifyConvexSnapshotChecksum(
    input.sourceBytes,
    input.sourceChecksumSha256,
  );
  verifyConvexSnapshotChecksum(
    input.targetPreBackupBytes,
    input.targetPreBackupChecksumSha256,
  );
  await inspectConvexSnapshot({
    bytes: input.sourceBytes,
    snapshotId: input.sourceSnapshotId,
    expectedWebsiteKey: input.sourceIdentity.websiteKey,
    expectedInstanceKey: input.sourceIdentity.instanceKey,
    expectedEnvironmentKind: input.sourceIdentity.environmentKind,
    createdByControllerId: "controller_convexpress_standalone",
  });
  await inspectConvexSnapshot({
    bytes: input.targetPreBackupBytes,
    snapshotId: input.targetPreBackupSnapshotId,
    expectedWebsiteKey: input.targetIdentity.websiteKey,
    expectedInstanceKey: input.targetIdentity.instanceKey,
    expectedEnvironmentKind: input.targetIdentity.environmentKind,
    createdByControllerId: "controller_convexpress_standalone",
  });

  const [sourceEntries, targetEntries] = await Promise.all([
    readAllEntries(input.sourceBytes),
    readAllEntries(input.targetPreBackupBytes),
  ]);
  for (const table of MANAGEMENT_TABLES_PRESERVED_ON_IMPORT) {
    const documentsPath = `${table}/documents.jsonl`;
    const schemaPath = `${table}/generated_schema.jsonl`;
    if (!Object.prototype.hasOwnProperty.call(targetEntries, documentsPath)) {
      throw new Error(`Target pre-backup is missing preserved table ${table}`);
    }
    sourceEntries[documentsPath] = targetEntries[documentsPath]!;
    if (Object.prototype.hasOwnProperty.call(targetEntries, schemaPath)) {
      sourceEntries[schemaPath] = targetEntries[schemaPath]!;
    }
  }
  resetTargetManagementSessions(sourceEntries);
  const bytes = zipSync(sourceEntries, { level: 6 });
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Prepared snapshot archive size is invalid");
  }
  await inspectConvexSnapshot({
    bytes,
    snapshotId: "snapshot-prepared-for-target",
    expectedWebsiteKey: input.targetIdentity.websiteKey,
    expectedInstanceKey: input.targetIdentity.instanceKey,
    expectedEnvironmentKind: input.targetIdentity.environmentKind,
    createdByControllerId: "controller_convexpress_standalone",
  });
  return {
    bytes,
    checksumSha256: sha256(bytes),
    preservedTables: [...MANAGEMENT_TABLES_PRESERVED_ON_IMPORT],
  };
}
