import { expect, test } from "bun:test";
import { handleDownloadBytes, DOWNLOAD_CHUNK_BYTES } from "../byteTransport";

const proof = { leaseId: "lease_test", secret: "a".repeat(64) };
const lease = { fileName: "installer.zip", mimeType: "application/zip", fileSize: 10, etag: `"${"b".repeat(64)}"`, expiresAt: Date.now() + 60000, url: "https://storage.invalid/PRIVATE_URL" };
function request(body: unknown) { return new Request("https://backend.invalid/commerce/downloads/bytes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
function fixture(options: { status?: number; contentRange?: string; length?: string; encoding?: string; denied?: boolean; denyStart?: boolean; bytes?: Uint8Array } = {}) {
  const calls = { auth: 0, fetch: 0, start: 0, range: "" };
  const deps = {
    authorize: async () => { calls.auth++; if (options.denied) throw Error("PRIVATE_ERROR"); return lease; },
    start: async () => { calls.start++; if (options.denyStart) throw Error("PRIVATE_ERROR"); },
    fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.fetch++; calls.range = new Headers(init?.headers).get("range") ?? "";
      const headers = new Headers({ "content-range": options.contentRange ?? "bytes 2-5/10", "content-length": options.length ?? "4" });
      if (options.encoding) headers.set("content-encoding", options.encoding);
      return new Response(options.bytes ?? new Uint8Array([2, 3, 4, 5]), { status: options.status ?? 206, headers });
    },
  };
  return { calls, deps };
}
test("metadata projects no underlying URL or capability and never consumes allowance", async () => {
  const { deps, calls } = fixture();
  const response = await handleDownloadBytes(request({ ...proof, mode: "metadata" }), deps);
  expect(await response.json()).toEqual({ fileName: lease.fileName, fileSize: 10, etag: lease.etag, expiresAt: lease.expiresAt });
  expect(calls).toMatchObject({ auth: 1, fetch: 0, start: 0 });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("bounded ranges are authorized and started before their bytes are exposed", async () => {
  const { deps, calls } = fixture();
  const response = await handleDownloadBytes(request({ ...proof, mode: "chunk", offset: 2, length: 4 }), deps);
  expect(response.status).toBe(206);
  expect(calls).toMatchObject({ auth: 1, fetch: 1, start: 1, range: "bytes=2-5" });
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4, 5]);
  expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
});
test.each([{ status: 200 }, { contentRange: "bytes 0-3/10" }, { length: "5" }, { encoding: "gzip" }])("upstream range/protocol mismatch does not consume allowance: %j", async options => {
  const { deps, calls } = fixture(options);
  const response = await handleDownloadBytes(request({ ...proof, mode: "chunk", offset: 2, length: 4 }), deps);
  expect(response.status).toBe(502);
  expect(calls.start).toBe(0);
  expect(await response.text()).not.toContain("PRIVATE");
});
test("revocation between upstream setup and start prevents bytes being returned", async () => {
  const { deps } = fixture({ denyStart: true });
  const response = await handleDownloadBytes(request({ ...proof, mode: "chunk", offset: 2, length: 4 }), deps);
  expect(response.status).toBe(403);
  expect(await response.text()).toBe("Download unavailable");
});
test.each([new Uint8Array(3), new Uint8Array(5)])("a truncated or oversized upstream body fails the stream", async bytes => {
  const { deps } = fixture({ bytes });
  const response = await handleDownloadBytes(request({ ...proof, mode: "chunk", offset: 2, length: 4 }), deps);
  await expect(response.arrayBuffer()).rejects.toThrow();
});
test("malformed, oversized and forged-authority requests are rejected before authorization", async () => {
  for (const body of [{ ...proof, mode: "chunk", offset: 0, length: DOWNLOAD_CHUNK_BYTES + 1 }, { ...proof, mode: "metadata", userId: "forged" }, { ...proof, mode: "metadata", secret: "x".repeat(3000) }]) {
    const { deps, calls } = fixture();
    expect((await handleDownloadBytes(request(body), deps)).status).toBe(400);
    expect(calls.auth).toBe(0);
  }
});
