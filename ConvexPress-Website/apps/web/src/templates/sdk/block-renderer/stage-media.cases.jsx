import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { render } from "./media.cases";
import steps from "../../../../../../../blocks/core/steps-with-media/render";

test("decoded step images stay bound to their source across edits, errors and removal", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(dom.window.HTMLImageElement.prototype, 'complete', { get: () => false });
  Object.defineProperty(dom.window.HTMLImageElement.prototype, 'naturalWidth', { get: () => 1024 });
  const pending = [];
  dom.window.HTMLImageElement.prototype.decode = function () { return new Promise((resolve, reject) => pending.push({ source: this.getAttribute('src'), resolve, reject })); };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const stage = () => dom.window.document.querySelector('.cp-library-scroll-visual');
  const show = async id => act(async () => root.render(render(steps, { steps: [{ title: 'The current step', ...(id ? { media: { id } } : {}) }] })));
  const load = async () => act(async () => stage().querySelector('img').dispatchEvent(new dom.window.Event('load')));
  try {
    await show('photo'); await load();
    expect(pending[0].source).toBe('/photo.png');
    await show('after');
    await act(async () => pending[0].resolve());
    expect(stage().dataset.mediaState).toBe('loading');
    await load(); expect(pending[1].source).toBe('/after.png');
    await act(async () => pending[1].resolve());
    expect(stage().dataset.mediaState).toBe('ready');
    await show('photo'); await load();
    await act(async () => pending[2].reject(new Error('Decode failed')));
    expect(stage().dataset.mediaState).toBe('error');
    expect(stage().textContent).toContain('Image unavailable');
    await show('after'); await load();
    await show(undefined);
    await act(async () => pending[3].resolve());
    expect(stage().dataset.mediaState).toBe('absent');
    expect(stage().querySelector('img')).toBeNull();
    expect(stage().textContent).toContain('The current step');
  } finally {
    await act(async () => root.unmount());dom.window.close();Object.assign(globalThis, previous);
  }
});
