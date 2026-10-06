import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { anyApi, getFunctionName } from "convex/server";
const require = createRequire(import.meta.url);
const { mock } = require("bun:test") as { mock: { module(path: string, factory: () => unknown): void } };
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost", pretendToBeVisual: true });
for (const name of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "Element", "Node", "MutationObserver", "navigator", "localStorage", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: Reflect.get(dom.window, name) });
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
const { act, createContext, useContext } = await import("react");
const { createRoot } = await import("react-dom/client");
const controller = { query: async () => { throw new Error("Unexpected receipt query"); } };
const site = { query: async () => { throw new Error("Must not use the site client"); } };
const Client = createContext(site);
let allowed = true;
const previews: any[] = [];
const environments = ["other", "stage", "live"].map((id) => ({ instanceId: id, instanceKey: `site:${id}`, websiteKey: "site", kind: id === "live" ? "live" : "staging", deploymentOrigin: `https://${id}.invalid`, schemaVersion: "1", provisioning: "ready", compatibility: "compatible", label: id }));
const connections = environments.map((e) => ({ instanceId: e.instanceId, connections: [{ connectionId: `${e.instanceId}-connection`, name: e.instanceId, isActive: true, status: "connected", hasCredentials: true }] }));
let shell: any = { operator: { id: "operator" }, pending: false, selectedWebsite: { websiteId: "website", websiteKey: "site" }, selectedOrganization: { organizationId: "org" }, selectedBusiness: { businessId: "business" }, selectedEnvironment: environments[1] };
mock.module("@control/convex/_generated/api", () => ({ api: anyApi }));
mock.module("../ControlShellContext", () => ({ useControlShell: () => shell, useControlClient: () => controller }));
mock.module("../ControlAccessProvider", () => ({ useControlAccessChecks: (args: any) => args === "skip" ? undefined : args.checks.map(() => ({ allowed })) }));
mock.module("convex/react", () => ({
  ConvexProvider: ({ client, children }: any) => <Client.Provider value={client}>{children}</Client.Provider>,
  useConvex: () => { const client = useContext(Client); assert.equal(client, controller, "review must use controller client"); return client; },
  useQuery: (fn: any) => { assert.equal(useContext(Client), controller, "environment queries must use controller client"); const name = getFunctionName(fn); if (name === "websiteInstances:list") return environments; if (name === "connections/queries:listForWebsite") return connections; throw new Error(name); },
  useAction: (fn: any) => { assert.equal(useContext(Client), controller, "promotion actions must use controller client"); return async (args: any) => { assert.equal(getFunctionName(fn), "contentPromotion/review:preview"); previews.push(args); throw new Error("Stop after observing preview request"); }; },
}));
const { PromotionReviewPanel } = await import("./PromotionReviewPanel");
const root = createRoot(document.getElementById("app")!);
const props = { websiteId: "website", websiteKey: "site", organizationId: "org", businessId: "business", environments, connections, appearanceSourceInstanceId: "stage" } as any;
function button(text: string) { const b = [...document.querySelectorAll("button")].find(b => b.textContent === text); assert.ok(b, `Missing ${text}`); return b; }
function checkbox(text: string) { const label = [...document.querySelectorAll("label")].find(l => l.textContent?.trim() === text); assert.ok(label, `Missing ${text}`); return label.querySelector("input")!; }
async function click(text: string) { await act(async () => button(text).click()); }
await act(async () => root.render(<Client.Provider value={controller}><PromotionReviewPanel {...props} /></Client.Provider>));
assert.equal(checkbox("Include template appearance").checked, true);
assert.equal(checkbox("Include template settings and homepage presentation").checked, false);
assert.equal((document.querySelector("select") as HTMLSelectElement).value, "stage-connection");
assert.equal(button("Create preview").disabled, false);
await click("Create preview");
assert.equal(previews.length, 1);
assert.equal(previews[0].selection.includeAppearance, true);
assert.equal(previews[0].selection.includePresentation, false);
assert.equal(previews[0].sourceConnectionId, "stage-connection");
assert.equal(previews[0].targetConnectionId, "live-connection");
await act(async () => checkbox("Include template appearance").click());
assert.equal(button("Create preview").disabled, true);
await click("Start new review");
assert.equal(checkbox("Include template appearance").checked, true);
await act(async () => { const select = document.querySelector("select")!; select.value = "other-connection"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
assert.equal(checkbox("Include template appearance").checked, true);
await click("Create preview");
assert.equal(previews[1].sourceConnectionId, "other-connection");
allowed = false;
await act(async () => root.render(<Client.Provider value={controller}><PromotionReviewPanel {...props} /></Client.Provider>));
assert.match(document.body.textContent!, /permission to operate production/);
assert.equal([...document.querySelectorAll("button")].some(b => b.textContent === "Create preview"), false);
await act(async () => root.unmount());
allowed = true;
const { TemplatePromotionPanel } = await import("../../components/appearance/TemplatePromotionPanel");
const wrapper = createRoot(document.getElementById("app")!);
await act(async () => wrapper.render(<Client.Provider value={site}><TemplatePromotionPanel /></Client.Provider>));
assert.equal(checkbox("Include template appearance").checked, true);
await click("Create preview");
assert.equal(previews[2].sourceConnectionId, "stage-connection");
shell = { ...shell, selectedEnvironment: environments[2] };
await act(async () => wrapper.render(<Client.Provider value={site}><TemplatePromotionPanel /></Client.Provider>));
assert.equal(document.querySelector("select"), null, "no staging review in live scope");
await act(async () => wrapper.unmount());
const general = createRoot(document.getElementById("app")!);
await act(async () => general.render(<Client.Provider value={controller}><PromotionReviewPanel {...props} appearanceSourceInstanceId={undefined} /></Client.Provider>));
assert.equal(document.querySelector("select"), null, "general content flow starts closed");
await click("Preview staging content");
await act(async () => { const select = document.querySelector("select")!; select.value = "stage-connection"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
assert.equal(checkbox("Include template appearance").checked, false);
assert.equal(button("Create preview").disabled, true);
await act(async () => general.unmount());
dom.window.close();
console.log("appearance promotion: controller routing, selection, source, reset and access verified");
