import { expect, test } from "bun:test";
import { probeWebsiteRuntime, assertProbeOrigin, assertRuntimeVerification } from "../websiteRuntimeVerification";
const target = { releaseId: "release_alpha", artifactHash: "b".repeat(64), instanceKey: "instance_alpha", siteOrigin: "https://alpha.team.workers.dev" };
const html = () => new Response("<!doctype html><html><body>Actual rendered page</body></html>", { headers: { "content-type": "text/html", "x-convexpress-instance": target.instanceKey, "x-convexpress-release": target.releaseId, "x-convexpress-artifact": target.artifactHash } });
test("only the provider-confirmed Worker origin can be probed", () => {
  expect(assertProbeOrigin(target.siteOrigin, "alpha", "team")).toBe(target.siteOrigin);
  for (const origin of ["https://evil.test", "http://127.0.0.1", target.siteOrigin + "/path", "https://alpha.team.workers.dev.evil.test"]) expect(() => assertProbeOrigin(origin, "alpha", "team")).toThrow();
  expect(() => assertProbeOrigin(target.siteOrigin, "alpha", "../team")).toThrow();
});
test("probes both real canonical routes, with no credentials or redirect following", async () => {
  const requests: string[] = [];
  const evidence = await probeWebsiteRuntime(target, { fetch: async (url, init) => { requests.push(new URL(String(url)).pathname); expect(init?.redirect).toBe("error"); expect(init?.credentials).toBe("omit"); expect(new Headers(init?.headers).has("authorization")).toBe(false); return html(); } });
  expect(requests).toEqual(["/", "/document-preview/"]); expect(evidence.result).toBe("verified");
  expect(() => assertRuntimeVerification(evidence, target)).not.toThrow();
  expect(() => assertRuntimeVerification(evidence, { ...target, releaseId: "different" })).toThrow();
  expect(() => assertRuntimeVerification({ ...evidence, checkedAt: Date.now() - 60_000 }, target)).toThrow();
});
test("runtime 500, health JSON, wrong identities, redirects and oversized HTML fail closed", async () => {
  const cases = [() => new Response("Cloudflare 1101", { status: 500 }), () => { const headers = html().headers; headers.set("content-type", "application/json"); return new Response('{"ok":true}', { headers }); }, () => { const r = html(); r.headers.set("x-convexpress-release", "old_release"); return r; }, () => { const r = html(); r.headers.set("x-convexpress-instance", "wrong_site"); return r; }, () => new Response(null, { status: 301, headers: { location: "https://evil.test" } }), () => { const r = html(); return new Response("x".repeat(2_097_153), { headers: r.headers }); }];
  for (const response of cases) { const evidence = await probeWebsiteRuntime(target, { fetch: async () => response(), attempts: 1 }); expect(evidence.result).toBe("failed"); expect(() => assertRuntimeVerification(evidence, target, true)).toThrow(); }
});
test("bounded retries tolerate deployment propagation, but hanging headers and bodies time out", async () => {
  let count = 0;
  const evidence = await probeWebsiteRuntime(target, { fetch: async () => ++count <= 2 ? new Response("Not ready", { status: 503 }) : html(), wait: async () => { } });
  expect(evidence.result).toBe("verified"); expect(evidence.attempts).toBe(2); expect(count).toBe(4);
  for (const fetch of [async () => new Promise<Response>(() => { }), async () => new Response(new ReadableStream({ start() { } }), { headers: html().headers })]) {
    const failed = await probeWebsiteRuntime(target, { fetch, attempts: 1, timeoutMs: 5 }); expect(failed.result).toBe("failed"); expect(failed.routes.every(r => r.code === "timeout")).toBe(true);
  }
});
