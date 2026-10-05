// @ts-ignore Bun supports module aliases; the local declaration omits mock.
import { expect, test, mock } from "bun:test";
import { anyApi } from "convex/server";
// Bun follows the Admin type-only API shim; use the same generated runtime API proxy.
mock.module("@backend/convex/_generated/api", () => ({ api: anyApi }));
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
const { HeaderSettingsEditor } = await import("./HeaderComposer");
const { FooterSettingsEditor } = await import("./FooterComposer");
const { FooterRowsBuilder } = await import("./FooterRowsBuilder");

test("Customizer reuses header/footer controls without separate publish buttons", () => {
  const markup = renderToStaticMarkup(
    <>
      <HeaderSettingsEditor value={{}} onChange={() => {}} />
      <FooterSettingsEditor value={{}} onChange={() => {}} />
    </>,
  );
  expect(markup).toContain("Layout");
  expect(markup).toContain("Newsletter");
  expect(markup).not.toContain("Save footer");
  expect(markup).not.toContain("Save Header");
});
test("controlled footer rows render their draft without querying or writing global settings", () => {
  const unexpected = () => {
    throw new Error("Controlled builder attempted backend access");
  };
  const client = {
    mutation: unexpected,
    watchQuery: unexpected,
  } as unknown as ConvexReactClient;
  const markup = renderToStaticMarkup(
    <ConvexProvider client={client}>
      <ConvexQueryCacheProvider>
        <FooterRowsBuilder
          value={{
            rows: [
              {
                id: "r1",
                columns: [
                  {
                    id: "c1",
                    cell: {
                      type: "text",
                      heading: "Draft-only title",
                      body: "Draft-only body",
                    },
                  },
                ],
              },
            ],
          }}
          onChange={() => {}}
        />
      </ConvexQueryCacheProvider>
    </ConvexProvider>,
  );
  expect(markup).toContain("Row 1");
  expect(markup).toContain("1 cell");
  expect(markup).not.toContain("Save footer");
});

test("native chrome editors expose section switches and visible field labels to assistive technology", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
  const dom = new JSDOM("<html><body><div id='app'></div></body></html>", { url: "http://localhost", pretendToBeVisual: true });
  const names = ["window", "document", "HTMLElement", "Element", "Node", "navigator", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"].includes(name) ? dom.window[name].bind(dom.window) : dom.window[name] });
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const container = document.getElementById("app")!;
  const root = createRoot(container);
  try {
    for (const [Editor, section, fieldName] of [[HeaderSettingsEditor, "CTA Button", "Button Label"], [FooterSettingsEditor, "Branding Column", "Description"]] as const) {
      await act(async () => root.render(<Editor value={{}} onChange={() => {}} />));
      const trigger = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.startsWith(section))!;
      expect(trigger).toBeTruthy();
      await act(async () => trigger.click());
      const group = trigger.parentElement!;
      expect(group.querySelector('[role="switch"]')?.getAttribute("aria-label")).toBe(section);
      const label = [...container.querySelectorAll("label")].find(label => label.textContent === fieldName)!;
      expect(label).toBeTruthy();
      expect(label.control).toBeTruthy();
      expect(label.control?.tagName).toBe("INPUT");
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
