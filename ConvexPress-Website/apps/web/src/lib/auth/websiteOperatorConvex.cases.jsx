import { expect, mock, test } from "bun:test";
import { act, useEffect } from "react";
import { JSDOM } from "jsdom";
import { useConvexAuth } from "convex/react";

mock.module("./clerk", () => ({ useAuth: () => ({ isLoaded: true, userId: null }) }));
mock.module("convex/react-clerk", () => ({ ConvexProviderWithClerk: () => null }));
const { SessionBoundConvexProvider } = await import("./SessionBoundConvexProvider");
const { useWebsiteOperator } = await import("./WebsiteOperatorContext");

test("real Convex auth provider keeps accepted same-owner renewal mounted and supplies the current token", async () => {
  const bridge = { endpoint: "http://127.0.0.1:51234/convexpress/website-editing", key: "de".repeat(32), expiresAt: Date.now() + 600000 };
  const dom = new JSDOM("<div id='root'></div>", { url: `https://site.example/?customize=1#${new URLSearchParams({ "cp-customize": "ab".repeat(32), "cp-desktop": JSON.stringify(bridge) })}` });
  const prior = {};
  for (const key of ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"]) {
    prior[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  window.__CONVEXPRESS_SITE__ = { convexUrl: "https://db.convex.cloud", convexSiteUrl: "https://db.convex.site", instanceKey: "one:staging" };
  const oldFetch = globalThis.fetch;
  const originalNow = Date.now;
  let exchanges = 0, controls, tokenFetcher, mounts = 0, clears = 0;
  globalThis.fetch = async url => String(url).includes("website-editing") ? Response.json({ code: "cd".repeat(32) }) : Response.json({ token: `token-${++exchanges}`, userId: "alice", expiresAt: Date.now() + 240000, instanceKey: "one:staging" });
  const client = {
    setAuth(fetcher, callback) { tokenFetcher = fetcher; queueMicrotask(() => callback(true)); },
    clearAuth() { clears++; },
  };
  function Editor() { useEffect(() => { mounts++; }, []); return <input defaultValue="authored draft" />; }
  function Gate() { controls = useWebsiteOperator(); return useConvexAuth().isAuthenticated ? <Editor /> : null; }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(<SessionBoundConvexProvider client={client}><Gate /></SessionBoundConvexProvider>));
    const element = document.querySelector("input");
    const baseline = { mounts, clears };
    expect(element).not.toBeNull();
    await act(async () => controls.reconnect());
    expect(exchanges).toBe(2);
    expect({ mounts, clears }).toEqual(baseline);
    expect(element.isConnected).toBe(true);
    expect(await tokenFetcher({ forceRefreshToken: false })).toBe("token-2");
    const advanced = Date.now() + 200000;
    Date.now = () => advanced;
    let refreshed;
    await act(async () => { refreshed = await tokenFetcher({ forceRefreshToken: true }); });
    expect(refreshed).toBe("token-3");
    expect({ mounts, clears }).toEqual(baseline);
    expect(element.isConnected).toBe(true);
  } finally {
    Date.now = originalNow;
    await act(async () => root.unmount()); globalThis.fetch = oldFetch; dom.window.close();
    for (const [key, desc] of Object.entries(prior)) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key]; }
  }
});
