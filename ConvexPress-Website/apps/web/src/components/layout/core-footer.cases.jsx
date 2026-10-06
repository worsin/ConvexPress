import { expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://example.invalid/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let menus = {};
mock.module('@/hooks/layout/useMenuForLocation', () => ({ useMenuForLocation: location => menus[location] }));
mock.module('@/hooks/layout/useSiteIdentity', () => ({ useSiteIdentity: () => undefined }));
mock.module('@/hooks/layout/useFooterConfig', () => ({ useFooterConfig: () => undefined }));
const convex = await import('convex/react');
mock.module('convex/react', () => ({ ...convex, useMutation: () => async () => {} }));
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } = await import('@tanstack/react-router');
const { SiteFooter } = await import('./SiteFooter');
const { FOOTER_DEFAULTS } = await import('@/templates/sdk/chromeDefinitions');

function menu(label, url, extra = {}) {
  return { items: [{ id: label, label, url, type: 'custom', children: [], ...extra }] };
}
async function render({ config = {}, identity = {}, variant = 'full' } = {}, check) {
  const footerConfig = structuredClone(FOOTER_DEFAULTS);
  Object.assign(footerConfig, { rows: [], newsletter: { ...footerConfig.newsletter, enabled: false }, contactInfo: { ...footerConfig.contactInfo, enabled: false }, branding: { ...footerConfig.branding, enabled: true, showLogo: true, showSocial: false }, ...config });
  const route = createRootRoute({ component: () => <SiteFooter variant={variant} siteIdentity={{ title: 'Fieldwork Studio', ...identity }} footerConfig={footerConfig} /> });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />); });
    await check(document.querySelector('footer'));
  } finally { await act(async () => root.unmount()); }
}

test('configured columns use their assigned menus and headings', async () => {
  menus = { 'footer-1': menu('Work', '/page/work'), 'footer-2': menu('Care', '/page/care'), footer: menu('Old link', '/old') };
  await render({ config: { navColumns: { enabled: true, columns: [{ heading: 'Explore', menuSource: 'footer-1' }, { heading: 'Help', menuSource: 'footer-2' }] } } }, footer => {
    expect([...footer.querySelectorAll('h3')].map(n => n.textContent)).toEqual(['Explore', 'Help']);
    expect(footer.querySelector('a[href="/page/work"]')).not.toBeNull();
    expect(footer.querySelector('a[href="/page/care"]')).not.toBeNull();
    expect(footer.querySelector('a[href="/old"]')).toBeNull();
  });
});
test('missing logo uses the site title', async () => {
  menus = {};
  await render({}, footer => expect(footer.querySelector('a[href="/"]')?.textContent).toBe('Fieldwork Studio'));
});
test('configured logo preserves its link and alt text', async () => {
  menus = {};
  await render({ identity: { logoUrl: '/logo.png', logoAlt: 'Studio logo' } }, footer => {
    expect(footer.querySelector('a[href="/"] img')?.getAttribute('src')).toBe('/logo.png');
    expect(footer.querySelector('img')?.alt).toBe('Studio logo');
  });
});
test('unassigned first column falls back to the old footer menu', async () => {
  menus = { footer: menu('Legacy about', '/about') };
  await render({ config: { navColumns: { enabled: true, columns: [{ heading: 'Explore', menuSource: 'footer-1' }] } } }, footer => {
    expect(footer.querySelector('h3')?.textContent).toBe('Explore');
    expect(footer.querySelector('a[href="/about"]')).not.toBeNull();
  });
});
test('disabled columns remain hidden', async () => {
  menus = { 'footer-1': menu('Work', '/page/work') };
  await render({ config: { navColumns: { enabled: false, columns: [{ heading: 'Explore', menuSource: 'footer-1' }] } } }, footer => {
    expect(footer.querySelector('[data-slot="footer-nav"]')).toBeNull();
    expect(footer.querySelector('h3')).toBeNull();
  });
});
test('orphaned links stay hidden and target attributes survive', async () => {
  menus = { 'footer-1': { items: [...menu('Gone', '/gone', { isOrphaned: true }).items, ...menu('Outside', 'https://example.invalid/help', { target: '_blank', rel: 'noopener noreferrer' }).items] } };
  await render({ config: { navColumns: { enabled: true, columns: [{ heading: 'Help', menuSource: 'footer-1' }] } } }, footer => {
    expect(footer.querySelector('a[href="/gone"]')).toBeNull();
    expect(footer.querySelector('a[href="https://example.invalid/help"]')?.target).toBe('_blank');
    expect(footer.querySelector('a[href="https://example.invalid/help"]')?.rel).toBe('noopener noreferrer');
  });
});
