import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act, StrictMode } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("authorized reconnect restores local input; another operator cannot see it", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://native.test" });
  const names = ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const loaded = await loadStaged("../canonical-editor/recovery.fixture.tsx");
  const { CanonicalEditor, EditorRecoveryProvider } = loaded.module;
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("app"), root = createRoot(host);
  const key = { websiteKey: "site", instanceKey: "staging", documentId: "page", generation: "session-1" };
  const snapshot = { key, revision: 1, value: { title: "Saved", blocks: [] } };
  const adapter = { id: n => n.id, children: n => n.children ?? [], withChildren: (n, children) => ({ ...n, children }), nodes: v => v.blocks, withNodes: (v, blocks) => ({ ...v, blocks }), describe: n => n, attrs: n => n.attrs, withAttrs: (n, attrs) => ({ ...n, attrs }), title: v => v.title, withTitle: (v, title) => ({ ...v, title }) };
  let saves = 0;
  const render = (scope, shown, current = snapshot) => act(async () => root.render(
    <StrictMode><EditorRecoveryProvider scope={scope}>{shown ? <CanonicalEditor snapshot={current} adapter={adapter} authorityReady save={async () => { saves++; }} pickResource={async () => null} /> : <p>Reconnecting</p>}</EditorRecoveryProvider></StrictMode>,
  ));
  const change = title => act(async () => {
    const input = host.querySelector("input");
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, title);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  try {
    await render("operator-a/site", true); await change("Unsaved private draft");
    await render("operator-a/site", false); expect(host.querySelector("input")).toBeNull(); expect(host.textContent).not.toContain("Unsaved private draft");
    await render("operator-a/site", true, { ...snapshot, key: { ...key, generation: "session-2" } });
    expect(host.querySelector("input").value).toBe("Unsaved private draft");
    expect(host.textContent).toContain("recovered after reconnecting");
    expect(saves).toBe(0);
    await render("operator-b/site", true); expect(host.querySelector("input").value).toBe("Saved");
    await render("operator-a/site", true); expect(host.querySelector("input").value).toBe("Saved");
  } finally {
    await act(async () => root.unmount()); await loaded.cleanup(); dom.window.close();
    for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
