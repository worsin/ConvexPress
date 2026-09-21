import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../blocks/schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const scope = { websiteKey: "studio", instanceKey: "staging", deploymentOrigin: "https://stage.convex.cloud" };

async function setup(overrides = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const made = m.starterDefinition("Studio services", "studio-services");
  let writes = [], requests = [], opened = [], current;
  const write = async args => {
    writes.push(args); const value = m.checkedNew(args.definitionJson, "composed/studio-services");
    current = { id: "definition", name: value.definition.spec.name, version: 1, generation: 1, lastVersion: 1, activeVersion: null, status: "draft", versionStatus: "draft", definitionJson: value.json, digest: value.digest };
    return { id: current.id, name: current.name, version: 1, generation: 1, digest: current.digest };
  };
  const client = { compose: async args => { requests.push(args); return { definitionJson: made.json, digest: made.digest, fingerprint: "trusted-fingerprint" }; }, create: write, accept: write, get: async () => current,
    options: async () => ({ page: [{ id: "photo", title: "Workshop photograph" }], cursor: null }), ...overrides };
  let props = { client, scope, canAi: true, canMedia: true, disabled: false, onCreated: id => opened.push(id), onCancel: () => {} };
  const render = async (next = {}) => { props = { ...props, ...next };await act(async () => root.render(<m.NewDefinition {...props} />)); };
  const button = name => [...document.querySelectorAll("button")].find(node => node.textContent === name);
  const click = async name => { expect(button(name)).toBeDefined();await act(async () => button(name).click()); };
  const field = name => [...document.querySelectorAll("label")].find(node => node.textContent === name)?.control;
  const input = async (name, value) => { const el = field(name);expect(el).toBeTruthy();await act(async () => { const proto = el.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);el.dispatchEvent(new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };
  await render();
  const prepare = async () => { await input("Block name", "studio-services");await input("Describe your block", "Create a service grid with editable content"); };
  return { m, client, made, render, writes, requests, opened, button, click, field, input, prepare,
    close: async () => { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); } };
}

test("AI proposal is editable, carries exact selection and scope, and creates one verified draft", async () => {
  const f = await setup();
  try {
    await f.prepare();await f.input("Design template", "journal");
    await f.click("Choose media");await f.click("Add Workshop photograph");
    expect(f.button("Add Workshop photograph").disabled).toBe(true);
    await f.click("Generate block proposal");
    expect(f.writes).toHaveLength(0);
    expect(f.requests[0]).toEqual({ name: "composed/studio-services", packId: "journal", expectedScope: scope, resources: { products: [], media: ["photo"] }, prompt: "Create a service grid with editable content" });
    expect(document.body.textContent).toContain("Unsaved proposal");
    const changed = JSON.parse(f.field("Definition source").value);changed.spec.title = "Reviewed studio services";
    await f.input("Definition source", JSON.stringify(changed));
    await f.click("Save reviewed draft");
    expect(f.writes).toHaveLength(1);expect(f.writes[0].expectedFingerprint).toBe("trusted-fingerprint");expect(f.writes[0].expectedScope).toEqual(scope);
    expect(JSON.parse(f.writes[0].definitionJson).spec.title).toBe("Reviewed studio services");expect(f.opened).toEqual(["definition"]);
  } finally { await f.close(); }
});

test("manual creation needs no AI; identity and invalid source block saving", async () => {
  const f = await setup();
  try {
    await f.render({ canAi: false });expect(f.button("Generate block proposal")).toBeUndefined();
    await f.input("Block name", "studio-services");await f.input("Block title", "Studio services");await f.click("Start with a heading");
    const source = f.field("Definition source").value;
    await f.input("Definition source", "{}");expect(f.button("Save reviewed draft").disabled).toBe(true);
    const renamed = JSON.parse(source);renamed.spec.name = "composed/another-block";
    await f.input("Definition source", JSON.stringify(renamed));expect(f.button("Save reviewed draft").disabled).toBe(true);
    expect(f.writes).toHaveLength(0);
    await f.input("Definition source", source);await f.click("Save reviewed draft");
    expect(f.writes).toHaveLength(1);expect(Object.keys(f.writes[0])).toEqual(["definitionJson"]);expect(f.opened).toEqual(["definition"]);
  } finally { await f.close(); }
});

test("an uncertain creation keeps source and disables duplicate write attempts", async () => {
  let attempts = 0;
  const f = await setup({ accept: async () => { attempts++;throw Error("Lost receipt"); } });
  try {
    await f.prepare();await f.click("Generate block proposal");const source = f.field("Definition source").value;
    await f.click("Save reviewed draft");
    expect(document.body.textContent).toContain("Creation could not be confirmed");expect(f.field("Definition source").value).toBe(source);
    expect(f.button("Save reviewed draft").disabled).toBe(true);expect(f.button("Discard proposal").disabled).toBe(true);
    await f.click("Save reviewed draft");expect(attempts).toBe(1);expect(f.opened).toHaveLength(0);
    expect(f.button("Close review").disabled).toBe(false);
  } finally { await f.close(); }
});

test("revocation rejects late generation and prevents accepting an existing proposal", async () => {
  let release;
  const f = await setup({ compose: () => new Promise(resolve => { release = resolve; }) });
  try {
    await f.prepare();await f.click("Generate block proposal");
    await f.render({ canAi: false });
    await act(async () => release({ definitionJson: f.made.json, digest: f.made.digest, fingerprint: "valid" }));
    expect(f.field("Definition source")).toBeUndefined();expect(f.writes).toHaveLength(0);
    await f.render({ canAi: true });await f.click("Generate block proposal");
    await act(async () => release({ definitionJson: f.made.json, digest: f.made.digest, fingerprint: "valid" }));
    await f.render({ canAi: false });expect(f.button("Save reviewed draft").disabled).toBe(true);expect(f.field("Definition source").disabled).toBe(true);
    await f.click("Save reviewed draft");expect(f.writes).toHaveLength(0);
  } finally { await f.close(); }
});

test("a mismatched provider digest is rejected before editing or saving", async () => {
  const f = await setup();
  try {
    f.client.compose = async () => ({ definitionJson: f.made.json, digest: "forged", fingerprint: "valid" });
    await f.prepare();await f.click("Generate block proposal");
    expect(document.body.textContent).toContain("No proposal could be verified");expect(f.field("Definition source")).toBeUndefined();expect(f.writes).toHaveLength(0);
    expect(f.field("Describe your block").value).toContain("service grid");
  } finally { await f.close(); }
});

test("missing provider configuration explains recovery and retains the unsaved description", async () => {
 const f=await setup({compose:async()=>{throw {data:{code:"CONFIGURATION_ERROR",message:"private provider detail"}};}});
 try {await f.prepare();const prompt=f.field("Describe your block").value;await f.click("Generate block proposal");expect(document.body.textContent).toContain("Configure an AI provider and API key in Settings > AI");expect(document.body.textContent).not.toContain("private provider detail");expect(f.field("Describe your block").value).toBe(prompt);expect(f.writes).toHaveLength(0);}finally{await f.close();}
});
