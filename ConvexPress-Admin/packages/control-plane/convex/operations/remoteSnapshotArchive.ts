"use node";

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  assertSecretFree,
  backupManifestSchema,
  siteIdentitySchema,
  type BackupManifest,
  type EnvironmentKind,
} from "@convexpress/site-contract";
import { Zip, ZipPassThrough, ZipDeflate, type ZipInputFile } from "fflate";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { boundedResponseStream } from "./snapshotStreams";
import { MANAGEMENT_TABLES_PRESERVED_ON_IMPORT } from "./snapshotRestoreArchive";
import { DERIVED_EMPTY_ON_MISSING_SOURCE, derivedSnapshotTable, resetDerivedSnapshotStream, convexSnapshotJson, snapshotScope } from "./snapshotDerivedState";

const MAX_ARCHIVE = 3 * 1024 ** 3;
const MAX_ENTRIES = 20_000;
const BLOCK = 1024 ** 2;
const MAX_METADATA = 8 * BLOCK;
const MAX_LINE = BLOCK;
const MAX_EXPANDED = 16 * 1024 ** 3;
type Fetch = typeof fetch;
type Identity = { websiteKey: string; instanceKey: string; environmentKind: EnvironmentKind };
type Artifact = {
  immutableStorage?: boolean;
  url: string;
  checksumSha256: string;
  snapshotId: string;
  identity: Identity;
};
type RemoteInput = { immutableStorage?: boolean; url: string; fetchImpl?: Fetch };
type InspectionInput = RemoteInput & {
  snapshotId: string;
  expectedWebsiteKey: string;
  expectedInstanceKey: string;
  expectedEnvironmentKind: EnvironmentKind;
  createdByControllerId: string;
  createdAt?: Date;
  expectedChecksumSha256?: string;
};

function safePath(name: string): void {
  if (
    !name ||
    name.length > 512 ||
    /[\\\x00-\x1f]/.test(name) ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error("Snapshot contains an unsafe archive path");
}
async function request(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function* bodyChunks(response: Response, expected: number): AsyncGenerator<Uint8Array> {
  if (!response.body) throw new Error("Snapshot response has no body");
  yield* boundedResponseStream(response.body, { maximumBytes: expected, expectedBytes: expected });
}

/** Immutable, bounded HTTP ranges; no filesystem or complete archive allocation. */
class RemoteReader extends yauzl.RandomAccessReader {
  private cache = new Map<number, Uint8Array>();
  constructor(
    readonly url: string,
    readonly size: number,
    readonly etag: string | null,
    readonly fetchImpl: Fetch,
    readonly digest: string | null,
  ) {
    super();
  }
  static async open(input: RemoteInput): Promise<RemoteReader> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const response = await request(fetchImpl, input.url, {
      headers: { Range: "bytes=0-0", "Accept-Encoding": "identity" },
    });
    const match = /^bytes 0-0\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
    const size = Number(match?.[1]);
    if (
      response.status !== 206 ||
      !match ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > MAX_ARCHIVE
    ) {
      await response.body?.cancel();
      throw new Error("Snapshot server must support valid bounded HTTP ranges (maximum 3 GiB)");
    }
    for await (const _ of bodyChunks(response, 1)) {
      /* validate the probe body */
    }
    const etag = response.headers.get("etag");
    const strongEtag = etag && !etag.startsWith("W/") ? etag : null;
    if (!strongEtag && !input.immutableStorage)
      throw new Error("Snapshot requires a strong ETag or verified immutable storage ID");
    const digestMatch = /(?:^|,)\s*sha-256=([^,\s]+)/i.exec(response.headers.get("digest") ?? "");
    const digest = digestMatch ? Buffer.from(digestMatch[1]!, "base64").toString("hex") : null;
    if (digest && !/^[a-f0-9]{64}$/.test(digest))
      throw new Error("Snapshot Digest header is invalid");
    return new RemoteReader(input.url, size, strongEtag, fetchImpl, digest);
  }
  private validate(response: Response): void {
    if (this.etag && response.headers.get("etag") !== this.etag)
      throw new Error("Snapshot changed while it was being read");
    if (
      response.headers.get("content-encoding") &&
      response.headers.get("content-encoding") !== "identity"
    )
      throw new Error("Snapshot response must not use transport compression");
  }
  async hash(): Promise<string> {
    const response = await request(this.fetchImpl, this.url, {
      headers: { "Accept-Encoding": "identity", ...(this.etag ? { "If-Match": this.etag } : {}) },
    });
    try {
      this.validate(response);
      if (response.status !== 200) throw new Error("Snapshot download failed");
      const hash = createHash("sha256");
      for await (const chunk of bodyChunks(response, this.size)) hash.update(chunk);
      const checksum = hash.digest("hex");
      if (this.digest && this.digest !== checksum)
        throw new Error("Snapshot Digest checksum is invalid");
      const header = /(?:^|,)\s*sha-256=([^,\s]+)/i.exec(response.headers.get("digest") ?? "");
      if (header && Buffer.from(header[1]!, "base64").toString("hex") !== checksum)
        throw new Error("Snapshot Digest checksum is invalid");
      return checksum;
    } catch (error) {
      await response.body?.cancel().catch(() => {});
      throw error;
    }
  }
  private async block(start: number): Promise<Uint8Array> {
    const cached = this.cache.get(start);
    if (cached) {
      this.cache.delete(start);
      this.cache.set(start, cached);
      return cached;
    }
    const end = Math.min(this.size, start + BLOCK) - 1;
    const response = await request(this.fetchImpl, this.url, {
      headers: {
        Range: `bytes=${start}-${end}`,
        "Accept-Encoding": "identity",
        ...(this.etag ? { "If-Match": this.etag } : {}),
      },
    });
    try {
      this.validate(response);
      if (
        response.status !== 206 ||
        response.headers.get("content-range") !== `bytes ${start}-${end}/${this.size}`
      )
        throw new Error("Snapshot HTTP range response is invalid");
      const bytes = new Uint8Array(end - start + 1);
      let offset = 0;
      for await (const chunk of bodyChunks(response, bytes.length)) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      this.cache.set(start, bytes);
      while (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
      return bytes;
    } catch (error) {
      await response.body?.cancel().catch(() => {});
      throw error;
    }
  }
  _readStreamForRange(start: number, end: number): Readable {
    const reader = this;
    return Readable.from(
      (async function* () {
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          end > reader.size ||
          start >= end
        )
          throw new Error("Invalid snapshot byte range");
        for (let position = start; position < end; ) {
          const aligned = Math.floor(position / BLOCK) * BLOCK;
          const block = await reader.block(aligned);
          const take = Math.min(end - position, block.length - (position - aligned));
          yield block.subarray(position - aligned, position - aligned + take);
          position += take;
        }
      })(),
      { objectMode: false, highWaterMark: 64 * 1024 },
    );
  }
}

async function directory(
  reader: RemoteReader,
): Promise<{ zip: ZipFile; entries: Map<string, Entry> }> {
  const zip = await new Promise<ZipFile>((resolve, reject) =>
    yauzl.fromRandomAccessReader(
      reader,
      reader.size,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true },
      (error, file) =>
        error || !file ? reject(new Error("Snapshot archive is invalid")) : resolve(file),
    ),
  );
  try {
    const entries = await new Promise<Map<string, Entry>>((resolve, reject) => {
      const entries = new Map<string, Entry>();
      let expanded = 0;
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry: Entry) => {
        try {
          safePath(entry.fileName);
          if (entries.has(entry.fileName))
            throw new Error("Snapshot archive contains duplicate paths");
          if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod))
            throw new Error("Snapshot uses unsupported encryption or compression");
          expanded += entry.uncompressedSize;
          if (
            entries.size >= MAX_ENTRIES ||
            !Number.isSafeInteger(entry.uncompressedSize) ||
            entry.uncompressedSize > MAX_ARCHIVE ||
            expanded > MAX_EXPANDED ||
            entry.compressedSize > reader.size ||
            entry.relativeOffsetOfLocalHeader >= reader.size
          )
            throw new Error("Snapshot archive exceeds safe entry limits");
          entries.set(entry.fileName, entry);
          zip.readEntry();
        } catch (error) {
          reject(error);
          zip.close();
        }
      });
      zip.readEntry();
    });
    return { zip, entries };
  } catch (error) {
    zip.close();
    throw error;
  }
}
function openEntry(zip: ZipFile, entry: Entry, raw = false): Promise<Readable> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(
      entry,
      {
        decompress: raw && entry.compressionMethod === 8 ? false : null,
        decrypt: null,
        start: null,
        end: null,
      },
      (error, stream) =>
        error || !stream
          ? reject(new Error("Snapshot archive entry could not be read"))
          : resolve(stream),
    ),
  );
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crcUpdate(crc: number, bytes: Uint8Array): number {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return crc;
}
async function* entryChunks(zip: ZipFile, entry: Entry): AsyncGenerator<Uint8Array> {
  const stream = await openEntry(zip, entry);
  let crc = 0xffffffff;
  try {
    for await (const chunk of stream) {
      const bytes = chunk as Uint8Array;
      crc = crcUpdate(crc, bytes);
      yield bytes;
    }
    if ((crc ^ 0xffffffff) >>> 0 !== entry.crc32)
      throw new Error("Snapshot entry checksum is invalid");
  } finally {
    stream.destroy();
  }
}
async function metadata(
  zip: ZipFile,
  entries: Map<string, Entry>,
  name: string,
): Promise<Uint8Array> {
  const entry = entries.get(name);
  if (!entry) throw new Error(`Snapshot is missing required metadata ${name}`);
  if (
    entry.uncompressedSize >
    (name === "convexpress_siteIdentity/documents.jsonl" ? 64 * 1024 : MAX_METADATA)
  )
    throw new Error("Snapshot management metadata is too large");
  const bytes = new Uint8Array(entry.uncompressedSize);
  let offset = 0;
  for await (const chunk of entryChunks(zip, entry)) {
    if (offset + chunk.length > bytes.length) throw new Error("Snapshot metadata size is invalid");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function rows(bytes: Uint8Array, label: string): Record<string, unknown>[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const result: Record<string, unknown>[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(start, end).trim();
    start = end + 1;
    if (!line) continue;
    if (line.length > MAX_LINE || result.length >= MAX_ENTRIES)
      throw new Error(`${label} exceeds metadata row limits`);
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`${label} contains invalid JSON lines`);
    result.push(value as Record<string, unknown>);
  }
  return result;
}
async function countStorage(zip: ZipFile, entry: Entry): Promise<number> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let count = 0;
  const consume = (line: string) => {
    if (!line.trim()) return;
    if (line.length > MAX_LINE) throw new Error("Snapshot storage inventory line is too large");
    JSON.parse(line);
    count++;
  };
  for await (const chunk of entryChunks(zip, entry)) {
    pending += decoder.decode(chunk, { stream: true });
    let boundary: number;
    while ((boundary = pending.indexOf("\n")) !== -1) {
      consume(pending.slice(0, boundary));
      pending = pending.slice(boundary + 1);
    }
    if (pending.length > MAX_LINE) throw new Error("Snapshot storage inventory line is too large");
  }
  pending += decoder.decode();
  consume(pending);
  return count;
}
async function inspect(
  reader: RemoteReader,
  dir: Awaited<ReturnType<typeof directory>>,
  input: InspectionInput,
  checksumSha256: string,
) {
  const { zip, entries } = dir;
  for (const name of ["README.md", "_tables/documents.jsonl", "_storage/documents.jsonl"])
    if (!entries.has(name)) throw new Error("Snapshot is missing required database inventory");
  const tableNames = [...entries.keys()]
    .filter((name) => /^[^_/][^/]*\/documents\.jsonl$/.test(name))
    .map((name) => name.slice(0, -"/documents.jsonl".length))
    .sort();
  if (!tableNames.length) throw new Error("Snapshot contains no application tables");
  for (const table of tableNames)
    if (!entries.has(`${table}/generated_schema.jsonl`))
      throw new Error(`Snapshot table ${table} is missing its schema`);
  const identities = rows(
    await metadata(zip, entries, "convexpress_siteIdentity/documents.jsonl"),
    "Snapshot identity",
  );
  if (identities.length !== 1) throw new Error("Snapshot must contain exactly one site identity");
  const row = identities[0]!;
  const identity = siteIdentitySchema.parse({
    websiteKey: row.websiteKey,
    instanceKey: row.instanceKey,
    environmentKind: row.environmentKind,
    deploymentOrigin: row.deploymentOrigin,
    managementOrigin: row.managementOrigin,
    siteOrigin: row.siteOrigin,
    siteContractVersion: row.siteContractVersion,
    schemaVersion: row.schemaVersion,
    engineVersion: row.engineVersion,
    managementCapabilities: row.managementCapabilities,
  });
  if (
    identity.websiteKey !== input.expectedWebsiteKey ||
    identity.instanceKey !== input.expectedInstanceKey ||
    identity.environmentKind !== input.expectedEnvironmentKind
  )
    throw new Error("Snapshot site identity does not match its target");
  const storageObjectCount = await countStorage(zip, entries.get("_storage/documents.jsonl")!);
  const manifest = backupManifestSchema.parse({
    snapshotId: input.snapshotId,
    websiteKey: identity.websiteKey,
    instanceKey: identity.instanceKey,
    environmentKind: identity.environmentKind,
    siteContractVersion: identity.siteContractVersion,
    schemaVersion: identity.schemaVersion,
    engineVersion: identity.engineVersion,
    checksumSha256,
    sizeBytes: reader.size,
    tableCount: tableNames.length,
    storageObjectCount,
    createdByControllerId: input.createdByControllerId,
    verificationStatus: "verified",
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  }) as BackupManifest & { verificationStatus: "verified" };
  assertSecretFree(manifest, "$backupManifest");
  return { manifest, tableNames };
}
function verify(actual: string, expected?: string) {
  if (expected !== undefined && actual !== expected)
    throw new Error("Snapshot checksum does not match its manifest");
}
export async function verifyRemoteSnapshotChecksum(
  input: RemoteInput & { expectedChecksumSha256: string },
): Promise<void> {
  const reader = await RemoteReader.open(input);
  verify(await reader.hash(), input.expectedChecksumSha256);
}
export async function inspectRemoteConvexSnapshot(input: InspectionInput): Promise<{
  manifest: BackupManifest & { verificationStatus: "verified" };
  tableNames: string[];
}> {
  const reader = await RemoteReader.open(input);
  const checksum = await reader.hash();
  verify(checksum, input.expectedChecksumSha256);
  const dir = await directory(reader);
  try {
    return await inspect(reader, dir, input, checksum);
  } finally {
    dir.zip.close();
  }
}
function inspectionInput(artifact: Artifact, fetchImpl?: Fetch): InspectionInput {
  return {
    url: artifact.url,
    immutableStorage: artifact.immutableStorage,
    snapshotId: artifact.snapshotId,
    expectedWebsiteKey: artifact.identity.websiteKey,
    expectedInstanceKey: artifact.identity.instanceKey,
    expectedEnvironmentKind: artifact.identity.environmentKind,
    createdByControllerId: "controller_convexpress_standalone",
    expectedChecksumSha256: artifact.checksumSha256,
    fetchImpl,
  };
}
function convexJson(value: unknown): string {
  return convexSnapshotJson(value);
}
function resetBindings(authorityBytes: Uint8Array, bindingBytes: Uint8Array): Uint8Array {
  const authorities = new Map(
    rows(authorityBytes, "Target authorities").map((authority) => [
      String(authority._id),
      authority,
    ]),
  );
  const bindings = rows(bindingBytes, "Target bindings").map((binding) => {
    const authority = authorities.get(String(binding.authorityId));
    if (
      !authority ||
      typeof authority.controllerId !== "string" ||
      typeof authority.keyId !== "string" ||
      binding.controllerId !== authority.controllerId
    )
      throw new Error("Target management binding authority is invalid");
    const rebound = { ...binding };
    delete rebound.userId;
    rebound.syntheticOperatorId = `controller:${authority.controllerId}:${authority.keyId}`;
    return rebound;
  });
  const bytes = new TextEncoder().encode(
    bindings.length ? `${bindings.map(convexJson).join("\n")}\n` : "",
  );
  if (bytes.length > MAX_METADATA)
    throw new Error("Rebound target management metadata is too large");
  return bytes;
}

export async function prepareRemoteTargetBoundSnapshot(input: {
  source: Artifact;
  targetPreBackup: Artifact;
  fetchImpl?: Fetch;
}): Promise<{ stream: AsyncIterable<Uint8Array>; preservedTables: readonly string[] }> {
  const sourceReader = await RemoteReader.open({
    url: input.source.url,
    immutableStorage: input.source.immutableStorage,
    fetchImpl: input.fetchImpl,
  });
  const targetReader = await RemoteReader.open({
    url: input.targetPreBackup.url,
    immutableStorage: input.targetPreBackup.immutableStorage,
    fetchImpl: input.fetchImpl,
  });
  verify(await sourceReader.hash(), input.source.checksumSha256);
  verify(await targetReader.hash(), input.targetPreBackup.checksumSha256);
  const source = await directory(sourceReader);
  let target: Awaited<ReturnType<typeof directory>> | undefined;
  try {
    target = await directory(targetReader);
    await inspect(
      sourceReader,
      source,
      inspectionInput(input.source, input.fetchImpl),
      input.source.checksumSha256,
    );
    await inspect(
      targetReader,
      target,
      inspectionInput(input.targetPreBackup, input.fetchImpl),
      input.targetPreBackup.checksumSha256,
    );
    const identityPath = "convexpress_siteIdentity/documents.jsonl";
    const rebinding = {
      source: snapshotScope(rows(await metadata(source.zip, source.entries, identityPath), "Source identity")[0]!),
      target: snapshotScope(rows(await metadata(target.zip, target.entries, identityPath), "Target identity")[0]!),
    };
    const replacements = new Map<string, { zip: ZipFile; entry: Entry } | Uint8Array>();
    let managementBytes = 0;
    for (const table of MANAGEMENT_TABLES_PRESERVED_ON_IMPORT)
      for (const suffix of ["documents.jsonl", "generated_schema.jsonl"]) {
        const name = `${table}/${suffix}`;
        const entry = target.entries.get(name);
        if (!entry) throw new Error(`Target pre-backup is missing preserved table ${table}`);
        managementBytes += entry.uncompressedSize;
        if (managementBytes > MAX_METADATA)
          throw new Error("Target management metadata is too large");
        replacements.set(name, { zip: target.zip, entry });
      }
    replacements.set(
      "convexpress_managementBindings/documents.jsonl",
      resetBindings(
        await metadata(
          target.zip,
          target.entries,
          "convexpress_managementAuthorities/documents.jsonl",
        ),
        await metadata(
          target.zip,
          target.entries,
          "convexpress_managementBindings/documents.jsonl",
        ),
      ),
    );
    for (const table of ["convexpress_managementSessions", "convexpress_managementNonces", "media_epoch_claim"])
      replacements.set(`${table}/documents.jsonl`, new Uint8Array());
    for (const table of DERIVED_EMPTY_ON_MISSING_SOURCE) {
      const documents=`${table}/documents.jsonl`,schema=`${table}/generated_schema.jsonl`;
      if(!source.entries.has(documents)&&target.entries.has(documents)) {
        replacements.set(documents,new Uint8Array());
        const entry=target.entries.get(schema);if(entry)replacements.set(schema,{zip:target.zip,entry});
      }
    }
    const names = [...new Set([...source.entries.keys(), ...replacements.keys()])];
    if (names.length > MAX_ENTRIES) throw new Error("Prepared snapshot has too many entries");
    let maximumSize = 22;
    for (const name of names) {
      const replacement = replacements.get(name);
      maximumSize +=
        replacement instanceof Uint8Array
          ? replacement.length
          : (replacement?.entry ?? source.entries.get(name)!).compressedSize;
      maximumSize += 92 + 2 * new TextEncoder().encode(name).length;
    }
    if (maximumSize > MAX_ARCHIVE)
      throw new Error("Prepared snapshot exceeds the 3 GiB ZIP32 limit");
    const targetZip = target.zip;
    const stream = (async function* (): AsyncGenerator<Uint8Array> {
      const queue: Uint8Array[] = [];
      let zipError: Error | null = null;
      let size = 0;
      const zip = new Zip((error, chunk) => {
        if (error) zipError = error;
        else if (chunk?.length) queue.push(chunk);
      });
      function* drain() {
        if (zipError) throw zipError;
        while (queue.length) {
          const chunk = queue.shift()!;
          size += chunk.length;
          if (size > MAX_ARCHIVE)
            throw new Error("Prepared snapshot exceeds the 3 GiB ZIP32 limit");
          yield chunk;
        }
      }
      try {
        for (const name of names) {
          const replacement = replacements.get(name);
          if (replacement instanceof Uint8Array) {
            const file = new ZipPassThrough(name);
            zip.add(file);
            yield* drain();
            file.push(replacement, true);
            yield* drain();
            continue;
          }
          const origin = replacement ?? { zip: source.zip, entry: source.entries.get(name)! };
          const derivedTable = derivedSnapshotTable(name);
          if (derivedTable && !replacement) {
            const file = new ZipDeflate(name, { level: 1 });
            zip.add(file);
            yield* drain();
            for await (const chunk of resetDerivedSnapshotStream(derivedTable, entryChunks(origin.zip, origin.entry), rebinding)) {
              file.push(chunk, false);
              yield* drain();
            }
            file.push(new Uint8Array(), true);
            yield* drain();
            continue;
          }
          const file: ZipInputFile = {
            filename: name,
            size: origin.entry.uncompressedSize,
            crc: origin.entry.crc32,
            compression: origin.entry.compressionMethod,
          };
          zip.add(file);
          yield* drain();
          const raw = await openEntry(origin.zip, origin.entry, true);
          try {
            for await (const chunk of raw) {
              file.ondata!(null, chunk as Uint8Array, false);
              yield* drain();
            }
            file.ondata!(null, new Uint8Array(), true);
            yield* drain();
          } finally {
            raw.destroy();
          }
        }
        zip.end();
        yield* drain();
      } finally {
        zip.terminate();
        source.zip.close();
        targetZip.close();
      }
    })();
    return { stream, preservedTables: [...MANAGEMENT_TABLES_PRESERVED_ON_IMPORT] };
  } catch (error) {
    source.zip.close();
    target?.zip.close();
    throw error;
  }
}
