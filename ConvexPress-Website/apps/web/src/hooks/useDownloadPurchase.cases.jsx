import { test, expect, mock } from "bun:test";
import { act, StrictMode } from "react";
import { JSDOM } from "jsdom";
let identity, auth, runtime, online, begin, current;
mock.module("convex/react", () => ({ useMutation: () => begin, useConvexAuth: () => auth }));
mock.module("../lib/auth/clerk", () => ({ useAuth: () => identity }));
mock.module("../lib/site-runtime", () => ({ getSiteRuntime: () => runtime }));
mock.module("./useLiveConnection", () => ({ useLiveConnection: () => ({ isWebSocketConnected: online }) }));
const { useDownloadPurchase } = await import("./useDownloadPurchase");
function Probe() { current = useDownloadPurchase(); return <span>{current.busyTokens.size}</span>; }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function fixture() {
  identity = { userId: "customer-one", sessionId: "session-one" }; auth = { isLoading: false, isAuthenticated: true }; runtime = { convexUrl: "https://site.convex.cloud", instanceKey: "staging" }; online = true;
  const dom = new JSDOM('<div id="app"></div>', { url: "https://shop.example.test" });
  const saved = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT", "fetch"]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    if (key !== "fetch") Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  const calls = [], handoffs = []; let clicks = 0, mounted = true;
  dom.window.HTMLAnchorElement.prototype.click = () => { clicks++; };
  begin = args => { const pending = deferred(); calls.push({ args, ...pending }); return pending.promise; };
  globalThis.fetch = (...args) => { const pending = deferred(); handoffs.push({ args, ...pending }); return pending.promise; };
  const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("app"));
  const render = () => act(async () => root.render(<StrictMode><Probe /></StrictMode>)); await render();
  return { calls, handoffs, render, clicks: () => clicks,
    start: async () => { let request; await act(async () => { request = current.download("opaque-owned-purchase").then(() => ({ ok: true }), error => ({ ok: false, message: error.message })); }); return { request }; },
    unmount: async () => { await act(async () => root.unmount()); mounted = false; },
    async cleanup() { if (mounted) await act(async () => root.unmount()); dom.window.close(); for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } },
  };
}
const lease = { leaseId: "owned-lease", fileName: "guide.pdf", fileSize: 100, expiresAt: Date.now() + 60000 };
for (const change of ["unmount", "session-return", "auth-revocation", "environment"]) test(`download cancels a delayed lease after ${change}`, async () => {
  const f = await fixture();
  try {
    const { request } = await f.start(); expect(f.calls).toHaveLength(1);
    if (change === "unmount") await f.unmount();
    else if (change === "session-return") { identity = { ...identity, sessionId: "session-two" }; await f.render(); identity = { ...identity, sessionId: "session-one" }; await f.render(); }
    else if (change === "auth-revocation") { auth = { isLoading: false, isAuthenticated: false }; await f.render(); }
    else { runtime = { ...runtime, instanceKey: "live" }; await f.render(); }
    await act(async () => f.calls[0].resolve(lease));
    // Resolve an incorrectly started handoff so a failure cannot strand a promise.
    if (f.handoffs[0]) await act(async () => f.handoffs[0].resolve(new Response(null, { status: 204 })));
    expect((await request).ok).toBe(false); expect(f.handoffs).toHaveLength(0); expect(f.clicks()).toBe(0);
  } finally { await f.cleanup(); }
});
test("download does not click a file after its host unmounts during handoff", async () => {
  const f = await fixture();
  try { const { request } = await f.start(); await act(async () => f.calls[0].resolve(lease)); expect(f.handoffs).toHaveLength(1); await f.unmount(); await act(async () => f.handoffs[0].resolve(new Response(null, { status: 204 }))); expect((await request).ok).toBe(false); expect(f.clicks()).toBe(0); }
  finally { await f.cleanup(); }
});
test("an uncertain initiation retries the same request and a current download succeeds once", async () => {
  const f = await fixture();
  try {
    const first = await f.start(); await act(async () => f.calls[0].reject(Error("Acknowledgement lost"))); expect((await first.request).ok).toBe(false);
    const second = await f.start(); expect(f.calls).toHaveLength(2); expect(f.calls[1].args).toEqual(f.calls[0].args);
    await act(async () => f.calls[1].resolve(lease)); expect(f.handoffs).toHaveLength(1);
    await act(async () => f.handoffs[0].resolve(new Response(null, { status: 204 }))); expect((await second.request).ok).toBe(true); expect(f.clicks()).toBe(1); expect(current.busyTokens.size).toBe(0);
  } finally { await f.cleanup(); }
});
test("a canceled response cannot clear the busy state of the new account's request", async () => {
  const f = await fixture();
  try {
    const previous = await f.start();
    identity = { userId: "customer-two", sessionId: "session-two" }; await f.render();
    const next = await f.start(); expect(f.calls).toHaveLength(2); expect(current.busyTokens.size).toBe(1);
    await act(async () => f.calls[0].resolve(lease)); expect((await previous.request).ok).toBe(false);
    expect(current.busyTokens.size).toBe(1); expect(f.handoffs).toHaveLength(0);
    await act(async () => f.calls[1].resolve({ ...lease, leaseId: "second-owned-lease" }));
    await act(async () => f.handoffs[0].resolve(new Response(null, { status: 204 })));
    expect((await next.request).ok).toBe(true); expect(f.clicks()).toBe(1); expect(current.busyTokens.size).toBe(0);
  } finally { await f.cleanup(); }
});
