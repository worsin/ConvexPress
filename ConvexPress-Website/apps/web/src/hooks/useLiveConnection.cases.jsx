import { test, expect } from "bun:test";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { ConvexProvider } from "convex/react";
import { JSDOM } from "jsdom";
import { useLiveConnection } from "./useLiveConnection";

function client(online) {
  const listeners = new Set();
  return { reads: 0, online, listeners,
    connectionState() { this.reads++; return { isWebSocketConnected: this.online }; },
    subscribeToConnectionState(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    change(value) { this.online = value; for (const callback of listeners) callback(); },
  };
}
function Status() { const state = useLiveConnection(); return <p>{state.isWebSocketConnected ? "Connected" : "Waiting"}</p>; }
const tree = value => <ConvexProvider client={value}><Status/></ConvexProvider>;

test("SSR never reads the lazy transport or subscribes", () => {
  const value = client(true);
  expect(renderToString(tree(value))).toBe("<p>Waiting</p>");
  expect(value.reads).toBe(0);
  expect(value.listeners.size).toBe(0);
});

test("hydration, disconnection, client replacement and unmount retain accurate status", async () => {
  const first = client(true), second = client(false), errors = [];
  const dom = new JSDOM(`<div id="app">${renderToString(tree(first))}</div>`), previous = {};
  for (const name of ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]) {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  }
  const { hydrateRoot } = await import("react-dom/client"); let root;
  try {
    await act(async () => { root = hydrateRoot(document.getElementById("app"), tree(first), { onRecoverableError: e => errors.push(e.message) }); });
    expect(document.querySelector("p").textContent).toBe("Connected");
    expect(first.listeners.size).toBe(1); expect(errors).toEqual([]);
    await act(async () => first.change(false));
    expect(document.querySelector("p").textContent).toBe("Waiting");
    await act(async () => first.change(true));
    await act(async () => root.render(tree(second)));
    expect(first.listeners.size).toBe(0); expect(second.listeners.size).toBe(1);
    expect(document.querySelector("p").textContent).toBe("Waiting");
    await act(async () => second.change(true));
    expect(document.querySelector("p").textContent).toBe("Connected");
  } finally {
    if (root) await act(async () => root.unmount());
    expect(first.listeners.size).toBe(0); expect(second.listeners.size).toBe(0);
    dom.window.close();
    for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
