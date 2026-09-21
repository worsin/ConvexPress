import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { MediaIndexAutoRunner } from "./MediaIndexAutoRunner";
import type { MediaIndexProgress } from "@convexpress/runtime-clients/media-index-maintenance";
const state = (
  sequence = 0,
  status: MediaIndexProgress["status"] = "building",
): MediaIndexProgress => ({
  status,
  generation: "epoch_123456789012:version",
  sequence,
  owner: status === "ready" ? null : "posts",
  completedOwners: status === "ready" ? 26 : 0,
  totalOwners: 26,
  pages: sequence,
  documents: sequence,
});
async function domTest(run: (root: ReturnType<typeof createRoot>) => Promise<void>) {
  const require = createRequire(import.meta.url);
  const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
  const dom = new JSDOM("<html><body><div id='app'></div></body></html>", {
    url: "http://localhost",
  });
  const names = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
    });
  const root = createRoot(document.getElementById("app")!);
  try {
    await run(root);
  } finally {
    await act(async () => root.unmount());
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    dom.window.close();
  }
}
test("actual authenticated runner automatically crosses bounded batches and clears banner only on verified ready", async () =>
  domTest(async (root) => {
    let current = state();
    let calls = 0;
    const ports = {
      read: async () => current,
      begin: async () => current,
      step: async () => {
        calls++;
        return (current = state(calls, calls === 30 ? "ready" : "building"));
      },
    };
    await act(async () => {
      root.render(
        <MediaIndexAutoRunner
          current={current}
          ports={ports}
          link={<a href="/media">Open Media deletion safety</a>}
        />,
      );
    });
    expect(calls).toBe(30);
    expect(document.querySelector('[role="status"]')).toBeNull();
  }));
test("blocked progress remains visible without writes; authoritative manual recovery replaces an old warning", async () =>
  domTest(async (root) => {
    const current = state(1, "blocked");
    let calls = 0;
    const ports = {
      read: async () => current,
      begin: async () => {
        calls++;
        return current;
      },
      step: async () => {
        calls++;
        return current;
      },
    };
    await act(async () =>
      root.render(
        <MediaIndexAutoRunner
          current={current}
          ports={ports}
          link={<a href="/media">Open Media deletion safety</a>}
        />,
      ),
    );
    expect(calls).toBe(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("paused safely");
    await act(async () =>
      root.render(<MediaIndexAutoRunner current={state(2, "ready")} ports={ports} link={null} />),
    );
    expect(document.querySelector('[role="alert"]')).toBeNull();
  }));
test("unmount during a page prevents another mutation or stale rendered progress", async () =>
  domTest(async (root) => {
    let calls = 0;
    let resolve: ((value: MediaIndexProgress) => void) | undefined;
    const current = state();
    const ports = {
      read: async () => current,
      begin: async () => current,
      step: () => {
        calls++;
        return new Promise<MediaIndexProgress>((r) => {
          resolve = r;
        });
      },
    };
    await act(async () =>
      root.render(<MediaIndexAutoRunner current={current} ports={ports} link={null} />),
    );
    expect(calls).toBe(1);
    await act(async () => root.render(null));
    await act(async () => {
      resolve!(state(1));
    });
    expect(calls).toBe(1);
    expect(document.getElementById("app")?.textContent).toBe("");
  }));
