import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
async function setup() {
  const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost", pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const names = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLButtonElement", "Element", "Node", "DocumentFragment", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const loaded = await loadStaged("../canonical-editor/ai-proposal.fixture.ts"), m = loaded.module;
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("app"));
  const scope = { websiteKey: "studio", instanceKey: "staging" }, key = { ...scope, documentId: "page", generation: "native-one" };
  const policy = { enabledPlugins: [], capabilities: ["tree.children"], disabledBlocks: [] };
  const make = async (title, blocks, revision) => ({ contract: "canonical-document-v1", scope,
    document: { id: "page", type: "page", title, status: "draft", path: "/", blocksVersion: 2, revision, blocks, digest: m.canonicalContentDigest(title, blocks) },
    presentation: { packId: "core", revision: "b".repeat(64) }, policy,
    data: await m.resolveCanonicalData(blocks, scope, policy, async () => ({ page: null })), resources: { media: {} },
  });
  let source = await make("Original page", [], 7), refreshes = 0;
  const generated = { title: "Studio proposal", fingerprint: "f".repeat(64), blocks: m.validateCanonicalTree([{ id: "group", name: "core/group", version: 1, attrs: {}, children: [{ id: "heading", name: "core/heading", version: 2, attrs: {} }] }]) };
  const calls = { generate: [], preview: [], apply: [], display: [], editing: [] };
  const client = {
    get: async () => source,
    generateAi: async args => { calls.generate.push(args); return generated; },
    previewAi: async args => { calls.preview.push(args); expect(args.expectedRevision).toBe(7); return make(args.title, args.blocks, 8); },
    applyAi: async args => {
      calls.apply.push(args); source = await make(args.title, args.blocks, 8);
      // Deliver a reactive result before the mutation receipt.
      root.render(<m.CanonicalAiComposer {...props} source={source} />);
      await new Promise(resolve => setTimeout(resolve, 0));
      return { postId: "page", revision: 8, digest: source.document.digest, changed: true };
    },
  };
  const props = { documentKey: key, source, client, disabled: false, pickResource: async () => null,
    onEditingChange: value => calls.editing.push(value), onSaved: async () => { refreshes++; }, onPreview: (value, request) => calls.display.push({ value, request }) };
  const render = async next => act(async () => root.render(<m.CanonicalAiComposer {...props} {...next} />));
  const button = text => [...document.querySelectorAll("button")].find(node => node.textContent === text);
  const click = async text => { expect(button(text)).toBeDefined(); await act(async () => button(text).click()); };
  const change = async (input, value) => act(async () => {
    const prototype = input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const start = async () => { await click("Create with AI"); await change(document.querySelector("textarea"), "A warm studio introduction"); await click("Generate proposal"); };
  const cleanup = async () => { await act(async () => root.unmount()); await loaded.cleanup(); dom.window.close(); for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } };
  return { m, root, props, render, button, click, change, start, calls, generated, make, client, key, source, cleanup, refreshes: () => refreshes };
}

test("proposal is editable, previews unsaved content and accepts once even when the reactive save arrives first", async () => {
  const f = await setup();
  try {
    await f.render({ disabled: true }); expect(f.button("Create with AI").disabled).toBe(true);
    await f.render({ disabled: false }); await f.start();
    expect(f.calls.generate).toHaveLength(1); expect(f.calls.apply).toHaveLength(0);
    expect(document.querySelector('nav[aria-label="Page outline"]').textContent).toContain("Heading");
    const title = document.querySelector('section[aria-label="Document editor"] input');
    await f.change(title, "Our considered studio"); await f.click("Preview proposal");
    expect(f.calls.display).toHaveLength(1); expect(f.calls.display[0].value.document.title).toBe("Our considered studio");
    expect(f.calls.display[0].request.expectedRevision).toBe(7); expect(f.calls.apply).toHaveLength(0);
    await f.click("Apply proposal"); expect(f.calls.apply).toHaveLength(1);
    expect(f.calls.apply[0].title).toBe("Our considered studio"); expect(f.calls.apply[0].expectedFingerprint).toBe("f".repeat(64));
    expect(f.refreshes()).toBe(1); expect(f.button("Apply proposal")).toBeUndefined();
    expect(f.calls.editing.at(-1)).toBe(false);
  } finally { await f.cleanup(); }
});

test("closing or switching the saved revision cancels late generation without loading or writing it", async () => {
  const f = await setup();
  try {
    let resolve;
    f.client.generateAi = async args => { f.calls.generate.push(args); return new Promise(done => { resolve = done; }); };
    await f.render(); await f.start(); expect(f.calls.generate).toHaveLength(1);
    await f.click("Cancel"); await act(async () => resolve(f.generated));
    expect(f.calls.preview).toHaveLength(0); expect(f.calls.apply).toHaveLength(0);
    await f.start();
    await f.render({ source: await f.make("Another edit", [], 8) });
    await act(async () => resolve(f.generated));
    expect(f.calls.preview).toHaveLength(0); expect(f.calls.apply).toHaveLength(0);
    expect(f.button("Apply proposal")).toBeUndefined();
  } finally { await f.cleanup(); }
});

test("proposal editor never claims or replaces the normal editor recovery lease", async () => {
  const f = await setup();
  let store;
  function Capture() { store = f.m.useEditorRecovery(); return null; }
  const render = async () => act(async () => f.root.render(<f.m.EditorRecoveryProvider scope="operator-studio"><Capture /><f.m.CanonicalAiComposer {...f.props} /></f.m.EditorRecoveryProvider>));
  try {
    await render();
    const snapshot = { key: f.key, revision: 7, value: { title: "Original page", blocks: [] } };
    const owner = store.open(snapshot); owner.activate(); owner.retain({ ...owner.state, dirty: true, draft: { title: "Retained manual draft", blocks: [] } });
    await f.start(); await f.click("Discard proposal");
    expect(store.open(snapshot).state.draft.title).toBe("Retained manual draft");
    // The original owner must still hold the lease after the proposal unmounts.
    owner.retain({ ...owner.state, dirty: true, draft: { title: "Continued manual draft", blocks: [] } });
    expect(store.open(snapshot).state.draft.title).toBe("Continued manual draft");
    expect(f.calls.apply).toHaveLength(0);
  } finally { await f.cleanup(); }
});

test("configuration failures and mismatched preview content never expose provider diagnostics or enable acceptance", async () => {
  const f = await setup();
  try {
    f.client.generateAi = async () => { throw { data: { code: "CONFIGURATION_ERROR", message: "private-provider-key" } }; };
    await f.render(); await f.start();
    expect(document.body.textContent).toContain("Set up your AI provider"); expect(document.body.textContent).not.toContain("private-provider-key");
    expect(f.button("Apply proposal")).toBeUndefined(); await f.click("Cancel");
    f.client.generateAi = async () => f.generated;
    f.client.previewAi = async () => f.make("Wrong content", [], 8);
    await f.start(); expect(f.button("Apply proposal")).toBeUndefined(); expect(f.calls.apply).toHaveLength(0);
  } finally { await f.cleanup(); }
});

test("workspace locks the saved editor during review, tracks unsaved review and removes AI on permission loss", async () => {
  const f = await setup(), dirty = [];
  const render = async canAi => act(async () => f.root.render(<f.m.CanonicalDocumentWorkspace
    documentKey={f.key} read={f.source} client={f.client} pickResource={async () => null}
    canAi={canAi} onAiPreview={f.props.onPreview} onDirtyChange={value => dirty.push(value)} />));
  try {
    await render(false); expect(f.button("Create with AI")).toBeUndefined();
    await render(true);
    expect(f.button("Create with AI").closest('[role="tabpanel"]').hidden).toBe(true);
    await f.click("Create");
    expect(f.button("Create with AI").closest('[role="tabpanel"]').hidden).toBe(false);
    await f.start();
    expect(f.calls.generate).toHaveLength(1);
    expect(f.button("Apply proposal")).toBeDefined();
    expect(document.querySelector('section[aria-label="Document editor"] fieldset').disabled).toBe(true);
    expect(dirty.at(-1)).toBe(true);
    await f.click("Discard proposal");
    expect(document.querySelector('section[aria-label="Document editor"] fieldset').disabled).toBe(false);
    expect(dirty.at(-1)).toBe(false);
    await f.start(); await render(false);
    expect(f.button("Create with AI")).toBeUndefined(); expect(f.button("Apply proposal")).toBeUndefined();
    expect(dirty.at(-1)).toBe(false); expect(f.calls.apply).toHaveLength(0);
  } finally { await f.cleanup(); }
});


test("selected products and media accompany generation and preview, with removable labels and late picker cancellation", async () => {
  const f = await setup();
  let release;
  const selections = [
    {scope:f.source.scope,value:"roast-one",label:"Daybreak roast"},
    {scope:f.source.scope,value:"roast-two",label:"Evening roast"},
    {scope:f.source.scope,value:"studio-media",label:"Studio photograph"},
  ];
  const pickResource = async () => selections.shift() ?? new Promise(resolve => {release=resolve;});
  const source = {...f.source,policy:{...f.source.policy,enabledPlugins:["commerce"]}};
  try {
    await f.render({source,pickResource}); await f.click("Create with AI");
    await f.click("Choose a product"); await f.click("Choose a product"); await f.click("Choose media");
    expect(document.body.textContent).toContain("Daybreak roast"); expect(document.body.textContent).toContain("Studio photograph");
    const remove=[...document.querySelectorAll("button")].find(node=>node.getAttribute("aria-label")==="Remove Evening roast");
    await act(async()=>remove.click());
    await f.change(document.querySelector("textarea"),"Compare our selected roast and add the studio image");
    await f.click("Generate proposal");
    const resources={products:["roast-one"],media:["studio-media"]};
    expect(f.calls.generate[0].resources).toEqual(resources);expect(f.calls.preview[0].resources).toEqual(resources);
    await f.click("Preview proposal");expect(f.calls.display[0].request.resources).toEqual(resources);
    await f.click("Discard proposal"); await f.click("Create with AI");
    expect(document.body.textContent).not.toContain("Daybreak roast");
    await f.click("Choose media"); await f.click("Cancel");
    await act(async()=>release({scope:f.source.scope,value:"late-media",label:"Late image"}));
    await f.click("Create with AI"); expect(document.body.textContent).not.toContain("Late image");
    expect(f.calls.apply).toHaveLength(0);
  } finally {await f.cleanup();}
});
