import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import sale from "../../../../../../../blocks/commerce/sale-countdown/render";
test("suspended sale resumes at current prices and campaign expiry without stale offers or live ticking announcements", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://sale.invalid", pretendToBeVisual: true });
  const names = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("app")), originalNow = Date.now;
  let now = 1000; Date.now = () => now;
  const View = sale.View;
  const product = { id: "cup", title: "Studio cup", href: "/products/cup", excerpt: null, createdAt: 1, image: null, rating: null, cart: null,
    pricing: { price: { amount: 2400, currencyCode: "USD" }, salePrice: { amount: 1800, currencyCode: "USD" }, salePriceFrom: 0, salePriceTo: 2000, pricedAt: 1000 } };
  try {
    await act(async () => root.render(<View attrs={{ title: "Studio sale", target: "1970-01-01T00:00:03Z", limit: 6 }} data={{ items: [product], groups: [] }} resources={{ media: {} }} />));
    expect(document.querySelectorAll("article")).toHaveLength(1);
    expect(document.querySelector('[aria-label="Time remaining"]').closest('[aria-live]')).toBeNull();
    now = 2001;
    await act(async () => window.dispatchEvent(new dom.window.Event("pageshow")));
    expect(document.querySelectorAll("article")).toHaveLength(0);
    expect(document.querySelector('[role="status"]').textContent).toContain("No offers right now.");
    now = 3001;
    await act(async () => document.dispatchEvent(new dom.window.Event("visibilitychange")));
    expect(document.querySelector('[role="status"]').textContent).toContain("This campaign has ended.");
    expect(document.querySelector('a[href="/products"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount()); Date.now = originalNow; dom.window.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
