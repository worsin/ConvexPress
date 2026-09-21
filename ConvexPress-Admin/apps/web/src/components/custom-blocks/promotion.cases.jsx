import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../blocks/schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const source = m.starterDefinition("Services", "services");
  let saved = { id: "definition", name: source.definition.spec.name, generation: 2, version: 1, lastVersion: 1, activeVersion: 1, status: "active", versionStatus: "active", definitionJson: source.json, digest: source.digest };
  let exports = 0, confirms = 0, inspections = 0, installed = false, loseAck = false, locked = false, canConfirm = true, disabled = false;
  let exportHook, inspectHook;
  const onLocked = value => { locked = value; };
  const base = () => ({ id: saved.id, version: saved.version, expectedGeneration: saved.generation, expectedDigest: saved.digest, targetName: "blocks/services" });
  const client = {
    exportPackage: async args => {
      exports++;expect(args).toEqual(base());
      const package_ = m.prepareBlockPromotion(source.json, source.digest, args.targetName);
      const result = { packageJson: package_.json, packageDigest: package_.bundle.packageDigest, targetName: args.targetName, generation: saved.generation, version: saved.version, digest: saved.digest };
      return exportHook ? exportHook(result) : result;
    },
    inspect: async args => {
      inspections++;
      if (inspectHook) return inspectHook(args);
      return { targetName: args.targetName, generation: saved.generation, state: saved.status === "promoted" ? "promoted" : installed ? "ready" : "not-installed" };
    },
    confirm: async args => {
      confirms++;expect(args.expectedGeneration).toBe(2);expect(args.expectedDigest).toBe(source.digest);
      saved = { ...saved, status: "promoted", generation: 3 };
      if (loseAck) throw Error("Lost acknowledgement");
      return { id: saved.id, targetName: args.targetName, version: saved.version, digest: saved.digest, generation: saved.generation, changed: true };
    },
  };
  const props = () => ({ saved, client, canConfirm, disabled, onLocked, onConfirmed: async () => { await render(); } });
  const render = async () => root.render(<m.PromotionPanel {...props()} />);
  const button = text => [...document.querySelectorAll("button")].find(node => node.textContent === text);
  const click = async text => { expect(button(text)).toBeDefined();await act(async () => button(text).click()); };
  const verify = async () => { const input = document.querySelector('input[type="checkbox"]');expect(input).toBeTruthy();await act(async () => input.click()); };
  const cleanup = async () => { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); };
  return { m, dom, root, source, client, props, render, button, click, verify, cleanup, counters: () => ({ exports, confirms, inspections, locked }), setInstalled: value => { installed = value; }, setLoseAck: value => { loseAck = value; }, setExportHook: value => { exportHook = value; }, setInspectHook: value => { inspectHook = value; }, setDisabled: value => { disabled = value; }, setCanConfirm: value => { canConfirm = value; }, saved: () => saved };
}

test("export review checks integrity, does not submit on Enter, and locks confirmation behind installation and Website verification", async () => {
  const f = await fixture();
  try {
    await act(f.render);
    await act(async () => document.querySelector("form").dispatchEvent(new f.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    expect(f.counters().exports).toBe(0);
    await f.click("Prepare SDK export");expect(f.counters().locked).toBe(true);expect(f.button("Confirm SDK promotion")).toBeUndefined();
    await f.click("Check installation status");expect(document.body.textContent).toContain("not installed");expect(f.counters().confirms).toBe(0);
    f.setInstalled(true);await f.click("Check installation status");expect(f.button("Confirm SDK promotion").disabled).toBe(true);
    await f.verify();expect(f.button("Confirm SDK promotion").disabled).toBe(false);
    await f.click("Confirm SDK promotion");expect(f.counters().confirms).toBe(1);expect(f.saved().status).toBe("promoted");
    expect(f.counters().inspections).toBe(3);
  } finally { await f.cleanup(); }
});

test("a lost acknowledgement prevents replay and status readback recovers the same operation", async () => {
  const f = await fixture();f.setInstalled(true);f.setLoseAck(true);
  try {
    await act(f.render);await f.click("Prepare SDK export");await f.click("Check installation status");await f.verify();
    await f.click("Confirm SDK promotion");expect(document.body.textContent).toContain("result is unverified");
    expect(f.button("Confirm SDK promotion").disabled).toBe(true);expect(f.button("Close promotion review").disabled).toBe(true);
    await f.click("Confirm SDK promotion");expect(f.counters().confirms).toBe(1);
    await f.click("Check installation status");expect(f.counters().confirms).toBe(1);expect(f.saved().status).toBe("promoted");
  } finally { await f.cleanup(); }
});

test("tampered export, stale installation and lost confirmation authority never mutate", async () => {
  const f = await fixture();
  try {
    f.setExportHook(value => ({ ...value, digest: "f".repeat(64) }));
    await act(f.render);await f.click("Prepare SDK export");expect(f.button("Download SDK package")).toBeUndefined();expect(document.body.textContent).toContain("could not be verified");
    f.setExportHook(undefined);await f.click("Prepare SDK export");
    f.setInspectHook(async args => ({ state: "conflict", generation: 3, targetName: args.targetName }));
    await f.click("Check installation status");expect(document.body.textContent).toContain("definition changed");expect(f.button("Confirm SDK promotion")).toBeUndefined();
    await f.click("Close promotion review");f.setInspectHook(undefined);f.setInstalled(true);
    await f.click("Prepare SDK export");await f.click("Check installation status");await f.verify();
    f.setCanConfirm(false);await act(f.render);expect(f.button("Confirm SDK promotion").disabled).toBe(true);
    await f.click("Confirm SDK promotion");expect(f.counters().confirms).toBe(0);
  } finally { await f.cleanup(); }
});

test("late exports after permission loss are discarded and download failures retain the package", async () => {
  const f = await fixture();let release;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  try {
    f.setExportHook(value => new Promise(resolve => { release = () => resolve(value); }));
    await act(f.render);await f.click("Prepare SDK export");
    f.setDisabled(true);await act(f.render);await act(async () => release());
    expect(f.button("Download SDK package")).toBeUndefined();expect(f.counters().confirms).toBe(0);
    f.setDisabled(false);f.setExportHook(undefined);await act(f.render);await f.click("Prepare SDK export");
    URL.createObjectURL = () => { throw Error("Download unavailable"); };
    await f.click("Download SDK package");expect(document.body.textContent).toContain("reviewed export is retained");expect(f.button("Check installation status")).toBeDefined();
  } finally { URL.createObjectURL = create;URL.revokeObjectURL = revoke;await f.cleanup(); }
});

test("workbench promotion reviews prevent conflicting edits and stay hidden without promote authority", async () => {
  const f = await fixture(), onLocked = () => {};
  const client = { promotion: f.client, get: async () => f.saved(), history: async () => ({ versions: [], nextBeforeVersion: null }) };
  try {
    const render = canPromote => f.root.render(<f.m.DefinitionWorkbench id="definition" client={client} canPromote={canPromote} canEdit canApprove onLocked={onLocked} />);
    await act(async () => render(false));expect(f.button("Prepare SDK export")).toBeUndefined();
    await act(async () => render(true));await f.click("Prepare SDK export");
    expect(f.button("Edit as new version").disabled).toBe(true);expect(f.button("Review revocation").disabled).toBe(true);expect(f.button("Reload latest version").disabled).toBe(true);
    await f.click("Close promotion review");expect(f.button("Edit as new version").disabled).toBe(false);
  } finally { await f.cleanup(); }
});
