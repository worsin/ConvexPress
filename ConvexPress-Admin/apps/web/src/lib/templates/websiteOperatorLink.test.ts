import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createWebsiteOperatorLink } from "./websiteOperatorLink";

test("desktop sends a digest only and places a distinct one-use secret in the fragment", async () => {
  let submitted = "";
  const create = async ({ codeHash }: { codeHash: string }) => { submitted = codeHash; return { url: "https://site.example/?customize=1", instanceKey: "one:staging", expiresAt: Date.now() + 60000 }; };
  const url = new URL(await createWebsiteOperatorLink(create, { siteUrl: "https://site.example", instanceKey: "one:staging" }));
  const code = new URLSearchParams(url.hash.slice(1)).get("cp-customize")!;
  assert.match(code, /^[a-f0-9]{64}$/);
  expect(submitted).not.toBe(code);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code))), n => n.toString(16).padStart(2, "0")).join("");
  expect(submitted).toBe(digest);
  expect(url.search).toBe("?customize=1");
  expect(await createWebsiteOperatorLink(create, { siteUrl: "https://site.example", instanceKey: "one:staging" })).not.toBe(url.href);
});

test("desktop refuses wrong environment, wrong public origin, embedded credentials and expired links", async () => {
  const good = { url: "https://site.example/?customize=1", instanceKey: "one:staging", expiresAt: Date.now() + 60000 };
  for (const invalid of [{ ...good, instanceKey: "one:live" }, { ...good, url: "https://other.example" }, { ...good, url: "https://user:password@site.example" }, { ...good, expiresAt: 0 }]) {
    await assert.rejects(createWebsiteOperatorLink(async () => invalid, { siteUrl: "https://site.example", instanceKey: "one:staging" }));
  }
});
