import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Folder } from "lucide-react";
import { NavSection } from "./NavSection";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("closed navigation is inert and absent from accessibility; collapsing restores focus and reopening exposes the original link", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", {
    url: "http://localhost",
  });
  const globals = [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "MutationObserver",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const old = new Map(
    globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const name of globals)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as any)[name],
    });
  const container = document.getElementById("app")!;
  let changeExpanded = (_value: boolean) => {};
  let rerender = () => {};
  const rootRoute = createRootRoute({
    component: () => {
      const [expanded, setExpanded] = useState(false);
      changeExpanded = setExpanded;
      return (
        <ul>
          <NavSection
            section={{
              id: "media",
              label: "Media",
              to: "/media",
              icon: Folder,
              children: [{ id: "library", label: "Library", to: "/media" }],
            }}
            collapsed={false}
            isExpanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            isActive={false}
          />
        </ul>
      );
    },
  });
  const media = createRoute({
    getParentRoute: () => rootRoute,
    path: "/media",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([media]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const root = createRoot(container);
  rerender = () => root.render(<RouterProvider router={router} />);
  try {
    await router.load();
    await act(async () => rerender());
    const button = container.querySelector("button")!;
    const list = document.getElementById(button.getAttribute("aria-controls")!)!;
    const link = list.querySelector("a")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(list.getAttribute("aria-hidden")).toBe("true");
    expect(list.hasAttribute("inert")).toBe(true);
    expect(getComputedStyle(list).visibility).toBe("hidden");
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(list.getAttribute("aria-hidden")).toBe("false");
    expect(list.hasAttribute("inert")).toBe(false);
    expect(getComputedStyle(list).visibility).toBe("visible");
    link.focus();
    expect(document.activeElement).toBe(link);
    await act(async () => {
      changeExpanded(false);
    });
    expect(document.activeElement).toBe(button);
    await act(async () => button.click());
    let activated = false;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      activated = true;
    });
    await act(async () => link.click());
    expect(activated).toBe(true);
    expect(link.getAttribute("href")).toBe("/media");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const name of globals) {
      const descriptor = old.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
