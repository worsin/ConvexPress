import { expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://example.invalid/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let settings = null;
mock.module('@/contexts/SettingsContext', () => ({ useSettings: () => settings }));
// Draw the Core shell directly: the template registry isn't what's under test.
mock.module('@/templates/sdk/Surface', () => ({ Surface: ({ data, fallback: Fallback }) => <Fallback data={data} /> }));
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } = await import('@tanstack/react-router');
const { AuthPageLayout } = await import('./AuthPageLayout');

async function brand(values) {
  settings = values;
  const route = createRootRoute({ component: () => <AuthPageLayout title="Sign in"><p>Form</p></AuthPageLayout> });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/login'] }) });
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />); });
    const mark = document.querySelector('[data-slot="auth-logo"]');
    return { image: mark.querySelector('img')?.getAttribute('src') ?? null, alt: mark.querySelector('img')?.getAttribute('alt') ?? null, text: mark.textContent };
  } finally { await act(async () => root.unmount()); }
}

test('the sign-in screen shows the site identity logo, named for the site', async () => {
  expect(await brand({ siteTitle: 'Clinic', siteLogo: 'kg2abc123mediaid', logoUrl: 'https://clinic.example/logo.png' })).toEqual({ image: 'https://clinic.example/logo.png', alt: 'Clinic', text: '' });
});

test('a logo media id alone is never used as an image source: the site name shows', async () => {
  expect(await brand({ siteTitle: 'Clinic', siteLogo: 'kg2abc123mediaid' })).toEqual({ image: null, alt: null, text: 'Clinic' });
});

test('the sign-in screen is the page main landmark, in every pack frame', async () => {
  settings = { siteTitle: 'Clinic' };
  const route = createRootRoute({ component: () => <AuthPageLayout title="Sign in"><p>Form</p></AuthPageLayout> });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/login'] }) });
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />); });
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelector('main h1')?.textContent).toBe('Sign in');
  } finally { await act(async () => root.unmount()); }
});
