import { expect, mock, test } from "bun:test";
import { act, StrictMode } from "react";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
let onRequest, onClosed, starts = [], stops = [], replies = [], mutations = [], provider;
const bridge = {
  async start(input) { starts.push(input); return { endpoint: "http://127.0.0.1:51234/convexpress/website-editing", key: "de".repeat(32), expiresAt: Date.now() + 600000 }; },
  async stop(id) { stops.push(id); return true; },
  async respond(input) { replies.push(input); return true; },
  onRequest(callback) { onRequest = callback; return () => {}; },
  onClosed(callback) { onClosed = callback; return () => {}; },
};
mock.module("@/lib/electron", () => ({ getElectronBridge: () => ({ websiteEditing: bridge }) }));
mock.module("convex/browser", () => ({ ConvexHttpClient: class {
  constructor(url) { this.url = url; }
  setAuth(token) { this.token = token; }
  clearAuth() { this.token = null; }
  async mutation(_ref, args) { mutations.push({ url: this.url, token: this.token, args }); return { url: "https://site.example/?customize=1", instanceKey: "site:staging", expiresAt: Date.now() + 60000 }; }
} }));
const { WebsiteEditingProvider, useWebsiteEditing } = await import("./WebsiteEditingProvider");
function Consumer() { provider = useWebsiteEditing(); return null; }
const target = { connectionId: "original-connection", websiteKey: "site", instanceKey: "site:staging", deploymentOrigin: "https://site.convex.cloud" };
async function environment(run) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://127.0.0.1:4105" });
  const prior = {};
  for (const key of ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"]) {
    prior[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  starts = []; stops = []; replies = []; mutations = [];
  const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("root"));
  const render = issue => act(async () => root.render(<StrictMode><WebsiteEditingProvider issue={issue}><Consumer /></WebsiteEditingProvider></StrictMode>));
  try { await run({ render, root }); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, desc] of Object.entries(prior)) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key]; } }
}

test("desktop renewal remains bound to the launched environment across selected-site navigation", () => environment(async ({ render }) => {
  const requested = [];
  const issue = async value => { requested.push(value); return { token: "synthetic-session", expiresAt: Date.now() + 60000 }; };
  await render(issue);
  const launch = await provider.start(target, "https://site.example");
  expect(new URLSearchParams(new URL(launch.url).hash.slice(1)).has("cp-desktop")).toBe(true);
  target.connectionId = "another-selected-connection";
  try {
    await render(issue);
    await act(async () => { onRequest({ requestId: "request-1", leaseId: starts[0].leaseId }); await new Promise(resolve => setTimeout(resolve, 5)); });
    expect(requested.map(t => t.connectionId)).toEqual(["original-connection", "original-connection"]);
    expect(mutations).toHaveLength(2);
    expect(mutations.every(m => m.url === "https://site.convex.cloud")).toBe(true);
    expect(replies[0].url).toContain("#cp-customize=");
    onClosed({ leaseId: starts[0].leaseId });
    await act(async () => { onRequest({ requestId: "request-2", leaseId: starts[0].leaseId }); await Promise.resolve(); });
    expect(replies.at(-1)).toEqual({ requestId: "request-2", url: null });
    expect(requested).toHaveLength(2);
  } finally { target.connectionId = "original-connection"; await launch.stop(); }
}));

test("logout during a broker request closes the native lease and cannot mint a late handoff", () => environment(async ({ render, root }) => {
  let finish;
  await render(() => new Promise(resolve => { finish = resolve; }));
  const launch = provider.start(target, "https://site.example").then(() => "unexpected-success", () => "refused");
  await act(async () => { await Promise.resolve(); });
  await act(async () => root.render(null));
  finish({ token: "obsolete-session", expiresAt: Date.now() + 60000 });
  expect(await launch).toBe("refused");
  expect(mutations).toHaveLength(0);
  expect(stops).toContain(starts[0].leaseId);
}));
