import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import assistant from "../../../../../../../blocks/commerce/assistant-band/render";
import { prepareBlocks } from "./model";
import { ShoppingAssistantProvider, type ShoppingAssistantHost } from "./shopping-assistant";

const policy = { enabledPlugins: ["commerce"], capabilities: [], disabledBlocks: [] };
const host: ShoppingAssistantHost = {
  enabled: true, catalogEnabled: true, mobileAvailable: true,
  displayName: "Your shop guide", tagline: "Find your next favorite.",
  starterPrompts: ["Help me choose a gift.", "What fits in a carry-on?"],
};
function render(attrs: Record<string, unknown> = {}, value: ShoppingAssistantHost | null = host) {
  const content = prepareBlocks([{ id: "assistant", name: "commerce/assistant-band", version: 1, attrs }],
    { "commerce/assistant-band": assistant }, policy, { media: {} });
  return renderToStaticMarkup(value ? <ShoppingAssistantProvider value={value}>{content}</ShoppingAssistantProvider> : content);
}
function document(html: string) { return new JSDOM(html).window.document; }

test("assistant preserves all eight authored questions and encodes their exact text without HTML injection", () => {
  const prompts = ['Gift & tea? #sale + café / <script>alert(1)</script>', ...Array.from({ length: 7 }, (_, i) => `Question ${i + 2}?`)];
  const doc = document(render({ prompts }));
  const links = [...doc.querySelectorAll('.cp-assistant-questions a')];
  expect(links).toHaveLength(8);
  links.forEach((link, index) => {
    const url = new URL(link.getAttribute('href')!, 'https://shop.example');
    expect(url.pathname).toBe('/products');
    expect([...url.searchParams.keys()]).toEqual(['ask']);
    expect(url.searchParams.get('ask')).toBe(prompts[index]);
    expect(link.textContent).toContain(prompts[index]);
  });
  expect(doc.querySelector('script')).toBeNull();
  expect(doc.querySelector('ol')?.getAttribute('aria-label')).toBe('Questions for the shopping assistant');
});

test("assistant uses bounded configured defaults only when no questions were authored", () => {
  const configured = { ...host, starterPrompts: ['', '   ', 'x'.repeat(161), ...Array.from({ length: 10 }, (_, i) => `Default ${i}`)] };
  const doc = document(render({}, configured));
  expect(doc.querySelectorAll('.cp-assistant-questions a')).toHaveLength(8);
  expect(doc.body.textContent).toContain(host.displayName);
  expect(doc.body.textContent).toContain(host.tagline);
  expect(doc.body.textContent).not.toContain('Default 8');
  const authored = document(render({ prompts: ['My own question'], eyebrow: 'Authored title', body: 'Authored body' }, configured));
  expect(authored.querySelectorAll('.cp-assistant-questions a')).toHaveLength(1);
  expect(authored.body.textContent).not.toContain('Default 0');
  expect(authored.body.textContent).toContain('Authored title');
  expect(authored.body.textContent).toContain('Authored body');
});

test("unavailable, disabled and catalog-disabled assistants expose only the authored fallback action", () => {
  for (const value of [null, { ...host, enabled: false }, { ...host, catalogEnabled: false }]) {
    const doc = document(render({ prompts: ['Cannot launch'], ctaLabel: 'Explore', ctaUrl: '/products' }, value));
    expect(doc.querySelectorAll('a')).toHaveLength(1);
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('/products');
    expect(doc.body.textContent).toBe('Explore');
    expect(doc.querySelector('.cp-assistant-questions')).toBeNull();
  }
  const empty = document(render({ ctaLabel: '', ctaUrl: '' }, null));
  expect(empty.body.textContent).toBe('');
  expect(empty.querySelector('a')).toBeNull();
});

test("no configured questions leaves no empty column or question region", () => {
  const doc = document(render({}, { ...host, starterPrompts: [] }));
  expect(doc.querySelector('.cp-split')).toBeNull();
  expect(doc.querySelector('.cp-assistant-questions')).toBeNull();
  expect(doc.body.textContent).toContain('Not sure what fits? Ask.');
  expect(doc.querySelector('a')?.getAttribute('href')).toBe('/products');
});

test("mobile-hidden configuration supplies a separate CSS-gated browse action with no assistant question", () => {
  const doc = document(render({}, { ...host, mobileAvailable: false }));
  expect(doc.querySelector('.cp-assistant-band')?.getAttribute('data-mobile-available')).toBe('false');
  const fallback = doc.querySelector('.cp-assistant-mobile-fallback')!;
  expect(fallback.querySelectorAll('a')).toHaveLength(1);
  expect(fallback.querySelector('a')?.getAttribute('href')).toBe('/products');
  expect(fallback.querySelector('[href*="ask="]')).toBeNull();
  expect(document(render()).querySelector('.cp-assistant-mobile-fallback')).toBeNull();
});

test("commerce policy excludes assistant blocks before rendering", () => {
  expect(() => prepareBlocks([{ id: 'assistant', name: 'commerce/assistant-band', version: 1, attrs: {} }],
    { 'commerce/assistant-band': assistant }, { ...policy, enabledPlugins: [] }, { media: {} })).toThrow();
});
