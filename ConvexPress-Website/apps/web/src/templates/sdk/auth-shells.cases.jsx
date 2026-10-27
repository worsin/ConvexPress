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

const shells = {
  core: (await import('../packs/core/surfaces/auth.shell')).default,
  journal: (await import('../packs/journal/surfaces/auth.shell')).default,
  depot: (await import('../packs/depot/surfaces/auth.shell')).default,
  'aster-house': (await import('../packs/aster-house/surfaces/auth.shell')).default,
};

for (const [packId, Shell] of Object.entries(shells)) {
  test(`${packId}: a sign-in screen has one heading, its title`, async () => {
    const data = { title: 'Sign in', description: 'Welcome back.', showLogo: true, maxWidth: 'sm', siteTitle: 'Clinic', children: <form aria-label="Sign in form" /> };
    const route = createRootRoute({ component: () => <Shell data={data} packId={packId} /> });
    const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/login'] }) });
    const root = createRoot(document.getElementById('root'));
    try {
      await act(async () => { await router.load(); root.render(<RouterProvider router={router} />); });
      expect([...document.querySelectorAll('h1')].map((node) => node.textContent)).toEqual(['Sign in']);
    } finally { await act(async () => root.unmount()); }
  });
}
