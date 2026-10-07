import { expect, test, mock } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
let matches = [];
mock.module('@tanstack/react-router', () => ({
  useMatches: () => matches,
  Link: ({to, children, ...props}) => createElement('a', {...props, href: to}, children),
}));
const { Breadcrumbs } = await import('./Breadcrumbs');

test('decoded route labels cannot terminate breadcrumb JSON-LD in server HTML', () => {
  const serial = '</script><img title=12345>';
  matches = [{routeId:'__root__'}, {routeId:'/_marketing/certificates/$serial', params:{serial}}];
  const html = renderToStaticMarkup(<Breadcrumbs />);
  const doc = new JSDOM(html).window.document;
  expect(doc.querySelectorAll('img').length).toBe(0);
  expect(doc.querySelectorAll('script').length).toBe(1);
  const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
  expect(data.itemListElement[1].name).toBe(doc.querySelector('[aria-current="page"]').textContent);
  expect(data.itemListElement[1].name).toContain('12345');
});

test('authored breadcrumb text and destinations round-trip as data without creating markup', () => {
  const label = '</ScRiPt><script>window.__breadcrumbProbe=1</script> & "quoted"';
  const destination = '/notes/</script><img title=67890>';
  const doc = new JSDOM(renderToStaticMarkup(<Breadcrumbs segments={[{label,to:destination},{label:'Current'}]} />)).window.document;
  expect(doc.querySelectorAll('img').length).toBe(0);
  expect(doc.querySelectorAll('script').length).toBe(1);
  const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
  expect(data.itemListElement[0].name).toBe(label);
  expect(data.itemListElement[0].item).toBe(destination);
  expect(doc.querySelector('nav').textContent).toContain(label);
});

for (const [routeId,param,label] of [
  ['/_marketing/track/$token','token','Track order'],
  ['/_marketing/wishlist/$token','token','Shared wishlist'],
  ['/_marketing/cart/shared/$shareToken','shareToken','Shared cart'],
]) {
  test(`credential route uses a generic breadcrumb: ${routeId}`, () => {
    const token='private-bearer-1234567890';
    matches=[{routeId:'__root__'}, {routeId,params:{[param]:token},loaderData:{slug:token}}];
    const html=renderToStaticMarkup(<Breadcrumbs />);
    const doc=new JSDOM(html).window.document;
    expect(doc.querySelector('[aria-current="page"]').textContent).toBe(label);
    expect(html.toLowerCase()).not.toContain(token);
    expect(doc.querySelectorAll('a')).toHaveLength(1);
    expect(doc.querySelector('a').getAttribute('href')).toBe('/');
    const data=JSON.parse(doc.querySelector('script').textContent);
    expect(data.itemListElement[1]).toEqual({'@type':'ListItem',position:2,name:label});
  });
}
