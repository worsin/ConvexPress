import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://example.invalid/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } = await import('@tanstack/react-router');

const surfaces = {
  core: (await import('../packs/core/surfaces/help.search')).default,
  journal: (await import('../packs/journal/surfaces/help.search')).default,
  depot: (await import('../packs/depot/surfaces/help.search')).default,
  'aster-house': (await import('../packs/aster-house/surfaces/help.search')).default,
};
const data = {
  q: 'baa', hasQuery: true, total: 2, hasMore: false, actions: { search() {} },
  results: [
    { _id: 'a', title: 'Signing your BAA', slug: 'signing-your-baa', excerpt: 'Before patient information.', categorySlug: 'start-here', categoryName: 'Getting started' },
    { _id: 'b', title: 'Changing your plan', slug: 'changing-your-plan', categorySlug: 'billing', categoryName: 'Billing' },
  ],
};

for (const [packId, Surface] of Object.entries(surfaces)) {
  test(`${packId}: help search has one heading, a labelled search box, and an outline without gaps`, async () => {
    const route = createRootRoute({ component: () => <Surface data={data} packId={packId} /> });
    const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/help/search?q=baa'] }) });
    const root = createRoot(document.getElementById('root'));
    try {
      await act(async () => { await router.load(); root.render(<RouterProvider router={router} />); });
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      const box = document.querySelector('form[role="search"] input[name="q"]');
      expect(box).not.toBeNull();
      const named = box.getAttribute('aria-label') || (box.id && document.querySelector(`label[for="${box.id}"]`)?.textContent?.trim());
      expect(Boolean(named)).toBe(true);
      const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((heading) => Number(heading.tagName[1]));
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    } finally { await act(async () => root.unmount()); }
  });
}

const homes = {
  core: (await import('../packs/core/surfaces/help.home')).default,
  journal: (await import('../packs/journal/surfaces/help.home')).default,
  depot: (await import('../packs/depot/surfaces/help.home')).default,
  'aster-house': (await import('../packs/aster-house/surfaces/help.home')).default,
};
const homeData = {
  categories: [{ _id: 'c', name: 'Getting started', slug: 'start-here', articleCount: 3 }],
  featured: [{ _id: 'f', title: 'Signing your BAA', slug: 'signing-your-baa', categorySlug: 'start-here' }],
  actions: { search() {} },
};
for (const [packId, Home] of Object.entries(homes)) {
  test(`${packId}: the help home's search box is labelled inside a search landmark`, async () => {
    const route = createRootRoute({ component: () => <Home data={homeData} packId={packId} /> });
    const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/help'] }) });
    const root = createRoot(document.getElementById('root'));
    try {
      await act(async () => { await router.load(); root.render(<RouterProvider router={router} />); });
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      const box = document.querySelector('form[role="search"] input[name="q"]');
      expect(box).not.toBeNull();
      const named = box.getAttribute('aria-label') || (box.id && document.querySelector(`label[for="${box.id}"]`)?.textContent?.trim());
      expect(Boolean(named)).toBe(true);
    } finally { await act(async () => root.unmount()); }
  });
}
