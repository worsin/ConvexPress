import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act, StrictMode, useSyncExternalStore } from "react";
const require = createRequire(import.meta.url);
const { mock } = require("bun:test");
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const values = new Map<string, unknown>();
const subscriptions = new Map<string, Set<() => void>>();
mock.module("convex/react", () => ({
  useQuery(_reference: unknown, args: { checks: unknown[] } | "skip") {
    const key = JSON.stringify(args);
    const value = useSyncExternalStore(callback => {
      if (args === "skip") return () => {};
      const listeners = subscriptions.get(key) ?? new Set();
      listeners.add(callback); subscriptions.set(key, listeners);
      return () => { listeners.delete(callback); if (!listeners.size) subscriptions.delete(key); };
    }, () => values.get(key));
    if (value instanceof Error) throw value;
    return value;
  },
}));
const { ControlAccessProvider, useControlAccessChecks } = await import("./ControlAccessProvider");
const { AdminShellErrorBoundary } = await import("../components/layout/AdminShellErrorBoundary");
const check = (site: string) => ({ selectorType: "capability" as const, code: "site.deploy", websiteId: site });
const allow = { allowed: true, reason: "explicit_allow", winningRuleId: null, roleSlug: null };
function Consumer({ site, label }: { site: string; label: string }) {
  const result = useControlAccessChecks({ checks: [check(site)] });
  return <p data-consumer={label}>{label}:{result === undefined ? "loading" : result[0].allowed ? "allow" : "deny"}</p>;
}
function deliver(value: unknown) {
  // Rendering can replace subscriptions while callbacks are delivered.
  const pending = [...subscriptions];
  for (const [key, listeners] of pending) {
    values.set(key, value instanceof Error ? value : JSON.parse(key).checks.map((check: unknown) => typeof value === "function" ? value(check) : value));
    const callbacks = [...listeners];
    for (const listener of callbacks) listener();
  }
}

test("shared checks retain live denial, scope changes, bounded batches and recovery", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost", pretendToBeVisual: true });
  const names = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("app")!);
  const originalError = console.error; console.error = () => {};
  const render = (sites: string[]) => act(async () => root.render(
    <StrictMode><AdminShellErrorBoundary><ControlAccessProvider>{sites.map((site, index) => <Consumer key={index} label={String(index)} site={site} />)}</ControlAccessProvider></AdminShellErrorBoundary></StrictMode>,
  ));
  try {
    await render(Array(8).fill("alpha"));
    expect(subscriptions.size).toBe(1);
    expect(JSON.parse([...subscriptions.keys()][0]).checks).toHaveLength(1);
    expect(document.body.textContent).not.toContain("allow");
    await act(async () => deliver(allow));
    expect(document.querySelectorAll("[data-consumer]")).toHaveLength(8);
    expect(document.body.textContent).toContain("7:allow");
    await act(async () => deliver({ ...allow, allowed: false, reason: "explicit_deny" }));
    expect(document.body.textContent).not.toContain("allow");
    expect(document.body.textContent).toContain("7:deny");
    await render(["beta", "alpha"]);
    expect(subscriptions.size).toBe(1);
    expect(JSON.parse([...subscriptions.keys()][0]).checks).toHaveLength(2);
    expect(document.body.textContent).toBe("0:loading1:loading");
    await act(async () => deliver((entry: { websiteId: string }) => entry.websiteId === "beta" ? { ...allow, allowed: false, reason: "explicit_deny" } : allow));
    expect(document.body.textContent).toBe("0:deny1:allow");
    await render(["beta"]);
    expect(subscriptions.size).toBe(1);
    expect(JSON.parse([...subscriptions.keys()][0]).checks).toEqual([check("beta")]);
    expect(document.body.textContent).toBe("0:loading");
    await render(Array.from({ length: 65 }, (_, index) => `site-${index}`));
    expect(subscriptions.size).toBe(3);
    expect([...subscriptions.keys()].map(key => JSON.parse(key).checks.length).sort((a,b) => a-b)).toEqual([1,32,32]);
    await act(async () => deliver(allow));
    expect(document.body.textContent).toContain("64:allow");
    await act(async () => deliver(Object.assign(new Error("capacity"), { data: { code: "CONTROL_PLANE_AUTHORIZATION_CAPACITY" } })));
    expect(document.body.textContent).toContain("Permission limit reached");
    expect(document.querySelectorAll("[data-consumer]")).toHaveLength(0);
    expect(subscriptions.size).toBe(0);
    values.clear();
    await act(async () => ([...document.querySelectorAll("button")].find(node => node.textContent?.includes("Try Again")) as HTMLButtonElement).click());
    expect(subscriptions.size).toBe(3);
    expect(document.body.textContent).not.toContain("allow");
    await act(async () => deliver(allow));
    expect(document.body.textContent).toContain("64:allow");
    await act(async () => deliver({ ...allow, allowed: false, reason: "explicit_deny" }));
    expect(document.body.textContent).toContain("64:deny");
    expect(document.body.textContent).not.toContain("allow");
  } finally {
    await act(async () => root.unmount());
    expect(subscriptions.size).toBe(0);
    values.clear(); console.error = originalError; dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});
