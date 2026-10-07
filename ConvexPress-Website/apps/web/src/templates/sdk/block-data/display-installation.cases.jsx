import { test, expect } from "bun:test";
import { act, Suspense, startTransition, useEffect, useSyncExternalStore } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { useDisplayInstallation } from "./use-display-installation";
import { readInstalledPageData, pageDataSubscription } from "./installed-page-data";
const scope = { websiteKey: "site", instanceKey: "stage" };
const source = { scope, document: { id: "page", revision: 1, blocks: [] }, policy: { enabledPlugins: [], capabilities: [], disabledBlocks: [] }, data: { contract: "canonical-data-v1", scope, dataByBlock: {} } };

test("hydration retains the focused SSR node while committing its display grant", async () => {
  let installed, settled = false;
  function Content({ data }) {
    const subscription = pageDataSubscription(data.grant);
    useSyncExternalStore(subscription.subscribe, subscription.getSnapshot, subscription.getSnapshot);
    try { readInstalledPageData(data, source.document.blocks, source.policy); }
    catch { return <p>Content unavailable</p>; }
    return <a href="#next">Continue reading</a>;
  }
  function Host() {
    installed = useDisplayInstallation(source, "anonymous");
    useEffect(() => { setTimeout(() => { settled = true; }, 20); }, []);
    return <Content data={installed.data} />;
  }
  const view = <Suspense fallback={<p>Loading</p>}><Host /></Suspense>;
  const dom = new JSDOM(`<div id="root">${renderToString(view)}</div>`, { url: "https://site.example" });
  const previous = new Map();
  for (const name of ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? false : dom.window[name] });
  }
  const { hydrateRoot } = await import("react-dom/client"), errors = [];
  const link = document.querySelector("a"); link.focus(); let root;
  try {
    // Do not use act: its batching masks the external-store synchronous update
    // racing the parent's default-priority effect state update in the browser.
    startTransition(() => { root = hydrateRoot(document.getElementById("root"), view, { onRecoverableError: error => errors.push(error.message) }); });
    const deadline = Date.now() + 3000;
    while (!settled && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    expect(settled).toBe(true);
    expect(document.querySelector("a") === link).toBe(true);
    expect(document.activeElement === link).toBe(true);
    expect(errors).toEqual([]);
    const current = installed; await act(async () => root.unmount()); root = null;
    expect(() => readInstalledPageData(current.data, source.document.blocks, source.policy)).toThrow("invalidated");
  } finally {
    await act(async () => root?.unmount()); dom.window.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
