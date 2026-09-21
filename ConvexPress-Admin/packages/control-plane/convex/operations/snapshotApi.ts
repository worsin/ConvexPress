"use node";

import { deploymentOriginSchema } from "@convexpress/site-contract";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { boundedResponseStream, MAX_STREAMED_SNAPSHOT_BYTES } from "./snapshotStreams";
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

export type SnapshotExportState =
  | { state: "requested" }
  | { state: "in_progress" }
  | { state: "failed" }
  | {
      state: "completed";
      start_ts: bigint | number | string;
      complete_ts: bigint | number | string;
      zip_object_key: string;
    };

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function authorizedHeaders(deploymentAdminKey: string): Headers {
  return new Headers({
    Authorization: `Convex ${deploymentAdminKey}`,
    "Content-Type": "application/json",
    "Convex-Client": "convexpress-lifecycle-v1",
  });
}

async function boundedFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function defaultLatestReader(
  deploymentOrigin: string,
  deploymentAdminKey: string,
): () => Promise<SnapshotExportState> {
  const client = new ConvexHttpClient(deploymentOrigin);
  (
    client as ConvexHttpClient & { setAdminAuth: (token: string) => void }
  ).setAdminAuth(deploymentAdminKey);
  const reference = makeFunctionReference<
    "query",
    Record<string, never>,
    SnapshotExportState
  >("_system/cli/exports:getLatest");
  return async () => await client.query(reference, {});
}

function timestamp(value: bigint | number | string): string {
  const serialized = String(value);
  if (!/^\d{1,30}$/.test(serialized)) {
    throw new Error("Snapshot export returned an invalid timestamp");
  }
  return serialized;
}

export async function exportConvexSnapshotStream(input: {
  deploymentOrigin: string;
  deploymentAdminKey: string;
  includeStorage: boolean;
  fetchImpl?: typeof fetch;
  readLatest?: () => Promise<SnapshotExportState>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}): Promise<{ stream: AsyncIterable<Uint8Array>; exportTimestamp: string }> {
  const deploymentOrigin = deploymentOriginSchema.parse(input.deploymentOrigin);
  if (
    input.deploymentAdminKey.length < 16 ||
    input.deploymentAdminKey.length > 16_384
  ) {
    throw new Error("Snapshot export credentials are invalid");
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = authorizedHeaders(input.deploymentAdminKey);

  let requested: Response;
  try {
    requested = await boundedFetch(
      fetchImpl,
      `${deploymentOrigin}/api/export/request/zip?includeStorage=${input.includeStorage}`,
      { method: "POST", headers },
    );
  } catch {
    throw new Error("Snapshot export request failed safely");
  }
  if (!requested.ok) {
    throw new Error("Snapshot export request failed safely");
  }

  const readLatest =
    input.readLatest ??
    defaultLatestReader(deploymentOrigin, input.deploymentAdminKey);
  const pollIntervalMs = input.pollIntervalMs ?? 500;
  const maxPollAttempts = input.maxPollAttempts ?? 600;
  let completed: Extract<SnapshotExportState, { state: "completed" }> | null =
    null;
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    let state: SnapshotExportState;
    try {
      state = await readLatest();
    } catch {
      throw new Error("Snapshot export status could not be verified");
    }
    if (state.state === "failed") {
      throw new Error("Snapshot export failed safely");
    }
    if (state.state === "completed") {
      completed = state;
      break;
    }
    if (pollIntervalMs > 0) await sleep(pollIntervalMs);
  }
  if (!completed) {
    throw new Error("Snapshot export did not complete within the safe wait window");
  }

  const exportTimestamp = timestamp(completed.start_ts);
  let response: Response;
  try {
    response = await boundedFetch(
      fetchImpl,
      `${deploymentOrigin}/api/export/zip/${exportTimestamp}`,
      { method: "GET", headers },
    );
  } catch {
    throw new Error("Snapshot export download failed safely");
  }
  if (!response.ok) {
    throw new Error("Snapshot export download failed safely");
  }
  const declared = response.headers.get("content-length");
  const declaredSize = declared === null ? undefined : Number(declared);
  if (declaredSize !== undefined && (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > MAX_STREAMED_SNAPSHOT_BYTES)) {
    void response.body?.cancel();
    throw new Error("Snapshot export is too large for this controller or has an invalid size");
  }
  if (!response.body) throw new Error("Snapshot export download is empty");
  return { stream: boundedResponseStream(response.body, { expectedBytes: declaredSize }), exportTimestamp };
}

/** Compatibility adapter for small callers; lifecycle actions use the stream. */
export async function exportConvexSnapshot(input: Parameters<typeof exportConvexSnapshotStream>[0]): Promise<{ bytes: Uint8Array; exportTimestamp: string }> {
  const exported = await exportConvexSnapshotStream(input);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of exported.stream) {
    size += chunk.length;
    if (size > MAX_DOWNLOAD_BYTES) throw new Error("Snapshot export is too large for the legacy byte interface");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return { bytes, exportTimestamp: exported.exportTimestamp };
}
