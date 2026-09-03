import { describe, expect, test } from "bun:test";

import { importConvexSnapshot } from "../snapshotImportApi";

const ORIGIN = "http://127.0.0.1:4830";
const ADMIN_KEY = "local-admin-key-long-enough";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Convex snapshot import API", () => {
  test("uploads bounded chunks, confirms replacement, and waits for completion", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const states = [
      { state: "uploaded" as const },
      {
        state: "waiting_for_confirmation" as const,
        require_manual_confirmation: true,
      },
      { state: "in_progress" as const, progress_message: "Writing rows" },
      { state: "completed" as const, num_rows_written: 42n },
    ];
    const result = await importConvexSnapshot({
      deploymentOrigin: ORIGIN,
      deploymentAdminKey: ADMIN_KEY,
      bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
      approvedReplaceAll: true,
      chunkSizeBytes: 4,
      pollIntervalMs: 0,
      listImports: async () => [],
      readImportState: async () => states.shift()!,
      fetchImpl: async (url, init = {}) => {
        requests.push({ url: String(url), init });
        if (String(url).endsWith("/api/import/start_upload")) {
          return jsonResponse({ uploadToken: "upload_safe" });
        }
        if (String(url).includes("/api/import/upload_part")) {
          return jsonResponse({ partToken: `part_${requests.length}` });
        }
        if (String(url).endsWith("/api/import/finish_upload")) {
          return jsonResponse({ importId: "import_safe" });
        }
        if (String(url).endsWith("/api/perform_import")) {
          return jsonResponse({ ok: true });
        }
        return jsonResponse({}, 404);
      },
    });

    expect(result).toEqual({ importId: "import_safe", rowsWritten: 42 });
    const partRequests = requests.filter((request) =>
      request.url.includes("/api/import/upload_part"),
    );
    expect(partRequests).toHaveLength(2);
    expect(partRequests[0]!.url).toContain("partNumber=1");
    expect(partRequests[1]!.url).toContain("partNumber=2");
    const finish = requests.find((request) =>
      request.url.endsWith("/api/import/finish_upload"),
    );
    expect(JSON.parse(String(finish?.init.body))).toMatchObject({
      import: { mode: "replaceAll", format: "zip" },
      uploadToken: "upload_safe",
    });
    expect(
      requests.filter((request) => request.url.endsWith("/api/perform_import")),
    ).toHaveLength(1);
    expect(
      requests.every(
        (request) =>
          new Headers(request.init.headers).get("Authorization") ===
          `Convex ${ADMIN_KEY}`,
      ),
    ).toBe(true);
  });

  test("refuses replacement without an explicit approved control-plane gate", async () => {
    await expect(
      importConvexSnapshot({
        deploymentOrigin: ORIGIN,
        deploymentAdminKey: ADMIN_KEY,
        bytes: new Uint8Array([1]),
        approvedReplaceAll: false,
      }),
    ).rejects.toThrow("not approved");
  });

  test("refuses to race an import already running outside the operation lock", async () => {
    await expect(
      importConvexSnapshot({
        deploymentOrigin: ORIGIN,
        deploymentAdminKey: ADMIN_KEY,
        bytes: new Uint8Array([1]),
        approvedReplaceAll: true,
        listImports: async () => [{ state: { state: "in_progress" } }],
      }),
    ).rejects.toThrow("already in progress");
  });

  test("returns a generic failure without relaying deployment details", async () => {
    const fetchImpl = async () => jsonResponse({ internal: "secret detail" }, 500);
    await expect(
      importConvexSnapshot({
        deploymentOrigin: ORIGIN,
        deploymentAdminKey: ADMIN_KEY,
        bytes: new Uint8Array([1]),
        approvedReplaceAll: true,
        listImports: async () => [],
        fetchImpl,
      }),
    ).rejects.toThrow("Snapshot import request failed safely");
  });
});
