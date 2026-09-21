import { expect, test } from "bun:test";
import { startWebsiteEditingBridge } from "./loopback";

const siteUrl = "https://client.example";
const code = "ab".repeat(32);
const link = `${siteUrl}/?customize=1#cp-customize=${code}`;
type Bridge = Awaited<ReturnType<typeof startWebsiteEditingBridge>>;
const send = (bridge: Bridge, body: unknown, origin = siteUrl, extra: Record<string, string> = {}) => fetch(bridge.descriptor.endpoint, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });

test("only the exact launched origin, Host and ticket can request a fresh one-use code", async () => {
  let calls = 0;
  const bridge = await startWebsiteEditingBridge({ siteUrl, renew: async () => { calls++; return link; } });
  try {
    const body = { key: bridge.descriptor.key, action: "renew" };
    expect(new URL(bridge.descriptor.endpoint).hostname).toBe("127.0.0.1");
    expect((await send(bridge, body, "https://other.example")).status).toBe(403);
    expect((await send(bridge, body, siteUrl, { Host: "attacker.example" })).status).toBe(403);
    expect((await send(bridge, { ...body, key: "cd".repeat(32) })).status).toBe(403);
    expect((await send(bridge, { ...body, action: "arbitrary-ipc" })).status).toBe(400);
    expect((await send(bridge, { ...body, padding: "x".repeat(1500) })).status).toBe(413);
    expect(calls).toBe(0);
    const result = await send(bridge, body);
    expect(result.status).toBe(200);
    expect(result.headers.get("access-control-allow-origin")).toBe(siteUrl);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ code });
    expect((await send(bridge, body)).status).toBe(429);
    expect(calls).toBe(1);
    expect((await send(bridge, { ...body, action: "end" })).status).toBe(200);
  } finally { bridge.close(); }
});

test("preflight is scoped, and expired or explicitly closed listeners stop accepting requests", async () => {
  let closed = 0;
  const bridge = await startWebsiteEditingBridge({ siteUrl, renew: async () => link, lifetimeMs: 150, onClose: () => { closed++; } });
  try {
    const response = await fetch(bridge.descriptor.endpoint, { method: "OPTIONS", headers: { Origin: siteUrl, "Access-Control-Request-Private-Network": "true" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-private-network")).toBe("true");
    const refused = await fetch(bridge.descriptor.endpoint, { method: "OPTIONS", headers: { Origin: "null" } });
    expect(refused.status).toBe(403);
    expect(refused.headers.get("access-control-allow-origin")).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(closed).toBe(1);
    await expect(send(bridge, { key: bridge.descriptor.key, action: "renew" })).rejects.toThrow();
    bridge.close(); expect(closed).toBe(1);
  } finally { bridge.close(); }
});

test("a timed-out broker request retains its slot and cannot return a late credential", async () => {
  let finish!: (url: string) => void, calls = 0;
  const bridge = await startWebsiteEditingBridge({ siteUrl, requestTimeoutMs: 20, renew: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  try {
    const body = { key: bridge.descriptor.key, action: "renew" };
    const response = await send(bridge, body);
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain(code);
    expect((await send(bridge, body)).status).toBe(409);
    expect(calls).toBe(1);
    finish(link);
  } finally { bridge.close(); }
});

test("a broker result for another website is refused and listener input requires a safe origin", async () => {
  const bridge = await startWebsiteEditingBridge({ siteUrl, renew: async () => link.replace("client.example", "other.example") });
  try { expect((await send(bridge, { key: bridge.descriptor.key, action: "renew" })).status).toBe(403); }
  finally { bridge.close(); }
  for (const invalid of ["http://client.example", "https://user:password@client.example", "file:///tmp/client"]) {
    await expect(startWebsiteEditingBridge({ siteUrl: invalid, renew: async () => link })).rejects.toThrow();
  }
});
