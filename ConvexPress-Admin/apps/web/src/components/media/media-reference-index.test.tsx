import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { MediaReferenceIndexView } from "./MediaReferenceIndexView";
import { continueMediaIndex, type MediaIndexProgress } from "./media-reference-index-model";
const progress: MediaIndexProgress = { status: "building", generation: "fixture-generation", sequence: 0, owner: "posts", completedOwners: 3, totalOwners: 26, pages: 4, documents: 30 };
const defaults = { busy: false, error: null, cleanupMessage: null, onContinue() {}, onPause() {}, onCleanup() {} };

test("readiness copy never claims completion for stale, blocked, or unconfigured progress", () => {
  for (const status of ["stale", "blocked", "unconfigured", "building"] as const) {
    const html = renderToStaticMarkup(<MediaReferenceIndexView {...defaults} progress={{ ...progress, status }} />);
    expect(html).not.toContain("Index ready."); expect(html).not.toContain("Clean older index records");
    if (status === "unconfigured") { expect(html).toContain("Existing reference checks remain active"); expect(html).not.toContain("<button"); }
    else expect(html).toContain("Deletion is paused");
  }
  const ready = renderToStaticMarkup(<MediaReferenceIndexView {...defaults} progress={{ ...progress, status: "ready" }} />);
  expect(ready).toContain("Index ready."); expect(ready).toContain("Clean older index records"); expect(ready).not.toContain("Continue indexing");
});

test("each user continuation is bounded and sends only the returned generation and sequence", async () => {
  const args: { generation: string; expectedSequence: number }[] = [], states: MediaIndexProgress[] = [];
  await continueMediaIndex({ begin: async () => progress, active: () => true, onProgress: value => states.push(value), step: async input => { args.push(input); return { ...progress, sequence: input.expectedSequence + 1 }; } });
  expect(args).toHaveLength(25); expect(args[0]).toEqual({ generation: "fixture-generation", expectedSequence: 0 }); expect(args[24].expectedSequence).toBe(24); expect(states.at(-1)?.sequence).toBe(25);
});

test("pause/scope change after an in-flight response prevents more mutations and stale UI updates", async () => {
  let active = true, calls = 0, rendered = 0;
  await continueMediaIndex({ begin: async () => progress, active: () => active, onProgress: () => { rendered++; }, step: async () => { calls++; active = false; return { ...progress, sequence: 1 }; } });
  expect(calls).toBe(1); expect(rendered).toBe(1);
  let blockedCalls = 0;
  await continueMediaIndex({ begin: async () => progress, active: () => true, onProgress() {}, step: async () => { blockedCalls++; return { ...progress, status: "blocked" }; } });
  expect(blockedCalls).toBe(1);
});

test("rendered media indexing controls invoke explicit continue/pause/cleanup actions with labeled progress", async () => {
  const require = createRequire(import.meta.url);
  const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
  const dom = new JSDOM("<html><body><div id='app'></div></body></html>", { url: "http://localhost" });
  const names = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const root = createRoot(document.getElementById("app")!); const calls: string[] = [];
  const actions = { ...defaults, onContinue: () => calls.push("continue"), onPause: () => calls.push("pause"), onCleanup: () => calls.push("cleanup") };
  try {
    await act(async () => { root.render(<MediaReferenceIndexView {...actions} progress={progress} />); });
    expect(document.querySelector('progress[aria-label="Media reference indexing progress"]')).not.toBeNull();
    await act(async () => { document.querySelector("button")!.click(); }); expect(calls).toEqual(["continue"]);
    await act(async () => { root.render(<MediaReferenceIndexView {...actions} progress={progress} busy />); });
    expect(document.querySelector("button")!.textContent).toBe("Pause after current page");
    await act(async () => { document.querySelector("button")!.click(); }); expect(calls).toEqual(["continue", "pause"]);
    await act(async () => { root.render(<MediaReferenceIndexView {...actions} progress={{ ...progress, status: "ready" }} busy />); });
    expect(document.querySelector("button")!.disabled).toBe(true);
    await act(async () => { root.render(<MediaReferenceIndexView {...actions} progress={{ ...progress, status: "ready" }} />); document.querySelector("summary")!.click(); });
    await act(async () => { document.querySelector("button")!.click(); }); expect(calls).toEqual(["continue", "pause", "cleanup"]);
  } finally { await act(async () => root.unmount()); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); } dom.window.close(); }
});
