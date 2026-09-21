import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const scope = { websiteKey: "studio", instanceKey: "staging", deploymentOrigin: "https://studio.convex.cloud" };
const dataScope = { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey };
const key = { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey, documentId: "draft", generation: "operator" };
const policy = { enabledPlugins: [], capabilities: ["tree.children"], disabledBlocks: [] };
function definitions(m) {
  return { scope, definitions: [1, 2].map(version => {
    const spec = { name: "composed/studio", version, title: `Studio version ${version}`, description: "Editor fixture", category: "text", role: "content", keywords: [], ai: { useFor: "Studio content", avoid: "Navigation" }, fields: [{ id: "headline", type: "text", title: `Heading v${version}`, default: `Default ${version}`, max: version === 1 ? 20 : 100 }, { id: "photo", type: "media", storage: "id" }, { id: "body", type: "richtext", default: { type: "doc", content: [] } }, { id: "services", title: "Services", type: "repeater", fields: [{ id: "title", type: "text", required: true }, { id: "description", type: "text", required: true }], default: [{ description: "Shape a clear direction", title: "Design" }] }], supports: { children: true, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{headline}", examples: [{}] };
    const value = m.encodeComposedDefinition({ spec, composition: { version: 1, root: { el: "Stack", children: [{ el: "Heading", bind: "attrs.headline" }, { el: "Slot", props: { name: "children" } }] } } });
    return { name: spec.name, version, digest: value.digest, definitionJson: value.json };
  }) };
}
const blocks = () => [1, 2].map(version => ({ id: `studio-${version}`, name: "composed/studio", version, attrs: { headline: `Saved ${version}` }, children: [] }));

test("custom schemas preserve both versions, enforce field constraints and bind resource picks and receipts", async () => {
  const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"), m = loaded.module;
  try {
    const snapshot = definitions(m), adapter = m.canonicalEditorAdapter(policy, "core", snapshot);
    const draft = { title: "Studio", blocks: blocks(), composedDefinitions: snapshot };
    const one = adapter.contract(draft.blocks[0]), two = adapter.contract(draft.blocks[1]);
    expect(one.definition.title).toBe("Studio version 1"); expect(two.definition.title).toBe("Studio version 2");
    expect(m.validateDraft(one.name, { headline: "x".repeat(21) }, one).ok).toBe(false);
    expect(m.validateDraft(two.name, { headline: "x".repeat(21) }, two).ok).toBe(true);
    expect(adapter.supportsChildren(draft.blocks[0])).toBe(true);
    expect(adapter.validate(draft)).toBeNull();
    expect(m.canonicalEditorAdapter({ ...policy, disabledBlocks: [one.name] }, "core", snapshot).validate(draft)).toContain("unavailable");
    const pick = { blockId: "studio-1", name: one.name, path: ["photo"], scope, revision: "1" };
    expect(m.applyPickerResult(pick, { scope, value: "media-id" }, pick, {}, one)).toEqual({ photo: "media-id" });
    expect(() => m.applyPickerResult(pick, { scope: { ...scope, instanceKey: "foreign" }, value: "media-id" }, pick, {}, one)).toThrow();
    expect(() => one.validateField(["photo"], { id: "media-id" })).toThrow();
    expect(() => one.validateField(["__proto__"], "bad")).toThrow();
    const request = { key, revision: 1, operation: 1, value: draft };
    const receipt = { postId: "draft", revision: 2, changed: true, digest: m.draftDigest(draft) };
    expect(m.verifiedWriteSnapshot(receipt, request).value.blocks.map(node => node.version)).toEqual([1, 2]);
    const foreign = { ...draft, composedDefinitions: { ...snapshot, scope: { ...scope, instanceKey: "foreign" } } };
    expect(() => m.verifiedWriteSnapshot({ ...receipt, digest: m.draftDigest(foreign) }, { ...request, value: foreign })).toThrow("different environment");
    expect(() => m.verifiedWriteSnapshot({ ...receipt, digest: "a".repeat(64) }, request)).toThrow();
    const removed = m.checkedDraft({ ...draft, blocks: [] });
    expect(removed.composedDefinitions).toBeUndefined();
    expect(m.draftDigest(removed)).toBe(m.canonicalContentDigest("Studio", []));
    const onlyOld = m.checkedDraft({ ...draft, blocks: [draft.blocks[0]] });
    expect(onlyOld.composedDefinitions.definitions.map(value => value.version)).toEqual([1]);
    const chosen = snapshot.definitions[1], choice = { id: "definition-id", ...chosen, title: "Studio" };
    const selected = { ...snapshot, definitions: [chosen] };
    const added = m.appendCustomBlock(draft, selected, choice, dataScope, policy);
    expect(added.draft.blocks.map(node => node.version)).toEqual([1, 2, 2]);
    expect(added.draft.composedDefinitions.definitions).toHaveLength(2);
    expect(draft.blocks).toHaveLength(2);
    expect(() => m.appendCustomBlock(draft, selected, { ...choice, version: 1 }, dataScope, policy)).toThrow("changed");
    expect(() => m.appendCustomBlock(draft, { ...selected, scope: { ...scope, deploymentOrigin: "https://foreign.convex.cloud" } }, choice, dataScope, policy)).toThrow("another site installation");
    expect(() => m.appendCustomBlock(draft, selected, choice, { ...dataScope, websiteKey: "foreign" }, policy)).toThrow("another environment");
    expect(() => m.appendCustomBlock(draft, selected, choice, dataScope, { ...policy, disabledBlocks: [chosen.name] })).toThrow("unavailable");
    expect(() => m.customBlockOptions({ scope: { ...dataScope, websiteKey: "foreign" }, page: [], isDone: true, continueCursor: "" }, dataScope)).toThrow("another environment");
  } finally { await loaded.cleanup(); }
});

test("workspace edits exact versions, removes unused schemas and inserts approved custom blocks with save/reopen", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }), previous = {};
  for (const name of ["window", "document", "navigator", "HTMLElement", "Event", "IS_REACT_ACT_ENVIRONMENT"]) {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  }
  const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"), m = loaded.module;
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("app"));
  const source = definitions(m), writes = [];
  let preferred = 2, delayedSelection, releaseSelection;
  const make = async (title, tree, revision) => {
    const selected = m.createComposedRegistry(source, scope).snapshotFor(tree);
    const composed = selected.definitions.length ? { scope, definitions: selected } : undefined;
    return { contract: "canonical-document-v1", scope: dataScope, document: { id: "draft", type: "page", title, status: "draft", path: "/draft", blocksVersion: 2, revision, blocks: tree, digest: m.canonicalContentDigest(title, tree, composed), ...(composed ? { composedDefinitions: selected } : {}) }, presentation: { packId: "core", revision: "b".repeat(64) }, policy, data: await m.resolveCanonicalDataWithDefinitions(tree, dataScope, policy, { readPage: async () => ({ page: null }) }, composed), resources: { media: {} } };
  };
  let current = await make("Studio", blocks(), 1);
  const client = { get: async () => current, save: async args => {
    expect(Object.keys(args).sort()).toEqual(["blocks", "expectedRevision", "title"]);
    expect(args.expectedRevision).toBe(current.document.revision); writes.push(args);
    current = await make(args.title, args.blocks, current.document.revision + 1);
    return { postId: "draft", revision: current.document.revision, digest: current.document.digest, changed: true };
  }, pageRevisions: async () => ({ page: [], isDone: true, continueCursor: "" }),
    listCustomBlocks: async args => {
      expect(args.expectedRevision).toBe(current.document.revision); expect(args.expectedScope).toEqual(dataScope);
      const item = source.definitions[preferred - 1];
      return { scope: dataScope, page: [{ id: "definition-id", name: item.name, title: `Studio version ${preferred}`, version: preferred, digest: item.digest }], isDone: true, continueCursor: "" };
    },
    selectCustomBlock: async args => {
      expect(args.expectedRevision).toBe(current.document.revision);
      const item = source.definitions[args.version - 1]; expect(args.expectedDigest).toBe(item.digest);
      if (delayedSelection) await new Promise(resolve => { releaseSelection = resolve; });
      return { scope, definitions: [item] };
    },
  };
  const button = text => [...document.querySelectorAll("button")].find(item => item.textContent === text);
  const click = async text => { expect(button(text)).toBeDefined(); await act(async () => button(text).click()); };
  const input = () => document.querySelector('section[aria-label="Studio version 1 content"] input') ?? document.querySelector('form[aria-label="Studio version 1 content"] input');
  const change = async value => { const field = input(); expect(field).not.toBeNull(); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(field, value); field.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  try {
    await act(async () => root.render(<m.CanonicalDocumentWorkspace documentKey={key} read={current} client={client} pickResource={async () => null} />));
    expect(document.body.textContent).toContain("Heading v1"); expect(document.body.textContent).not.toContain("Schema update required");
    await change("x".repeat(21)); expect(button("Save changes").disabled).toBe(true);
    await click("Studio version 2"); expect(document.body.textContent).toContain("Heading v2");
    await click("Studio version 1"); expect(input().value).toBe("x".repeat(21));
    await change("Edited studio"); expect(button("Save changes").disabled).toBe(false);
    await click("Save changes"); expect(writes).toHaveLength(1); expect(current.document.blocks[0].attrs.headline).toBe("Edited studio");
    expect(current.document.blocks.map(node => node.version)).toEqual([1, 2]); expect(document.body.textContent).toContain("All changes saved");
    await click("Remove selected block"); await click("Remove selected block"); await click("Save changes");
    expect(current.document.blocks).toEqual([]); expect(current.document.composedDefinitions).toBeUndefined();
    expect(writes).toHaveLength(2); expect(document.body.textContent).toContain("All changes saved");
    const chooseCustom = async () => {
      await click("Browse custom blocks");
      const select = document.querySelector('select[aria-label="Choose a custom block"]');
      await act(async () => { select.value = "definition-id"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    };
    await chooseCustom(); await click("Add custom block");
    expect(document.body.textContent).toContain("Heading v2"); expect(document.body.textContent).not.toContain("Schema update required");
    expect(writes).toHaveLength(2); await click("Save changes");
    expect(current.document.blocks).toHaveLength(1); expect(current.document.blocks[0].version).toBe(2);
    expect(current.document.blocks[0].attrs.headline).toBe("Default 2"); expect(writes).toHaveLength(3);
    expect(document.body.textContent).toContain("All changes saved");
    expect(current.document.blocks[0].attrs.services).toEqual([{ title: "Design", description: "Shape a clear direction" }]);
    preferred = 1; await chooseCustom(); await click("Add custom block"); await click("Save changes");
    expect(current.document.blocks.map(node => node.version)).toEqual([2, 1]);
    expect(new Set(current.document.blocks.map(node => node.id)).size).toBe(2);
    expect(current.document.composedDefinitions.definitions.map(item => item.version).sort()).toEqual([1, 2]);
    // An old picker response cannot alter a newly selected site/document.
    await chooseCustom(); delayedSelection = true; await click("Add custom block");
    await act(async () => root.render(<m.CanonicalDocumentWorkspace documentKey={{ ...key, generation: "new-session" }} read={current} client={client} pickResource={async () => null} />));
    await act(async () => releaseSelection());
    expect(document.body.textContent).toContain("All changes saved"); expect(button("Save changes").disabled).toBe(true);
    expect(writes).toHaveLength(4);
  } finally {
    await act(async () => root.unmount()); dom.window.close(); await loaded.cleanup();
    for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
