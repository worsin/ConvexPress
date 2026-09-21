import { act, StrictMode } from "react";
import { expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";

let identity, auth, runtime, client, enabled, calls, current, errors, sequence = 0;
const settle = args => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  calls.push({ args, site: runtime.convexUrl, resolve, reject });
  return promise;
};
mock.module("convex/react", () => ({ useConvexAuth: () => auth, useConvex: () => client, useMutation: () => settle }));
mock.module("../contexts/SettingsContext", () => ({ useSettings: () => ({ plugins: { commerceEnabled: enabled } }) }));
mock.module("../lib/auth/clerk", () => ({ useAuth: () => identity }));
mock.module("../lib/site-runtime", () => ({ getSiteRuntime: () => runtime }));
mock.module("sonner", () => ({ toast: { error: value => errors.push(value) } }));
const { useCommerceSessionToken } = await import("./useCommerceSessionToken");
function Probe({ index }) { current[index] = useCommerceSessionToken(); return null; }

async function fixture({ storageDisabled = false, consumers = 1 } = {}) {
  const id = ++sequence;
  identity = { userId: `shopper-${id}`, sessionId: `login-${id}`, isLoaded: true, isSignedIn: true };
  auth = { isLoading: false, isAuthenticated: true };
  runtime = { convexUrl: `https://source-${id}.convex.cloud`, instanceKey: `source-${id}` };
  client = {}; enabled = true; calls = []; current = []; errors = [];
  const originalRuntime = { ...runtime };
  const dom = new JSDOM('<div id="root"></div>', { url: "https://shop.invalid" });
  const saved = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "localStorage", "IS_REACT_ACT_ENVIRONMENT"]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  if (storageDisabled) Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("storage disabled"); } });
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"));
  const render = () => act(async () => root.render(<StrictMode>{Array.from({ length: consumers }, (_, index) => <Probe key={index} index={index} />)}</StrictMode>));
  await render();
  return {
    render, originalRuntime,
    switchSite: async () => { runtime = { convexUrl: `https://target-${id}.convex.cloud`, instanceKey: `target-${id}` }; await render(); },
    resolve: (index, token = calls[index].args.sessionToken) => act(async () => calls[index].resolve(token)),
    cleanup: async () => {
      await act(async () => root.unmount());
      await act(async () => { for (const call of calls) call.resolve(call.args.sessionToken); });
      dom.window.close();
      for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    },
  };
}

test("settled cart authority is masked until the new site has resolved its own token", async () => {
  const f = await fixture(); try {
    await f.resolve(0); const token = current[0].sessionToken;
    await f.switchSite(); expect(current[0].isReady).toBe(false); expect(calls).toHaveLength(2);
    expect(calls[1].args.sessionToken).not.toBe(token);
    await f.resolve(1); expect(current[0]).toEqual({ isReady: true, sessionToken: calls[1].args.sessionToken });
  } finally { await f.cleanup(); }
});

test("different sites never share an in-flight settlement for the same shopper", async () => {
  const f = await fixture(); try {
    await f.switchSite(); expect(calls).toHaveLength(2);
    await f.resolve(0); expect(current[0].isReady).toBe(false);
    await f.resolve(1); expect(current[0].sessionToken).toBe(calls[1].args.sessionToken);
  } finally { await f.cleanup(); }
});

test("a new login for the same shopper requires fresh settlement", async () => {
  const f = await fixture(); try {
    await f.resolve(0); identity = { ...identity, sessionId: "renewed-login" }; await f.render();
    expect(current[0].isReady).toBe(false); expect(calls).toHaveLength(2);
    await f.resolve(1); expect(current[0].isReady).toBe(true);
  } finally { await f.cleanup(); }
});

test("readiness recovery cannot expose a previously settled token before revalidation", async () => {
  const f = await fixture(); try {
    await f.resolve(0); auth = { isLoading: true, isAuthenticated: false }; await f.render();
    expect(current[0].isReady).toBe(false);
    auth = { isLoading: false, isAuthenticated: true }; await f.render();
    expect(current[0].isReady).toBe(false); await f.resolve(1); expect(current[0].isReady).toBe(true);
  } finally { await f.cleanup(); }
});

test("an old request cannot settle an account round trip", async () => {
  const f = await fixture(); try {
    const originalIdentity = identity;
    identity = { ...identity, userId: "other-shopper", sessionId: "other-login" }; await f.render();
    identity = originalIdentity; await f.render();
    await f.resolve(0, "obsolete-server-token"); expect(current[0].isReady).toBe(false);
    await f.resolve(calls.length - 1); expect(current[0].isReady).toBe(true);
  } finally { await f.cleanup(); }
});

test("a replaced Convex client must settle independently even at the same site", async () => {
  const f = await fixture(); try {
    await f.resolve(0); client = {}; await f.render();
    expect(current[0].isReady).toBe(false); expect(calls).toHaveLength(2);
    await f.resolve(1); expect(current[0].isReady).toBe(true);
  } finally { await f.cleanup(); }
});

test("StrictMode and concurrent consumers share one current settlement", async () => {
  const f = await fixture({ consumers: 3 }); try {
    expect(calls).toHaveLength(1); await f.resolve(0);
    expect(current).toHaveLength(3); expect(current.every(value => value.isReady && value.sessionToken === calls[0].args.sessionToken)).toBe(true);
  } finally { await f.cleanup(); }
});

test("disagreeing identity providers never dispatch under the previous shopper's authentication", async () => {
  const f = await fixture(); try {
    await f.resolve(0);
    identity = { userId: null, sessionId: null, isLoaded: true, isSignedIn: false };
    // Clerk has signed out, while Convex still reports the old authenticated client.
    await f.render(); expect(current[0].isReady).toBe(false); expect(calls).toHaveLength(1);
    auth = { isLoading: false, isAuthenticated: false }; await f.render();
    expect(calls).toHaveLength(2); await f.resolve(1); expect(current[0].isReady).toBe(true);
    identity = { ...identity, isSignedIn: true }; await f.render();
    expect(current[0].isReady).toBe(false); expect(calls).toHaveLength(2);
  } finally { await f.cleanup(); }
});

test("storage-disabled site round trips retain only that site's in-memory basket", async () => {
  const f = await fixture({ storageDisabled: true }); try {
    await f.resolve(0); const sourceToken = current[0].sessionToken;
    await f.switchSite(); expect(calls).toHaveLength(2); expect(calls[1].args.sessionToken).not.toBe(sourceToken);
    await f.resolve(1); runtime = f.originalRuntime; await f.render();
    expect(current[0].isReady).toBe(false); expect(calls[2].args.sessionToken).toBe(sourceToken);
    await f.resolve(2); expect(current[0].sessionToken).toBe(sourceToken);
  } finally { await f.cleanup(); }
});
