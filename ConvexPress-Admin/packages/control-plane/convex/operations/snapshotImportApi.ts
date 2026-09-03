"use node";

import { deploymentOriginSchema } from "@convexpress/site-contract";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_BYTES = 512 * 1024 * 1024;
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

type ExistingImport = { state?: { state?: string } };

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
  (
    client as ConvexHttpClient & { setAdminAuth: (token: string) => void }
  ).setAdminAuth(deploymentAdminKey);
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
  bytes: Uint8Array;
  approvedReplaceAll: boolean;
  fetchImpl?: typeof fetch;
  listImports?: () => Promise<ExistingImport[]>;
  readImportState?: (importId: string) => Promise<SnapshotImportState>;
  chunkSizeBytes?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}): Promise<{ importId: string; rowsWritten: number }> {
  if (!input.approvedReplaceAll) {
    throw new Error("Snapshot replacement is not approved");
  }
  const deploymentOrigin = deploymentOriginSchema.parse(input.deploymentOrigin);
  validateCredential(input.deploymentAdminKey);
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_IMPORT_BYTES
  ) {
    throw new Error("Snapshot import size is invalid");
  }

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
  if (existing.some((entry) => entry.state?.state === "in_progress")) {
    throw new Error("Another snapshot import is already in progress");
  }

  const chunkSize = input.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
    throw new Error("Snapshot import chunk size is invalid");
  }
  const partCount = Math.ceil(input.bytes.byteLength / chunkSize);
  if (partCount > MAX_PARTS) {
    throw new Error("Snapshot import has too many upload parts");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = authorizedHeaders(input.deploymentAdminKey);
  let uploadToken: string;
  try {
    const response = await boundedFetch(
      fetchImpl,
      `${deploymentOrigin}/api/import/start_upload`,
      { method: "POST", headers },
    );
    const body = await responseJson(
      response,
      "Snapshot import request failed safely",
    );
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
    for (let offset = 0, partNumber = 1; offset < input.bytes.byteLength; offset += chunkSize, partNumber += 1) {
      const chunk = input.bytes.slice(
        offset,
        Math.min(offset + chunkSize, input.bytes.byteLength),
      );
      const body = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength,
      );
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
      partTokens.push(
        await responseJson(response, "Snapshot import upload failed safely"),
      );
    }
  } catch {
    throw new Error("Snapshot import upload failed safely");
  }

  let importId: string;
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
    const body = await responseJson(
      response,
      "Snapshot import upload failed safely",
    );
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

  const readImportState =
    input.readImportState ??
    (async (id: string) => {
      const value = await client.query(
        makeFunctionReference<
          "query",
          { importId: string },
          { state: SnapshotImportState }
        >("_system/cli/queryImport"),
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
      return { importId, rowsWritten };
    }
    if (state.state === "waiting_for_confirmation" && !confirmed) {
      try {
        const response = await boundedFetch(
          fetchImpl,
          `${deploymentOrigin}/api/perform_import`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ importId }),
          },
        );
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
