import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
test("real style control saves explicitly, preserves fallback choices, and obeys edit locks", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://native.test" });
  const names = ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const loaded = await loadStaged("../canonical-editor/presentation.fixture.ts");
  const { CanonicalEditor, canonicalEditorAdapter } = loaded.module;
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("app"), root = createRoot(host), saves = [];
  const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
  const journal = canonicalEditorAdapter(policy, "journal"), core = canonicalEditorAdapter(policy, "core");
  const key = { websiteKey: "study", instanceKey: "staging", documentId: "page", generation: "operator" };
  const value = { title: "An invitation", blocks: [journal.createBlock("core/cta-band")] };
  let props = { authorityReady: true, snapshot: { key, revision: 1, value }, adapter: journal, pickResource: async () => null,
    save: async request => { saves.push(request); return { key, revision: request.revision + 1, value: request.value }; } };
  const render = () => act(async () => root.render(<CanonicalEditor {...props} />));
  const select = () => { const label = [...host.querySelectorAll("label")].find(el => el.textContent === "Block style"); return label ? document.getElementById(label.htmlFor) : null; };
  const choose = value => act(async () => { const input = select(); input.value = value; input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  const save = () => [...host.querySelectorAll("button")].find(el => el.textContent === "Save changes");
  try {
    await render();
    expect(select().value).toBe("default");
    await choose("inset");
    expect(select().value).toBe("inset"); expect(saves).toHaveLength(0);
    await act(async () => save().click());
    expect(saves).toHaveLength(1); expect(saves[0].value.blocks[0].style).toBe("inset");
    props = { ...props, snapshot: { key, revision: 2, value: saves[0].value }, adapter: core };
    await render();
    expect(select().value).toBe("inset"); expect(host.textContent).toContain("This template displays the default style");
    expect(save().disabled).toBe(true); expect(saves).toHaveLength(1);
    props = { ...props, contentLocked: true }; await render();
    expect(select().disabled).toBe(true);
    await choose("default"); expect(save().disabled).toBe(true);
    props = { ...props, contentLocked: false }; await render();
    await choose("default");
    expect(save().disabled).toBe(false);
    await act(async () => save().click());
    expect(saves).toHaveLength(2); expect(saves[1].value.blocks[0].style).toBe("default");
    expect(saves[1].revision).toBe(2);
  } finally {
    await act(async () => root.unmount()); await loaded.cleanup(); dom.window.close();
    for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
