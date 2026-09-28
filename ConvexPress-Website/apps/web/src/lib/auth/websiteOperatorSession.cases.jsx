import { expect, mock, test } from "bun:test";
import { act, StrictMode, useEffect, useState } from "react";
import { JSDOM } from "jsdom";

const customer = { isLoaded: true, isSignedIn: true, userId: "customer", sessionId: "customer-session", orgId: null };
let lastOperatorAuth, childMounts = 0;
mock.module("./clerk", () => ({ useAuth: () => customer }));
mock.module("convex/react-clerk", () => ({ ConvexProviderWithClerk: ({ children, useAuth }) => <div data-customer={useAuth().sessionId}>{children}</div> }));
mock.module("convex/react", () => ({ ConvexProviderWithAuth: ({ children, useAuth }) => { lastOperatorAuth = useAuth(); return <div data-operator="true">{children}</div>; } }));
const { SessionBoundConvexProvider } = await import("./SessionBoundConvexProvider");
const { WebsiteOperatorNotice, useWebsiteOperator } = await import("./WebsiteOperatorContext");
let operatorControls;
const { useOperatorDraftRecovery } = await import("./OperatorDraftContext");
let editorOwner = "one:staging:alice", showEditor = false, editDraft;
const recoveredDraft = { packId: "journal", base: { values: {}, variants: {} }, revision: "original-publication", draftRevision: "original-private", history: { past: [{ values: {}, variants: {} }], present: { values: { colors: { primary: "#123456" } }, variants: {} }, future: [] } };
function Editor() {
  const recovery = useOperatorDraftRecovery();
  const [draft, setDraft] = useState(() => recovery?.read(editorOwner));
  editDraft = () => { recovery.write(editorOwner, recoveredDraft); setDraft(recoveredDraft); };
  return <div data-editor>{draft?.history.present.values.colors.primary ?? "unchanged"}</div>;
}
function Child() {
  const operator = useWebsiteOperator();
  operatorControls = operator;
  useEffect(() => { childMounts++; }, []);
  return <><WebsiteOperatorNotice />{showEditor && operator.active && <Editor />}</>;
}

async function environment(run) {
  const dom = new JSDOM("<div id='root'></div>", { url: `https://site.example/?customize=1#cp-customize=${"ab".repeat(32)}` });
  const prior = {};
  for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "IS_REACT_ACT_ENVIRONMENT"]) {
    prior[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  window.__CONVEXPRESS_SITE__ = { convexUrl: "https://db.convex.cloud", convexSiteUrl: "https://db.convex.site", instanceKey: "one:staging" };
  const oldFetch = globalThis.fetch;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const render = () => act(async () => root.render(<StrictMode><SessionBoundConvexProvider client={{}}><Child /></SessionBoundConvexProvider></StrictMode>));
  try { await run({ root, render }); }
  finally { await act(async () => root.unmount()); showEditor = false; editorOwner = "one:staging:alice"; globalThis.fetch = oldFetch; dom.window.close(); for (const [key, desc] of Object.entries(prior)) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key]; } }
}

test("anonymous auth readiness preserves focused content; authority changes still replace it", async () => environment(async ({ root }) => {
  window.history.replaceState(null, "", "/");
  const original = { ...customer }, client = {};
  const render = () => act(async () => root.render(<StrictMode><SessionBoundConvexProvider client={client}>
    <a href="#details">Read the guide</a><details><summary>Details</summary>Content</details>
  </SessionBoundConvexProvider></StrictMode>));
  try {
    Object.assign(customer, { isLoaded: false, isSignedIn: undefined, userId: undefined, sessionId: undefined, orgId: undefined });
    await render();
    const link = document.querySelector("a"), disclosure = document.querySelector("details");
    link.focus(); disclosure.open = true;
    Object.assign(customer, { isLoaded: true, isSignedIn: false, userId: null, sessionId: null, orgId: null });
    await render();
    expect(document.querySelector("a") === link).toBe(true);
    expect(document.activeElement === link).toBe(true);
    expect(disclosure.open).toBe(true);
    let previous = link;
    for (const changed of [
      { isSignedIn: true, userId: "first", sessionId: "first-session" },
      { sessionId: "second-session" },
      { orgId: "other-organization" },
      { userId: "second", sessionId: "third-session" },
      // Unresolved authority cannot retain a previously authenticated subtree,
      // even if the provider temporarily keeps its old identity fields.
      { isLoaded: false },
      { isLoaded: true },
      { isSignedIn: false, userId: null, sessionId: null, orgId: null },
    ]) {
      Object.assign(customer, changed); await render();
      expect(previous.isConnected).toBe(false);
      previous = document.querySelector("a");
    }
  } finally { Object.assign(customer, original); }
}));

test("StrictMode redeems once, removes the secret, separates customer authority and remounts on explicit end", async () => environment(async ({ render }) => {
  let resolve, calls = 0;
  globalThis.fetch = () => { calls++; expect(window.location.hash).toBe(""); return new Promise(done => { resolve = done; }); };
  await render();
  expect(calls).toBe(1);
  expect(document.body.textContent).toContain("Opening website editing");
  const before = childMounts;
  await act(async () => resolve(Response.json({ token: "operator-token", expiresAt: Date.now() + 60000, instanceKey: "one:staging" })));
  expect(document.querySelector("[data-operator]")).not.toBeNull();
  expect(document.querySelector("[data-customer]")).toBeNull();
  expect(await lastOperatorAuth.fetchAccessToken()).toBe("operator-token");
  expect(childMounts).toBeGreaterThan(before);
  expect(window.localStorage.length).toBe(0); expect(window.sessionStorage.length).toBe(0);
  await act(async () => document.querySelector("button").click());
  expect(document.querySelector("[data-operator]")).toBeNull();
  expect(document.querySelector("[data-customer]").dataset.customer).toBe("customer-session");
  expect(customer.sessionId).toBe("customer-session");
  await render(); expect(calls).toBe(1);
}));

test("failed redemption keeps the customer session and presents a safe actionable error", async () => environment(async ({ render }) => {
  globalThis.fetch = async () => new Response("private provider details", { status: 403 });
  await render();
  expect(document.querySelector("[data-operator]")).toBeNull();
  expect(document.querySelector("[role=alert]").textContent).toContain("Open a new link from ConvexPress");
  expect(document.body.textContent).not.toContain("private provider");
}));

test("expiration clears operator authority and restores the separate customer provider", async () => environment(async ({ render }) => {
  globalThis.fetch = async () => Response.json({ token: "short-token", expiresAt: Date.now() + 100, instanceKey: "one:staging" });
  await render();
  expect(document.querySelector("[data-operator]")).not.toBeNull();
  await act(async () => new Promise(done => setTimeout(done, 150)));
  expect(await lastOperatorAuth.fetchAccessToken()).toBeNull();
  expect(document.querySelector("[data-operator]")).toBeNull();
  expect(document.querySelector("[data-customer]")).not.toBeNull();
  expect(document.querySelector("[role=alert]").textContent).toContain("editing expired");
}));

test("a new same-tab link replaces an in-flight exchange and obsolete responses cannot restore authority", async () => environment(async ({ render }) => {
  const responses = [];
  globalThis.fetch = () => new Promise(resolve => responses.push(resolve));
  await render();
  await act(async () => {
    window.history.replaceState(null, "", `/?customize=1#cp-customize=${"cd".repeat(32)}`);
    window.dispatchEvent(new Event("hashchange"));
  });
  expect(responses.length).toBe(2); expect(window.location.hash).toBe("");
  await act(async () => responses[1](Response.json({ token: "current-token", expiresAt: Date.now() + 60000, instanceKey: "one:staging" })));
  await act(async () => responses[0](Response.json({ token: "obsolete-token", expiresAt: Date.now() + 60000, instanceKey: "one:staging" })));
  expect(await lastOperatorAuth.fetchAccessToken()).toBe("current-token");
  await act(async () => document.querySelector("button").click());
  await act(async () => {
    window.history.replaceState(null, "", `/?customize=1#cp-customize=${"ef".repeat(32)}`);
    window.dispatchEvent(new Event("hashchange"));
  });
  expect(responses.length).toBe(3);
  await act(async () => responses[2](Response.json({ token: "reopened-token", expiresAt: Date.now() + 60000, instanceKey: "one:staging" })));
  expect(await lastOperatorAuth.fetchAccessToken()).toBe("reopened-token");
}));

test("unsaved work survives expiry, is hidden from the customer and recovers on same-account reopening", async () => environment(async ({ render }) => {
  showEditor = true;
  globalThis.fetch = async () => Response.json({ token: "short-token", expiresAt: Date.now() + 100, instanceKey: "one:staging" });
  await render();
  await act(async () => editDraft());
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(async () => new Promise(done => setTimeout(done, 150)));
  expect(document.querySelector("[data-editor]")).toBeNull();
  expect(document.body.textContent).not.toContain("#123456");
  expect(document.body.textContent).toContain("unsaved draft is kept in this tab");
  expect(window.localStorage.length).toBe(0); expect(window.sessionStorage.length).toBe(0);
  globalThis.fetch = async () => Response.json({ token: "renewed-token", expiresAt: Date.now() + 60000, instanceKey: "one:staging" });
  await act(async () => {
    window.history.replaceState(null, "", `/?customize=1#cp-customize=${"ef".repeat(32)}`);
    window.dispatchEvent(new Event("hashchange"));
  });
  expect(document.querySelector("[data-editor]").textContent).toBe("#123456");
  window.confirm = () => false;
  await act(async () => document.querySelector("button").click());
  expect(document.querySelector("[data-editor]").textContent).toBe("#123456");
  window.confirm = () => true;
  await act(async () => document.querySelector("button").click());
  expect(document.querySelector("[data-editor]")).toBeNull();
  const cleanUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
}));

test("a different operator cannot recover the previous operator's draft", async () => environment(async ({ render }) => {
  showEditor = true;
  globalThis.fetch = async () => Response.json({ token: "alice", expiresAt: Date.now() + 60000, instanceKey: "one:staging" });
  await render(); await act(async () => editDraft());
  editorOwner = "one:staging:bob";
  globalThis.fetch = async () => Response.json({ token: "bob", expiresAt: Date.now() + 60000, instanceKey: "one:staging" });
  await act(async () => {
    window.history.replaceState(null, "", `/?customize=1#cp-customize=${"cd".repeat(32)}`);
    window.dispatchEvent(new Event("hashchange"));
  });
  expect(document.querySelector("[data-editor]").textContent).toBe("unchanged");
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
}));

const desktop = () => ({ endpoint: "http://127.0.0.1:51234/convexpress/website-editing", key: "de".repeat(32), expiresAt: Date.now() + 600000 });
const setDesktopLaunch = () => window.history.replaceState(null, "", `/?customize=1#${new URLSearchParams({ "cp-customize": "ab".repeat(32), "cp-desktop": JSON.stringify(desktop()) })}`);

test("failed desktop renewal preserves the draft and the visible reconnect action recovers it", async () => environment(async ({ render }) => {
  showEditor = true; setDesktopLaunch(); let unavailable = true, exchanges = 0;
  globalThis.fetch = async url => {
    if (String(url).includes("website-editing")) {
      if (unavailable) throw Error("connection refused");
      return Response.json({ code: "cd".repeat(32) });
    }
    return Response.json({ token: `token-${++exchanges}`, userId: "alice", expiresAt: Date.now() + (exchanges === 1 ? 100 : 60000), instanceKey: "one:staging" });
  };
  await render(); await act(async () => editDraft());
  await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
  await act(async () => operatorControls.reconnect());
  expect(document.querySelector("[data-editor]")).toBeNull();
  expect(document.body.textContent).toContain("Your draft stays in this tab");
  expect(operatorControls.pending).toBe(false);
  unavailable = false;
  const retry = [...document.querySelectorAll("button")].find(button => button.textContent === "Reconnect editing");
  expect(retry).toBeDefined();
  await act(async () => { retry.click(); });
  expect(document.querySelector("[data-editor]").textContent).toBe("#123456");
  expect(operatorControls.error).toBeNull();
}));

test("same-operator renewal preserves the editor subtree and draft, and unrelated hash changes cannot replay old authority", async () => environment(async ({ render }) => {
  showEditor = true; setDesktopLaunch(); let exchanges = 0;
  globalThis.fetch = async url => String(url).includes("website-editing") ? Response.json({ code: "cd".repeat(32) }) : Response.json({ token: `token-${++exchanges}`, userId: "alice", expiresAt: Date.now() + 60000, instanceKey: "one:staging" });
  await render(); await act(async () => editDraft());
  const mounts = childMounts;
  expect(operatorControls.canReconnect).toBe(true);
  await act(async () => operatorControls.reconnect());
  expect(exchanges).toBe(2);
  expect(await lastOperatorAuth.fetchAccessToken()).toBe("token-2");
  expect(childMounts).toBe(mounts);
  expect(document.querySelector("[data-editor]").textContent).toBe("#123456");
  await act(async () => { window.history.replaceState(null, "", "/?customize=1#section"); window.dispatchEvent(new Event("hashchange")); });
  expect(await lastOperatorAuth.fetchAccessToken()).toBe("token-2");
  expect(exchanges).toBe(2);
}));

test("renewal of an expired session recovers in the same tab and ending cancels a pending renewal", async () => environment(async ({ render }) => {
  showEditor = true; setDesktopLaunch(); let exchanges = 0, finish;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("website-editing")) {
      if (JSON.parse(init.body).action === "end") return Response.json({ ended: true });
      return Response.json({ code: "cd".repeat(32) });
    }
    exchanges++;
    if (exchanges === 3) return new Promise(resolve => { finish = resolve; });
    return Response.json({ token: `token-${exchanges}`, userId: "alice", expiresAt: Date.now() + (exchanges === 1 ? 100 : 60000), instanceKey: "one:staging" });
  };
  await render(); await act(async () => editDraft());
  await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
  expect(document.querySelector("[data-editor]")).toBeNull();
  await act(async () => operatorControls.reconnect());
  expect(document.querySelector("[data-editor]").textContent).toBe("#123456");
  await act(async () => { void operatorControls.reconnect(); });
  window.confirm = () => true;
  await act(async () => operatorControls.end());
  await act(async () => finish(Response.json({ token: "obsolete", userId: "alice", expiresAt: Date.now() + 60000, instanceKey: "one:staging" })));
  expect(document.querySelector("[data-operator]")).toBeNull();
  expect(operatorControls.canReconnect).toBe(false);
}));

test("renewal refuses a different backend principal instead of preserving the old editor under new authority", async () => environment(async ({ render }) => {
  showEditor = true; setDesktopLaunch(); let exchanges = 0;
  globalThis.fetch = async url => String(url).includes("website-editing") ? Response.json({ code: "cd".repeat(32) }) : Response.json({ token: `token-${++exchanges}`, userId: exchanges === 1 ? "alice" : "bob", expiresAt: Date.now() + 60000, instanceKey: "one:staging" });
  await render(); await act(async () => editDraft());
  await act(async () => operatorControls.reconnect());
  expect(document.querySelector("[data-operator]")).toBeNull();
  expect(document.body.textContent).not.toContain("#123456");
  expect(document.body.textContent).toContain("editing account changed");
  expect(operatorControls.canReconnect).toBe(false);
}));
