import { test, expect, mock } from "bun:test";
import { act, StrictMode } from "react";
import { JSDOM } from "jsdom";
let user, auth, runtime, online, action, unsubscribe, host;
mock.module("convex/react", () => ({ useAction: () => action, useMutation: () => unsubscribe, useConvex: () => ({ url: runtime.convexUrl }), useConvexAuth: () => auth }));
mock.module("../../../lib/auth/clerk", () => ({ useAuth: () => user }));
mock.module("../../../lib/site-runtime", () => ({ getSiteRuntime: () => runtime }));
mock.module("../../../hooks/useLiveConnection", () => ({ useLiveConnection: () => ({ isWebSocketConnected: online }) }));
mock.module("./lead-magnet", () => ({ LeadMagnetProvider: ({ value, children }) => { host = value; return children; } }));
const { ProductionLeadMagnetProvider } = await import("./lead-magnet-production");
const offer = { postId: "owned-page", blockId: "owned-block", digest: "a".repeat(64), file: { name: "guide.txt", bytes: 12 } };
const input = { email: "synthetic@example.test", marketingConsent: false, startedAt: 0, honeypot: "", captchaToken: "" };
const lease = () => ({ leaseId: "owned-lease", fileName: "guide.txt", fileSize: 12, expiresAt: Date.now() + 60000 });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function fixture(run, anonymous = false) {
  user = { userId: "alice", sessionId: "one", isSignedIn: true }; auth = { isLoading: false, isAuthenticated: true }; runtime = { convexUrl: "https://site.convex.cloud", instanceKey: "staging" }; online = true;
  if (anonymous) { user = { isSignedIn: undefined }; auth = { isLoading: true, isAuthenticated: false }; }
  const dom = new JSDOM("<div id='root'></div>", { url: "https://site.example" });
  const saved = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT", "fetch"]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    if (key !== "fetch") Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  const calls = [], handoffs = [], optouts = []; let clicks = 0, mounted = true;
  dom.window.HTMLAnchorElement.prototype.click = () => { clicks++; };
  action = args => { const pending = deferred(); calls.push({ args, ...pending }); return pending.promise; };
  unsubscribe = args => { const pending = deferred(); optouts.push({ args, ...pending }); return pending.promise; };
  globalThis.fetch = (...args) => { const pending = deferred(); handoffs.push({ args, ...pending }); return pending.promise; };
  const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("root"));
  const render = () => act(async () => root.render(<StrictMode><ProductionLeadMagnetProvider><a href="#details">Owned page</a><details id="details"><summary>Details</summary>Public content</details></ProductionLeadMagnetProvider></StrictMode>));
  await render();
  const capture = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, message: error.message }));
  const submit = () => capture(host.submit(offer, input));
  const ready = async () => { const result = submit(); await act(async () => calls.at(-1).resolve(lease())); return (await result).value; };
  try { await run({ calls, handoffs, optouts, clicks: () => clicks, capture, submit, ready, render, unmount: async () => { await act(async () => root.unmount()); mounted = false; } }); }
  finally { if (mounted) await act(async () => root.unmount()); dom.window.close(); for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } }
}
for (const change of ["account-return", "loading-return", "instance", "unmount"]) test(`late lead receipt is rejected after ${change}`, () => fixture(async f => {
  const pending = f.submit();
  if (change === "account-return") { user = { ...user, sessionId: "two" }; await f.render(); user = { ...user, sessionId: "one" }; await f.render(); }
  else if (change === "loading-return") { auth = { ...auth, isLoading: true }; await f.render(); auth = { ...auth, isLoading: false }; await f.render(); }
  else if (change === "instance") { runtime = { ...runtime, instanceKey: "live" }; await f.render(); }
  else await f.unmount();
  await act(async () => f.calls[0].resolve(lease()));
  expect((await pending).ok).toBe(false);
  expect(f.handoffs).toHaveLength(0);
}));
test("a late download handoff cannot click after switching away and back", () => fixture(async f => {
  const receipt = await f.ready(); const result = f.capture(host.download(receipt));
  user = { ...user, sessionId: "two" }; await f.render(); user = { ...user, sessionId: "one" }; await f.render();
  await act(async () => f.handoffs[0].resolve(new Response(null, { status: 204 })));
  expect((await result).ok).toBe(false); expect(f.clicks()).toBe(0);
}));
test("availability is read at completion and same-authority uncertain retry preserves its request", () => fixture(async f => {
  const first = f.submit(); online = false; await f.render();
  await act(async () => f.calls[0].resolve(lease())); expect((await first).ok).toBe(false);
  online = true; await f.render(); const second = f.submit();
  expect(f.calls[1].args).toEqual(f.calls[0].args);
  await act(async () => f.calls[1].resolve(lease())); const receipt = (await second).value;
  const download = f.capture(host.download(receipt)); await act(async () => f.handoffs[0].resolve(new Response(null, { status: 204 })));
  expect((await download).ok).toBe(true); expect(f.clicks()).toBe(1);
}));
test("old host callbacks stay invalid after an account round trip", () => fixture(async f => {
  const old = host;
  user = { ...user, sessionId: "two" }; await f.render(); user = { ...user, sessionId: "one" }; await f.render();
  const result = f.capture(old.submit(offer, input));
  if (f.calls.length) await act(async () => f.calls[0].resolve(lease()));
  expect((await result).ok).toBe(false);
  expect(f.calls).toHaveLength(0);
}));
test("unsubscribe acknowledgement is rejected after authority changes", () => fixture(async f => {
  const receipt = await f.ready(); const result = f.capture(host.unsubscribe(receipt));
  user = { ...user, sessionId: "two" }; await f.render(); user = { ...user, sessionId: "one" }; await f.render();
  await act(async () => f.optouts[0].resolve(null)); expect((await result).ok).toBe(false);
}));

test("anonymous auth readiness preserves focused public children and open disclosures", () => fixture(async f => {
  const link = document.querySelector("a"), details = document.querySelector("details");
  link.focus(); details.open = true;
  user = { userId: null, sessionId: null, isSignedIn: false }; await f.render();
  expect(document.querySelector("a") === link).toBe(true);
  auth = { isLoading: false, isAuthenticated: false }; await f.render();
  expect(document.querySelector("a") === link).toBe(true);
  expect(document.activeElement === link).toBe(true);
  expect(details.isConnected && details.open).toBe(true);
  const pending = f.submit(), previous = host;
  auth = { ...auth, isLoading: true }; await f.render();
  auth = { ...auth, isLoading: false }; await f.render();
  await act(async () => f.calls[0].resolve(lease()));
  expect((await pending).ok).toBe(false);
  expect((await f.capture(previous.submit(offer, input))).ok).toBe(false);
  expect(f.calls).toHaveLength(1);
  expect(document.activeElement === link).toBe(true);
  user = { userId: "alice", sessionId: "one", isSignedIn: true }; await f.render();
  expect(link.isConnected).toBe(false);
}, true));
test("authenticated readiness and identity changes still clear rendered state", () => fixture(async f => {
  for (const change of [() => { auth = { ...auth, isLoading: true }; }, () => { auth = { ...auth, isLoading: false }; }, () => { user = { ...user, sessionId: "two" }; }, () => { runtime = { ...runtime, instanceKey: "live" }; }]) {
    const link = document.querySelector("a"); change(); await f.render();
    expect(link.isConnected).toBe(false);
  }
}));
