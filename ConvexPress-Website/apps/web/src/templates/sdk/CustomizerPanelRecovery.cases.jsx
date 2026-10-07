import { act, StrictMode, useContext, useState } from "react";
import { expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createOperatorDraftRecovery } from "../../lib/auth/operatorDraftRecovery";
import { OperatorDraftContext } from "../../lib/auth/OperatorDraftContext";
import { TemplateDraftContext, EMPTY_PREVIEW } from "./customizeContext";

let snapshot, savedDraft, publishCalls, saveCalls, discardCalls, finishPublish;
let authenticated = true, allowed = true, profile = { _id: "alice" }, useGate = false;
const refs = { snapshot: "snapshot", getDraft: "getDraft", publish: "publish", saveDraft: "saveDraft", discardDraft: "discardDraft" };
mock.module("@convexpress-website/backend/generated/api", () => ({ api: { settings: { templateDrafts: refs } } }));
mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: authenticated, isLoading: !authenticated }),
  useQuery: ref => ref === refs.snapshot ? snapshot : savedDraft,
  useMutation: ref => async args => {
    if (ref === refs.publish) { publishCalls.push(args); if (finishPublish) await new Promise(resolve => { finishPublish = resolve; }); return {}; }
    if (ref === refs.saveDraft) { saveCalls.push(args); return { revision: "private-new" }; }
    discardCalls.push(args); return null;
  },
}));
mock.module("@/hooks/useCan", () => ({ useCan: () => allowed, useCapabilityAccess: () => allowed ? "allowed" : "denied" }));
mock.module("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ user: profile }) }));
mock.module("@/lib/site-runtime", () => ({ getSiteRuntime: () => ({ convexUrl: "https://test.convex.cloud", instanceKey: "staging" }) }));
const modules = [{ id: "colors", title: "Colors", fields: [{ id: "primary", label: "Primary", type: "color" }], presets: [{ id: "ink", name: "Ink preset", colors: { primary: "#445566" } }] }];
mock.module("./useTemplate", () => ({ useTemplate: () => ({ config: { active: "core" }, pack: { manifest: {} } }) }));
mock.module("./useTemplateSettings", () => ({
  CUSTOMIZE_MESSAGE: "convexpress:customize",
  useTemplateCustomizer: () => useContext(TemplateDraftContext),
  useTemplateSettings: () => { const { draft } = useContext(TemplateDraftContext); return { modules, values: draft.packId ? draft.values : snapshot?.values.settings.core ?? {} }; },
}));
mock.module("./registry", () => ({ listTemplatePacks: () => ["core", "journal"].map(id => ({ manifest: { id, name: id } })) }));
mock.module("./FooterRowsSettings", () => ({ FooterRowsSettings: () => null, FooterMenuColumnsSettings: () => null, ImageSetting: () => null }));
mock.module("sonner", () => ({ toast: { success() {}, info() {} } }));
const { default: CustomizerPanel } = await import("./CustomizerPanel");
const { OnSiteCustomizer } = await import("./OnSiteCustomizer");

function Harness({ access, version, owner = "staging:alice" }) {
  const [draft, setDraft] = useState(EMPTY_PREVIEW);
  const [open, setOpen] = useState(true);
  return <OperatorDraftContext.Provider value={access}><TemplateDraftContext.Provider value={{ draft, setDraft, open, setOpen, surfaceIds: [], readFields: [], reportReads() {}, reportSurface() {} }}>
    {useGate ? <OnSiteCustomizer /> : open && <CustomizerPanel key={version} recoveryOwner={owner} />}
  </TemplateDraftContext.Provider></OperatorDraftContext.Provider>;
}

async function environment(run, prepare = () => {}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://site.example/?customize=1" });
  const prior = {};
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Event", "IS_REACT_ACT_ENVIRONMENT"]) {
    prior[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  snapshot = { revision: "published-before", values: { active: "core", variants: {}, settings: { core: { colors: { primary: "#112233" } } } }, identity: { environmentKind: "staging" } };
  savedDraft = null; publishCalls = []; saveCalls = []; discardCalls = []; finishPublish = null;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const store = createOperatorDraftRecovery(); let session = {}; store.activate(session); let access = store.access(session);
  let version = 0;
  const render = () => act(async () => root.render(<StrictMode><Harness access={access} version={version} /></StrictMode>));
  const reopen = async () => { store.activate(null); session = {}; store.activate(session); access = store.access(session); version++; await render(); };
  const click = async text => {
    const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === text);
    expect(button).toBeDefined(); expect(button.disabled).toBe(false);
    await act(async () => button.click());
  };
  try { prepare(); await render(); await run({ store, render, reopen, click, root }); }
  finally { await act(async () => root.unmount()); useGate = false; authenticated = true; allowed = true; profile = { _id: "alice" }; dom.window.close(); for (const [key, desc] of Object.entries(prior)) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key]; } }
}

test("the panel waits for its published baseline before accepting edits that initialization would erase", () => environment(async ({ render, click }) => {
  expect(document.querySelector("#customize-colors-primary")).toBeNull();
  expect(document.body.textContent).toContain("Loading published settings");
  snapshot = { revision: "published-before", values: { active: "core", variants: {}, settings: { core: { colors: { primary: "#112233" } } } }, identity: { environmentKind: "staging" } };
  await render(); await click("Ink preset"); await render();
  expect(document.querySelector("#customize-colors-primary").value).toBe("#445566");
}, () => { snapshot = undefined; }));

test("real panel restores authored values, Undo/Redo and both revision guards without publishing automatically", () => environment(async ({ store, reopen, click }) => {
  expect(store.hasDraft()).toBe(false);
  await click("Ink preset");
  await click("Save private draft");
  expect(saveCalls[0].expectedDraftRevision).toBeNull();
  await reopen();
  expect(document.body.textContent).toContain("Recovered your unsaved changes");
  expect(document.querySelector("#customize-colors-primary").value).toBe("#445566");
  await click("Undo");
  expect(document.querySelector("#customize-colors-primary").value).toBe("#112233");
  await click("Redo");
  expect(document.querySelector("#customize-colors-primary").value).toBe("#445566");
  expect(publishCalls).toHaveLength(0);
  await click("Save private draft");
  expect(saveCalls[1].expectedDraftRevision).toBe("private-new");
  await click("Review and publish"); await click("Confirm and publish");
  expect(publishCalls[0].expectedRevision).toBe("published-before");
  expect(publishCalls[0].values.settings.core.colors.primary).toBe("#445566");
  expect(discardCalls).toEqual([{ packId: "core", expectedDraftRevision: "private-new" }]);
  expect(store.hasDraft()).toBe(false);
}));

test("a competing publication does not rebase recovered changes or permit stale publication", () => environment(async ({ store, reopen, click }) => {
  await click("Ink preset");
  snapshot = { ...snapshot, revision: "someone-else-published" };
  await reopen();
  expect(document.querySelector("#customize-colors-primary").value).toBe("#445566");
  expect(document.querySelector("[role=alert]").textContent).toContain("Someone published");
  expect([...document.querySelectorAll("button")].find(button => button.textContent === "Review and publish").disabled).toBe(true);
  expect(publishCalls).toHaveLength(0);
  expect(store.hasDraft()).toBe(true);
  await click("Close and discard");
  expect(store.hasDraft()).toBe(false);
}));

test("a late publication acknowledgement cannot close or erase the recovered editor", () => environment(async ({ store, reopen, click }) => {
  await click("Ink preset"); await click("Review and publish");
  finishPublish = true;
  await click("Confirm and publish");
  const finishOld = finishPublish;
  await reopen();
  await act(async () => finishOld());
  expect(document.querySelector("[aria-label='Customize template']")).not.toBeNull();
  expect(store.hasDraft()).toBe(true);
  expect(discardCalls).toHaveLength(0);
}));

test("the actual on-site gate refuses cached profile authority until backend authentication completes", () => environment(async ({ render }) => {
  useGate = true; authenticated = false;
  await render();
  expect(document.querySelector("[aria-label='Customize template']")).toBeNull();
  authenticated = true;
  await render();
  expect(document.querySelector("[aria-label='Customize template']")).not.toBeNull();
  allowed = false;
  await render();
  expect(document.querySelector("[aria-label='Customize template']")).toBeNull();
}));

test("picking the same surface again restores its field focus and opens its group", () => environment(async ({ click }) => {
  const oldCss = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape: value => value } });
  const field = document.querySelector('[data-customize-field="colors.primary"]');
  field.scrollIntoView = () => {};
  const surface = document.createElement("button");
  surface.dataset.customize = "colors.primary";
  surface.textContent = "Rendered primary surface";
  document.body.append(surface);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      field.closest("details").open = false;
      surface.focus();
      await click("Select a setting on the page");
      await act(async () => surface.click());
      expect(document.activeElement).toBe(field);
      expect(field.closest("details").open).toBe(true);
      expect(document.body.textContent).not.toContain("Cancel selecting");
    }
  } finally {
    surface.remove();
    if (oldCss) Object.defineProperty(globalThis, "CSS", oldCss); else delete globalThis.CSS;
  }
}));
