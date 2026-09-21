"use node";

import { randomUUID } from "node:crypto";
import { deploymentOriginSchema } from "@convexpress/site-contract";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  MEDIA_INDEX_EPOCH_NAME,
  parsePendingEpoch,
  transitionMediaEpoch,
  type EpochTransition,
  type EpochReply,
} from "@convexpress/site-contract/media-index-epoch";

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
import { snapshotParts, MAX_STREAMED_SNAPSHOT_BYTES } from "./snapshotStreams";
const MAX_IMPORT_BYTES = MAX_STREAMED_SNAPSHOT_BYTES;
const MAX_PARTS = 9_999;
const REQUEST_TIMEOUT_MS = 30_000;

export type SnapshotImportState =
  | { state: "uploaded" }
  | {
      state: "waiting_for_confirmation";
      message_to_confirm?: string;
      require_manual_confirmation?: boolean;
    }
  | {
      state: "in_progress";
      progress_message?: string;
      checkpoint_messages?: string[];
    }
  | { state: "completed"; num_rows_written: bigint | number }
  | { state: "failed"; error_message?: string };

type ExistingImport = { _id?: string; state?: { state?: string } };

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

function defaultClient(deploymentOrigin: string, deploymentAdminKey: string) {
  const client = new ConvexHttpClient(deploymentOrigin);
  (client as ConvexHttpClient & { setAdminAuth: (token: string) => void }).setAdminAuth(
    deploymentAdminKey,
  );
  return client;
}

function validateCredential(value: string) {
  if (value.length < 16 || value.length > 16_384) {
    throw new Error("Snapshot import credentials are invalid");
  }
}

async function responseJson(response: Response, failureMessage: string) {
  if (!response.ok) throw new Error(failureMessage);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error(failureMessage);
  }
}

export async function importConvexSnapshot(input: {
  deploymentOrigin: string;
  deploymentAdminKey: string;
  bytes?: Uint8Array;
  stream?: AsyncIterable<Uint8Array>;
  approvedReplaceAll: boolean;
  /** Stable identity of the reviewed source and target pre-backup, never a retry nonce. */
  importKey: string;
  readCompletedImport?: () => Promise<{
    importId: string;
    pendingEpoch: string;
    activeEpoch: string;
    verified: boolean;
  } | null>;
  coordinateEpoch?: (
    phase: "prepare" | "dispatch" | "verify",
    transition: EpochTransition,
  ) => Promise<EpochReply>;
  fetchImpl?: typeof fetch;
  listImports?: () => Promise<ExistingImport[]>;
  readImportState?: (importId: string) => Promise<SnapshotImportState>;
  readMediaReferenceEpoch?: () => Promise<{ name: string; value: string } | null>;
  chunkSizeBytes?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}): Promise<{ importId: string; rowsWritten: number; recovered: boolean }> {
  if (!input.approvedReplaceAll) {
    throw new Error("Snapshot replacement is not approved");
  }
  const deploymentOrigin = deploymentOriginSchema.parse(input.deploymentOrigin);
  validateCredential(input.deploymentAdminKey);
  if (
    (!input.bytes && !input.stream) ||
    (input.bytes && input.stream) ||
    (input.bytes && (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_IMPORT_BYTES))
  ) {
    throw new Error("Snapshot import size is invalid");
  }

  if (!/^[a-f0-9]{24}$/.test(input.importKey)) throw Error("Snapshot import identity is invalid");
  const client = defaultClient(deploymentOrigin, input.deploymentAdminKey);
  const listImports =
    input.listImports ??
    (async () =>
      await client.query(
        makeFunctionReference<"query", Record<string, never>, ExistingImport[]>(
          "_system/cli/queryImport:list",
        ),
        {},
      ));
  let existing: ExistingImport[];
  try {
    existing = await listImports();
  } catch {
    throw new Error("Snapshot import status could not be verified");
  }

  const chunkSize = input.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 16 * 1024 * 1024) {
    throw new Error("Snapshot import chunk size is invalid");
  }
  const partCount = input.bytes ? Math.ceil(input.bytes.byteLength / chunkSize) : 0;
  if (partCount > MAX_PARTS) {
    throw new Error("Snapshot import has too many upload parts");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = authorizedHeaders(input.deploymentAdminKey);
  const readEpoch =
    input.readMediaReferenceEpoch ??
    (() =>
      client.query(
        makeFunctionReference<"query", { name: string }, { name: string; value: string } | null>(
          "_system/cli/queryEnvironmentVariables:get",
        ),
        { name: MEDIA_INDEX_EPOCH_NAME },
      ));
  const coordinate =
    input.coordinateEpoch ??
    ((phase, transition) =>
      client.mutation(
        makeFunctionReference<
          "mutation",
          EpochTransition & { phase: "prepare" | "dispatch" | "verify" },
          EpochReply
        >("media/epochAuthority:coordinate"),
        { ...transition, phase },
      ));
  const epochIO = {
    coordinate,
    write: async (value: string) => {
      const response = await boundedFetch(
        fetchImpl,
        `${deploymentOrigin}/api/update_environment_variables`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ changes: [{ name: MEDIA_INDEX_EPOCH_NAME, value }] }),
        },
      );
      if (!response.ok) throw Error("Epoch update failed");
    },
  };
  const epochRecord = await readEpoch();
  if (epochRecord && epochRecord.name !== MEDIA_INDEX_EPOCH_NAME)
    throw Error("Snapshot import reference invalidation could not be verified");
  const previousEpoch = epochRecord?.value ?? null;
  const completed = await (
    input.readCompletedImport ??
    (() =>
      client.query(
        makeFunctionReference<
          "query",
          { importKey: string },
          { importId: string; pendingEpoch: string; activeEpoch: string; verified: boolean } | null
        >("media/epochAuthority:completedImport"),
        { importKey: input.importKey },
      ))
  )();
  const previousPending = parsePendingEpoch(previousEpoch);
  if (previousPending && previousPending.key !== input.importKey)
    throw Error("Another snapshot import requires reconciliation before replacement");
  if (previousPending && !previousPending.importId)
    throw Error(
      "Snapshot import has an unresolved upload identity; do not reupload or rotate its epoch",
    );
  const recoveredId = completed?.importId ?? previousPending?.importId ?? null;
  if (existing.some((entry) => entry.state?.state === "in_progress" && entry._id !== recoveredId))
    throw Error("Another snapshot import is already in progress");
  let pendingEpoch = completed?.pendingEpoch ?? previousEpoch!;
  if (!recoveredId) {
    try {
      pendingEpoch = await transitionMediaEpoch(epochIO, {
        kind: "import",
        requestId: `import:${input.importKey}`,
        expected: previousEpoch,
        next: `mi_pending_${input.importKey}_${randomUUID().replace(/-/g, "")}`,
      });
      const persisted = await readEpoch();
      if (persisted?.name !== MEDIA_INDEX_EPOCH_NAME || persisted.value !== pendingEpoch)
        throw Error("epoch readback mismatch");
    } catch {
      throw Error("Snapshot import reference invalidation could not be verified");
    }
  }
  let importId = recoveredId ?? "";
  if (!recoveredId) {
    let uploadToken: string;
    try {
      const response = await boundedFetch(
        fetchImpl,
        `${deploymentOrigin}/api/import/start_upload`,
        { method: "POST", headers },
      );
      const body = await responseJson(response, "Snapshot import request failed safely");
      uploadToken =
        body &&
        typeof body === "object" &&
        typeof (body as { uploadToken?: unknown }).uploadToken === "string"
          ? (body as { uploadToken: string }).uploadToken
          : "";
      if (!uploadToken) throw new Error("invalid");
    } catch {
      throw new Error("Snapshot import request failed safely");
    }

    const partTokens: unknown[] = [];
    try {
      const source =
        input.stream ??
        (async function* () {
          yield input.bytes!;
        })();
      let partNumber = 0;
      for await (const chunk of snapshotParts(source, chunkSize)) {
        partNumber++;
        if (partNumber > MAX_PARTS) throw new Error("Snapshot import has too many upload parts");
        const body = new Uint8Array(chunk).buffer;
        const response = await boundedFetch(
          fetchImpl,
          `${deploymentOrigin}/api/import/upload_part?uploadToken=${encodeURIComponent(uploadToken)}&partNumber=${partNumber}`,
          {
            method: "POST",
            headers: new Headers({
              Authorization: `Convex ${input.deploymentAdminKey}`,
              "Content-Type": "application/octet-stream",
              "Convex-Client": "convexpress-lifecycle-v1",
            }),
            body,
          },
        );
        partTokens.push(await responseJson(response, "Snapshot import upload failed safely"));
      }
    } catch {
      throw new Error("Snapshot import upload failed safely");
    }

    try {
      const response = await boundedFetch(
        fetchImpl,
        `${deploymentOrigin}/api/import/finish_upload`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            import: { mode: "replaceAll", format: "zip" },
            uploadToken,
            partTokens,
          }),
        },
      );
      const body = await responseJson(response, "Snapshot import upload failed safely");
      importId =
        body &&
        typeof body === "object" &&
        typeof (body as { importId?: unknown }).importId === "string"
          ? (body as { importId: string }).importId
          : "";
      if (!importId) throw new Error("invalid");
    } catch {
      throw new Error("Snapshot import upload failed safely");
    }

    // Persist known identity outside replaceAll BEFORE perform_import. If finish_upload
    // loses its response, the pending unknown-ID marker remains a hard no-reupload fence.
    pendingEpoch = await transitionMediaEpoch(epochIO, {
      kind: "bind-import",
      requestId: `bind:${input.importKey}:${importId}`,
      expected: pendingEpoch,
      next: `${pendingEpoch}_${importId}`,
    });
  }

  const readImportState =
    input.readImportState ??
    (async (id: string) => {
      const value = await client.query(
        makeFunctionReference<"query", { importId: string }, { state: SnapshotImportState }>(
          "_system/cli/queryImport",
        ),
        { importId: id },
      );
      return value.state;
    });
  const pollIntervalMs = input.pollIntervalMs ?? 500;
  const maxPollAttempts = input.maxPollAttempts ?? 1_200;
  let confirmed = false;
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    let state: SnapshotImportState;
    try {
      state = await readImportState(importId);
    } catch {
      throw new Error("Snapshot import status could not be verified");
    }
    if (state.state === "failed") {
      throw new Error("Snapshot import failed safely");
    }
    if (state.state === "completed") {
      const rowsWritten = Number(state.num_rows_written);
      if (!Number.isSafeInteger(rowsWritten) || rowsWritten < 0) {
        throw new Error("Snapshot import completion was invalid");
      }
      const pending = parsePendingEpoch(pendingEpoch);
      if (!pending || pending.importId !== importId || pending.key !== input.importKey)
        throw Error("Snapshot completion identity changed");
      if (!completed?.verified)
        await transitionMediaEpoch(epochIO, {
          kind: "activate",
          requestId: `activate:${input.importKey}:${importId}`,
          expected: pendingEpoch,
          next: `mi_ready_${pending.nonce}`,
        });
      return { importId, rowsWritten, recovered: !!recoveredId };
    }
    if (state.state === "waiting_for_confirmation" && !confirmed) {
      if (recoveredId && !completed) {
        const pending = parsePendingEpoch(pendingEpoch)!;
        await transitionMediaEpoch(epochIO, {
          kind: "bind-import",
          requestId: `bind:${input.importKey}:${importId}`,
          expected: `mi_pending_${pending.key}_${pending.nonce}`,
          next: pendingEpoch,
        });
      }
      try {
        const response = await boundedFetch(fetchImpl, `${deploymentOrigin}/api/perform_import`, {
          method: "POST",
          headers,
          body: JSON.stringify({ importId }),
        });
        if (!response.ok) throw new Error("invalid");
        confirmed = true;
      } catch {
        throw new Error("Snapshot import confirmation failed safely");
      }
    }
    if (pollIntervalMs > 0) await sleep(pollIntervalMs);
  }
  throw new Error("Snapshot import did not complete within the safe wait window");
}
