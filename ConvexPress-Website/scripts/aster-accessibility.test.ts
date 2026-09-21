import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

// Isolate DOM globals and hook mocks from the rest of the Website test suite.
test("real headers, product fallback and support panel retain accessible behavior", () => {
  const result = spawnSync(process.execPath, ["--eval", `
    import { mock } from 'bun:test';
    import assert from 'node:assert/strict';
    import React, { act } from 'react';
    import { createRoot } from 'react-dom/client';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { JSDOM } from 'jsdom';
    const dom = new JSDOM('<!doctype html><html><body><button id="trigger">Open support</button><div id="app"></div></body></html>', { url: 'https://example.test' });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const { observeStickyHeaderOffset } = await import('./src/hooks/layout/useStickyHeaderOffset.ts');
    let resize, disconnected = false;
    window.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() { disconnected = true; } };
    const header = document.createElement('header');
    document.body.append(header);
    header.style.top = '0px';
    let height = 136;
    header.getBoundingClientRect = () => ({ height });
    const cleanup = observeStickyHeaderOffset(header, true);
    assert.equal(document.documentElement.style.getPropertyValue('--site-header-offset'), '136px');
    height = 184.5; resize();
    assert.equal(document.documentElement.style.getPropertyValue('--site-header-offset'), '185px');
    cleanup(); assert.equal(disconnected, true);
    assert.equal(document.documentElement.style.getPropertyValue('--site-header-offset'), '');
    const cleanupStatic = observeStickyHeaderOffset(header, false);
    assert.equal(document.documentElement.style.getPropertyValue('--site-header-offset'), '0px');
    cleanupStatic();

    mock.module('@tanstack/react-router', () => ({ Link: ({ to, params, ...props }) => React.createElement('a', { ...props, href: '/products/' + params.slug }) }));
    mock.module('./src/hooks/useCart.ts', () => ({ useCart: () => ({ lineByProduct: new Map(), isReady: true }) }));
    mock.module('./src/components/media/MediaImage.tsx', () => ({ MediaImage: ({ alt }) => React.createElement('img', { alt }) }));
    const { ProductMiniCard } = await import('./src/components/shop/ProductMiniCard.tsx');
    const product = { productId: 'p', slug: 'blank-image', title: 'Authored product', excerpt: '', summary: null, price: { amount: 1000, currencyCode: 'USD' }, compareAtPrice: null, featuredMediaId: null, categories: [], inStock: false, stockQuantity: null, productType: 'physical', attributes: null, defaultVariantId: null };
    for (const media of [null, 'media']) {
      const markup = renderToStaticMarkup(React.createElement(ProductMiniCard, { product: { ...product, featuredMediaId: media } }));
      const card = new JSDOM(markup).window.document;
      assert.equal(card.querySelector('a').getAttribute('aria-label'), product.title);
      assert.equal(card.querySelector('a').getAttribute('href'), '/products/blank-image');
    }

    const { WidgetPanel } = await import('./src/components/support/widget/WidgetPanel.tsx');
    const root = createRoot(document.getElementById('app'));
    const trigger = document.getElementById('trigger');
    let closed = false;
    const onClose = () => { closed = true; };
    function panel(isOpen) { return React.createElement(WidgetPanel, { isOpen, position: 'bottomRight', title: 'Support', showBack: false, onBack() {}, onClose, children: React.createElement('input', { 'aria-label': 'Search support' }) }); }
    await act(() => root.render(panel(false)));
    assert.equal(document.querySelector('[role=dialog]'), null);
    assert.equal(document.querySelector('input'), null);
    trigger.focus();
    await act(() => root.render(panel(true)));
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Close support widget');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(closed, true);
    await act(() => root.render(panel(false)));
    assert.equal(document.querySelector('[role=dialog]'), null);
    assert.equal(document.activeElement, trigger);
    await act(() => root.unmount());
    dom.window.close();
  `], { cwd: new URL("../apps/web", import.meta.url), encoding: "utf8" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
