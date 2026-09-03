import { describe, expect, test } from "bun:test";

import { exportConvexSnapshot } from "../snapshotApi";

describe("Convex snapshot export API", () => {
  test("uses authenticated official export endpoints and returns the completed ZIP", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const fetchImpl: typeof fetch = async (resource, init) => {
      const url = String(resource);
      calls.push({ url, init });
      if (url.includes("/api/export/request/zip")) {
        return new Response(null, { status: 200 });
      }
      return new Response(archive, {
        status: 200,
        headers: { "content-type": "application/zip" },
      });
    };
    const states = [
      { state: "requested" as const },
      {
        state: "completed" as const,
        start_ts: 1_788_400_000_000n,
        complete_ts: 1_788_400_000_100n,
        zip_object_key: "opaque",
      },
    ];

    const result = await exportConvexSnapshot({
      deploymentOrigin: "http://127.0.0.1:4820",
      deploymentAdminKey: "fixture-local-admin-key-0123456789",
      includeStorage: true,
      fetchImpl,
      readLatest: async () => states.shift()!,
      pollIntervalMs: 0,
      maxPollAttempts: 4,
    });

    expect(result.exportTimestamp).toBe("1788400000000");
    expect(result.bytes).toEqual(archive);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:4820/api/export/request/zip?includeStorage=true",
      "http://127.0.0.1:4820/api/export/zip/1788400000000",
    ]);
    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get("Authorization")).toBe(
        "Convex fixture-local-admin-key-0123456789",
      );
      expect(headers.get("Convex-Client")).toBe("convexpress-lifecycle-v1");
    }
  });

  test("keeps provider bodies and credentials out of public export failures", async () => {
    await expect(
      exportConvexSnapshot({
        deploymentOrigin: "http://127.0.0.1:4820",
        deploymentAdminKey: "fixture-local-admin-key-0123456789",
        includeStorage: true,
        fetchImpl: async () =>
          new Response("adminKey=fixture-local-admin-key-0123456789", {
            status: 500,
          }),
        readLatest: async () => ({ state: "failed" }),
      }),
    ).rejects.toThrow("Snapshot export request failed safely");

    try {
      await exportConvexSnapshot({
        deploymentOrigin: "http://127.0.0.1:4820",
        deploymentAdminKey: "fixture-local-admin-key-0123456789",
        includeStorage: true,
        fetchImpl: async () =>
          new Response("adminKey=fixture-local-admin-key-0123456789", {
            status: 500,
          }),
        readLatest: async () => ({ state: "failed" }),
      });
    } catch (error) {
      expect(String(error)).not.toContain("fixture-local-admin-key");
      expect(String(error)).not.toContain("adminKey=");
    }
  });

  test("fails closed when export never reaches a stable state", async () => {
    await expect(
      exportConvexSnapshot({
        deploymentOrigin: "http://127.0.0.1:4820",
        deploymentAdminKey: "fixture-local-admin-key-0123456789",
        includeStorage: false,
        fetchImpl: async () => new Response(null, { status: 200 }),
        readLatest: async () => ({ state: "in_progress" }),
        pollIntervalMs: 0,
        maxPollAttempts: 2,
      }),
    ).rejects.toThrow("did not complete");
  });
});
