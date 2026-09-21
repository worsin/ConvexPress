import { expect, test } from "bun:test";
import { CloudflareApi, ProviderApiError } from "../providerApi";

const account = "a".repeat(32);
const reply = (result: unknown) => new Response(JSON.stringify({ success: true, result }));

test("Worker ownership is read from settings and only a confirmed 404 is absent", async () => {
  const api = new CloudflareApi("synthetic-token", account, (async url => {
    expect(String(url)).toEndWith("/workers/scripts/aster-house/settings");
    return reply({ tags: ["convexpress-instance:aster"], bindings: [{ name: "PRIVATE", text: "never-return" }] });
  }) as typeof fetch);
  expect(await api.getWorkerMetadata("aster-house")).toEqual({ id: "aster-house", tags: ["convexpress-instance:aster"], runtimeBindings: {} });
  for (const status of [404, 403, 503]) {
    const failed = new CloudflareApi("synthetic-token", account, (async () => new Response("provider detail", { status })) as typeof fetch);
    if (status === 404) expect(await failed.getWorkerMetadata("aster-house")).toBeNull();
    else await expect(failed.getWorkerMetadata("aster-house")).rejects.toBeInstanceOf(ProviderApiError);
  }
});

test("Worker release tags are uploaded and subdomain state is independently verified", async () => {
  const tags = ["convexpress-instance:aster", "convexpress-release:receipt", "convexpress-artifact:hash"];
  const api = new CloudflareApi("synthetic-token", account, (async (url, init) => {
    if (init?.method === "PUT") {
      const form = init.body as FormData;
      const metadata = JSON.parse(await (form.get("metadata") as Blob).text());
      expect(metadata.tags).toEqual(tags);
      expect(metadata.bindings).toContainEqual({ type: "plain_text", name: "CONVEXPRESS_INSTANCE_KEY", text: "aster" });
      return reply({ id: "aster-house" });
    }
    expect(String(url)).toEndWith("/aster-house/subdomain");
    return reply({ enabled: true });
  }) as typeof fetch);
  await api.uploadWorker("aster-house", { modules: [{ name: "worker.mjs", contents: "export default {}" }], assetJwt: "session", bindings: { CONVEXPRESS_INSTANCE_KEY: "aster" }, tags });
  expect(await api.getWorkerSubdomain("aster-house")).toEqual({ enabled: true });
});

test("oversized provider streams are cancelled without buffering the whole response", async () => {
  let pulls = 0, cancelled = false;
  const api = new CloudflareApi("synthetic-token", account, (async () => new Response(new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }))) as typeof fetch);
  await expect(api.verifyIdentity()).rejects.toBeInstanceOf(ProviderApiError);
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThanOrEqual(10);
});

test("caller cancellation reaches provider reads and writes without retrying", async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = new CloudflareApi("synthetic-token", account, (async (_url, init) => {
    calls++;
    expect(init?.signal).toBeDefined();
    controller.abort();
    expect(init?.signal?.aborted).toBe(true);
    throw new Error("cancelled synthetic-token");
  }) as typeof fetch);
  const error = await api.enableWorkerSubdomain("aster-house", controller.signal).catch(e => e);
  expect(error).toBeInstanceOf(ProviderApiError);
  expect(error.uncertain).toBe(true);
  expect(error.message).not.toContain("synthetic-token");
  expect(calls).toBe(1);
});

test("Worker metadata exposes only allowlisted public plain-text runtime bindings", async () => {
  const account = "a".repeat(32);
  const api = new CloudflareApi("synthetic-token", account, async () => new Response(JSON.stringify({
    success: true, result: {
      tags: [], bindings: [
        { name: "CONVEXPRESS_INSTANCE_KEY", type: "plain_text", text: "instance_alpha" },
        { name: "CONVEXPRESS_RELEASE_ID", type: "plain_text", text: "release_alpha" },
        { name: "CONVEXPRESS_ARTIFACT_HASH", type: "plain_text", text: "b".repeat(64) },
        { name: "CLERK_SECRET_KEY", type: "plain_text", text: "do-not-expose" },
        { name: "CONVEXPRESS_CLERK_PUBLISHABLE_KEY", type: "secret_text", text: "also-hidden" },
        { name: "DATABASE_URL", type: "plain_text", text: "private-database" },
      ]
    }
  })));
  const metadata = await api.getWorkerMetadata("alpha");
  expect(metadata?.runtimeBindings).toEqual({ CONVEXPRESS_INSTANCE_KEY: "instance_alpha", CONVEXPRESS_RELEASE_ID: "release_alpha", CONVEXPRESS_ARTIFACT_HASH: "b".repeat(64) });
  expect(JSON.stringify(metadata)).not.toContain("do-not-expose");
  expect(JSON.stringify(metadata)).not.toContain("also-hidden");
  expect(JSON.stringify(metadata)).not.toContain("private-database");
});
