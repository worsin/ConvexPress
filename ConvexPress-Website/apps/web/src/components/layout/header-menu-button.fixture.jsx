// Every pack's header: the menu button says it opens the navigation dialog,
// names the drawer it controls, and reports whether it is open.
import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { identity, HEADER_DEFAULTS, shellState } from './header-render.fixture-support.jsx';
mock.module('@/hooks/layout/useMenuForLocation', () => ({ useMenuForLocation: () => undefined }));
let checks = 0;
for (const pack of ['core', 'journal', 'depot', 'aster-house']) {
  const { default: Header } = await import(`../../templates/packs/${pack}/surfaces/chrome.header.tsx`);
  for (const open of [false, true]) {
    shellState.mobileNavOpen = open;
    const doc = new JSDOM(renderToStaticMarkup(createElement(Header, { data: { siteIdentity: identity, headerConfig: structuredClone(HEADER_DEFAULTS) } }))).window.document;
    const button = doc.querySelector('[data-customize="header.mobileMenu.variant"]');
    assert.ok(button, `${pack}: menu button`);
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog', `${pack}: opens a dialog`);
    assert.equal(button.getAttribute('aria-controls'), 'site-mobile-nav', `${pack}: names the drawer`);
    assert.equal(button.getAttribute('aria-expanded'), String(open), `${pack}: reports open=${open}`);
    checks++;
  }
}
shellState.mobileNavOpen = false;
console.log(JSON.stringify({ menuButtonChecks: checks }));
