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
