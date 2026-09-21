import { epochFixture } from "./epoch-fixture.test-support";
import { expect, test } from "bun:test";
import { importConvexSnapshot } from "../snapshotImportApi";
import { exportConvexSnapshotStream } from "../snapshotApi";

test("snapshot import consumes a stream with backpressure and bounded multipart buffers", async () => {
  let epoch: { name: string; value: string } | null = null;
  let produced = 0;
  let uploaded = 0;
  const parts: number[][] = [];
  const result = await importConvexSnapshot({
    deploymentOrigin: "http://127.0.0.1:4830", deploymentAdminKey: "synthetic-admin-key-long-enough",
    approvedReplaceAll: true, importKey: "a".repeat(24), ...epochFixture(() => epoch), chunkSizeBytes: 4, pollIntervalMs: 0,
    stream: (async function* () {
      for (let value = 0; value < 10; value++) {
        expect(produced - uploaded).toBeLessThan(5);
        produced++;
        yield new Uint8Array([value]);
      }
    })(),
    readMediaReferenceEpoch: async () => epoch,
    listImports: async () => [], readImportState: async () => ({ state: "completed", num_rows_written: 1 }),
    fetchImpl: async (url, init) => {
      if (String(url).endsWith("update_environment_variables")) { epoch = JSON.parse(String(init?.body)).changes[0]; return Response.json({}); }
      if (String(url).includes("upload_part")) {
        const bytes = new Uint8Array(init?.body as ArrayBuffer);
        parts.push([...bytes]); uploaded += bytes.length;
        return Response.json({ partToken: `part${uploaded}` });
      }
      if (String(url).includes("start_upload")) return Response.json({ uploadToken: "upload" });
      return Response.json({ importId: "import" });
    },
  });
  expect(parts).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  expect(result.rowsWritten).toBe(1);
});

test("a broken archive stream never finalizes or performs an import", async () => {
  const calls: string[] = [];
  let epoch: { name: string; value: string } | null = null;
  await expect(importConvexSnapshot({
    deploymentOrigin: "http://127.0.0.1:4830", deploymentAdminKey: "synthetic-admin-key-long-enough",
    approvedReplaceAll: true, importKey: "a".repeat(24), ...epochFixture(() => epoch), chunkSizeBytes: 4,
    stream: (async function* () { yield new Uint8Array([1, 2, 3, 4]); throw new Error("corrupt stream"); })(),
    listImports: async () => [],
    readMediaReferenceEpoch: async () => epoch,
    fetchImpl: async (url, init) => { calls.push(String(url)); if (String(url).endsWith("update_environment_variables")) { epoch = JSON.parse(String(init?.body)).changes[0]; return Response.json({}); } return Response.json({ uploadToken: "upload", partToken: "part" }); },
  })).rejects.toThrow("upload failed safely");
  expect(calls.some((url) => url.includes("finish_upload") || url.includes("perform_import"))).toBe(false);
});

test("export hands off a lazy stream instead of allocating the declared archive", async () => {
  let pulls = 0;
  const archive = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(4096)); } }, { highWaterMark: 0 });
  const result = await exportConvexSnapshotStream({
    deploymentOrigin: "http://127.0.0.1:4830", deploymentAdminKey: "synthetic-admin-key-long-enough", includeStorage: true,
    readLatest: async () => ({ state: "completed", start_ts: 123n, complete_ts: 124n, zip_object_key: "opaque" }),
    fetchImpl: async (url) => String(url).includes("/request/") ? new Response(null) : new Response(archive, { headers: { "content-length": String(1024 ** 3) } }),
  });
  expect(pulls).toBe(0);
  const iterator = result.stream[Symbol.asyncIterator]();
  expect((await iterator.next()).value?.byteLength).toBe(4096);
  await iterator.return?.();
  expect(pulls).toBeLessThan(3);
});
