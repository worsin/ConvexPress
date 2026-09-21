import { expect, test } from "bun:test";
import { startCloudflareLoopback } from "./cloudflareLoopback";

async function callback(url: string, suffix: string) {
  return fetch(`${url}${suffix}`, { redirect: "manual" });
}
test("loopback rejects unsolicited, mismatched, duplicate and non-GET callbacks without consuming the attempt", async () => {
  const listener = await startCloudflareLoopback({ port: 0, timeoutMs: 3000 });
  try {
    expect((await callback(listener.redirectUri, "?state=unknown&code=early")).status).toBe(409);
    listener.expectState("a".repeat(43));
    expect((await callback(listener.redirectUri, "?state=wrong&code=invalid")).status).toBe(400);
    expect((await callback(listener.redirectUri, `?state=${"a".repeat(43)}&state=duplicate&code=invalid`)).status).toBe(400);
    expect((await fetch(listener.redirectUri, {method:"POST"})).status).toBe(405);
    const response = await callback(listener.redirectUri, `?state=${"a".repeat(43)}&code=synthetic-code`);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("synthetic-code");
    expect(await listener.result).toEqual({state:"a".repeat(43),code:"synthetic-code"});
  } finally { listener.close(); }
});
test("loopback rejects hostile Host and wrong path before processing state", async () => {
  const listener = await startCloudflareLoopback({ port: 0 });
  try {
    listener.expectState("b".repeat(43));
    expect((await fetch(listener.redirectUri, {headers:{Host:"attacker.example"}})).status).toBe(400);
    expect((await fetch(listener.redirectUri.replace('/hosting/cloudflare/callback','/other'))).status).toBe(404);
  } finally { listener.close(); }
});
test("provider denial and timeout reject with safe messages and close the listener", async () => {
  const listener = await startCloudflareLoopback({ port: 0 });
  listener.expectState("c".repeat(43));
  await callback(listener.redirectUri, `?state=${"c".repeat(43)}&error=access_denied&error_description=private-secret`);
  await expect(listener.result).rejects.toThrow("Cloudflare authorization was declined");
  const timed = await startCloudflareLoopback({ port: 0, timeoutMs: 30 });
  await expect(timed.result).rejects.toThrow("timed out");
});
test("aborting an attempt rejects and releases its bound port", async () => {
  const controller = new AbortController();
  const listener = await startCloudflareLoopback({ port: 0, signal:controller.signal });
  controller.abort();
  await expect(listener.result).rejects.toThrow("cancelled");
  await expect(fetch(listener.redirectUri)).rejects.toThrow();
});
