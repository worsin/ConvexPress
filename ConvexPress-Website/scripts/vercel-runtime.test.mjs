import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createVercelHandler } from "./vercel-runtime.mjs";
const env = () => ({
  CONVEXPRESS_CONVEX_URL: "https://synthetic.convex.cloud",
  CONVEXPRESS_INSTANCE_KEY: "synthetic_instance",
  CONVEXPRESS_SITE_URL: "https://site.example",
});
async function serve(handler, run) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test("Node adapter preserves SSR request method/body/query, status, cookies and streaming", async () => {
  await serve(
    createVercelHandler(async (request) => {
      assert.equal(request.url, "https://site.example/checkout?mode=test");
      assert.equal(request.method, "POST");
      assert.equal(await request.text(), "synthetic request");
      const headers = new Headers({ "content-type": "text/plain" });
      headers.append("set-cookie", "a=1; HttpOnly");
      headers.append("set-cookie", "b=2; HttpOnly");
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("streamed "));
            controller.enqueue(new TextEncoder().encode("response"));
            controller.close();
          },
        }),
        { status: 201, headers },
      );
    }, env()),
    async (url) => {
      const result = await fetch(url + "/checkout?mode=test", {
        method: "POST",
        body: "synthetic request",
      });
      assert.equal(result.status, 201);
      assert.equal(await result.text(), "streamed response");
      assert.deepEqual(result.headers.getSetCookie(), ["a=1; HttpOnly", "b=2; HttpOnly"]);
    },
  );
});
test("Node adapter fails closed on absent or changed instance binding", async () => {
  let calls = 0;
  const target = env();
  const handler = createVercelHandler(() => {
    calls++;
    return new Response("ok");
  }, target);
  await serve(handler, async (url) => {
    assert.equal((await fetch(url)).status, 200);
    target.CONVEXPRESS_INSTANCE_KEY = "other_instance";
    assert.equal((await fetch(url)).status, 503);
    assert.equal(calls, 1);
  });
  await serve(
    createVercelHandler(() => new Response("unexpected"), {}),
    async (url) => assert.equal((await fetch(url)).status, 503),
  );
});
test("Node adapter strips HEAD bodies and hides handler exception details", async () => {
  await serve(
    createVercelHandler((request) => {
      if (request.method === "HEAD") return new Response("must not send");
      throw Error("synthetic-private-detail");
    }, env()),
    async (url) => {
      assert.equal(await (await fetch(url, { method: "HEAD" })).text(), "");
      const result = await fetch(url);
      assert.equal(result.status, 500);
      assert.equal(await result.text(), "Website request failed.");
    },
  );
});

test("Release identity comes only from the bound deployment, including HEAD and 404 responses", async () => {
  const target = { ...env(), CONVEXPRESS_RELEASE_ID: "receipt_verified", CONVEXPRESS_ARTIFACT_HASH: "a".repeat(64) };
  await serve(createVercelHandler(() => new Response("not found", { status: 404, headers: {
    "x-convexpress-instance": "forged", "x-convexpress-release": "forged", "x-convexpress-artifact": "forged",
  } }), target), async (url) => {
    for (const method of ["GET", "HEAD"]) {
      const result = await fetch(url, { method, headers: { "x-convexpress-release": "request_forgery" } });
      assert.equal(result.status, 404);
      assert.equal(result.headers.get("x-convexpress-instance"), target.CONVEXPRESS_INSTANCE_KEY);
      assert.equal(result.headers.get("x-convexpress-release"), target.CONVEXPRESS_RELEASE_ID);
      assert.equal(result.headers.get("x-convexpress-artifact"), target.CONVEXPRESS_ARTIFACT_HASH);
      if (method === "HEAD") assert.equal(await result.text(), "");
    }
    target.CONVEXPRESS_ARTIFACT_HASH = "b".repeat(64);
    const changed = await fetch(url);
    assert.equal(changed.status, 503);
    assert.equal(changed.headers.get("x-convexpress-release"), null);
  });
});

test("Older configuration cannot fabricate a verified release; partial or invalid receipts fail closed", async () => {
  await serve(createVercelHandler(() => new Response("ok", { headers: {
    "x-convexpress-release": "forged", "x-convexpress-artifact": "a".repeat(64),
  } }), env()), async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-convexpress-release"), null);
    assert.equal(response.headers.get("x-convexpress-artifact"), null);
  });
  for (const bindings of [
    { CONVEXPRESS_RELEASE_ID: "receipt_verified" },
    { CONVEXPRESS_ARTIFACT_HASH: "a".repeat(64) },
    { CONVEXPRESS_RELEASE_ID: "receipt_verified", CONVEXPRESS_ARTIFACT_HASH: "bad" },
    { CONVEXPRESS_RELEASE_ID: "unsafe\nheader", CONVEXPRESS_ARTIFACT_HASH: "a".repeat(64) },
  ]) await serve(createVercelHandler(() => { throw Error("must not invoke SSR"); }, { ...env(), ...bindings }), async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-convexpress-release"), null);
  });
});
