import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, legacyInventory } from "./migrate-existing";
import { migrateLegacyBlock } from "./staged-migration.mjs";
const scope = { websiteKey: "aster-house", instanceKey: "staging" };
async function input(name: string, attrs: Record<string, unknown> = {}) {
  const legacy = (await legacyInventory()).find(block => block.name === name)!;
  const spec = JSON.parse(await readFile(path.join(ROOT, `blocks/${name}/block.json`), "utf8"));
  return { block: { id: "unchanged-block-id", name, version: 1, attrs }, spec, legacySchema: legacy.schema, websiteSchema: legacy.websiteSchema, sourceScope: scope, targetScope: scope, packId: "journal" };
}
test("safe URL conversion rejects active schemes, protocol-relative, malformed/control URLs without mutating the original", async () => {
  for (const href of ["javascript:alert(1)", "data:text/html,bad", "//host/path", "https://", "/\\host", "https://host/\npath"]) {
    const request = await input("core/image", { href });
    const original = structuredClone(request.block);
    await expect(migrateLegacyBlock(request)).rejects.toThrow();
    expect(request.block).toEqual(original);
  }
  for (const href of ["", "/events", "https://aster.example/events", "#notes", "mailto:hello@aster.example", "tel:+13035550100"]) {
    const request = await input("core/image", { href });
    expect((await migrateLegacyBlock(request)).block.attrs.href).toBe(href);
  }
});
test("invalid empty copy becomes explicit absence, and old Website defaults/render projection are preserved", async () => {
  for (const name of ["core/hero", "core/quote", "core/heading", "core/comparison-table", "core/contact-form", "core/newsletter-signup"]) {
    const request = await input(name);
    const result = await migrateLegacyBlock({ ...request, resolveTreatment: async (r: any) => ({ ...r, style: "legacy-verified", verified: true }) });
    expect(result.revision.original).toEqual(request.block);
    expect(result.legacyRender.attrs).toEqual(request.websiteSchema.parse({}));
    expect(result.block.id).toBe(request.block.id);
    expect(result.block.version).toBe(2);
  }
  expect((await migrateLegacyBlock(await input("core/heading"))).block.attrs.text).toBeNull();
  expect((await migrateLegacyBlock(await input("core/comparison-table"))).block.attrs.columns).toBeNull();
  const long = await input("core/paragraph", { body: "x".repeat(2001) });
  await expect(migrateLegacyBlock(long)).rejects.toThrow();
  expect(long.block.attrs.body).toHaveLength(2001);
  let calls = 0;
  await expect(migrateLegacyBlock({ ...await input("core/hero-split", { primaryCtaUrl: "javascript:bad" }), resolveTreatment: async () => { calls++; return {}; } })).rejects.toThrow();
  expect(calls).toBe(0);
});
test("design attrs leave content only with an exact verified treatment; arbitrary or unverified mappings fail", async () => {
  const request = await input("reference/field-guide", { spacing: 7, alignment: "right", font: "display", ink: "muted", note: null, items: [{ label: "Place", value: "Aster House" }] });
  await expect(migrateLegacyBlock(request)).rejects.toThrow("verified pack treatment");
  await expect(migrateLegacyBlock({ ...request, resolveTreatment: async (r: any) => ({ ...r, style: "chosen", verified: false }) })).rejects.toThrow("not been verified");
  await expect(migrateLegacyBlock({ ...request, resolveTreatment: async (r: any) => ({ ...r, style: "chosen", verified: true, properties: [] }) })).rejects.toThrow("exact legacy values");
  await expect(migrateLegacyBlock({ ...request, resolveTreatment: async (r: any) => ({ ...r, style: "chosen", verified: true, packId: "other" }) })).rejects.toThrow("pack");
  const result = await migrateLegacyBlock({ ...request, resolveTreatment: async (r: any) => ({ ...r, style: "field-guide-legacy", verified: true }) });
  for (const key of ["spacing", "alignment", "font", "ink"]) expect(Object.hasOwn(result.block.attrs, key)).toBe(false);
  expect(result.block.attrs.items).toEqual(request.block.attrs.items);
  expect(result.block.style).toBe("field-guide-legacy");
  expect(result.legacyRender.attrs.spacing).toBe(7);
  await expect(migrateLegacyBlock({ ...await input("reference/field-guide", { spacing: 999 }), resolveTreatment: async (r: any) => ({ ...r, style: "chosen", verified: true }) })).rejects.toThrow();
});
test("tag and user mapping is target-bound; wrong taxonomy/customer/unreviewed or guessed authors fail", async () => {
  const tag = await input("core/latest-posts", { tagSlug: "field-notes" });
  await expect(migrateLegacyBlock(tag)).rejects.toThrow("tagSlug");
  for (const bad of [{ taxonomy: "categories" }, { targetScope: { ...scope, instanceKey: "live" } }, { sourceValue: "different" }, { storage: "id" }]) {
    await expect(migrateLegacyBlock({ ...tag, resolveReference: async (r: any) => ({ targetScope: r.targetScope, sourceValue: r.value, value: "field-notes", taxonomy: "tags", storage: "slug", ...bad }) })).rejects.toThrow();
  }
  expect((await migrateLegacyBlock({ ...tag, resolveReference: async (r: any) => ({ targetScope: r.targetScope, sourceValue: r.value, value: "field-notes", taxonomy: "tags", storage: "slug" }) })).block.attrs.tagSlug).toBe("field-notes");
  const user = await input("core/author-bio", { userId: "old-author" });
  await expect(migrateLegacyBlock(user)).rejects.toThrow("userId");
  for (const bad of [{ kind: "customer" }, { reviewed: false }, { sourceValue: "guessed-by-email" }, { targetScope: { ...scope, websiteKey: "other" } }]) {
    await expect(migrateLegacyBlock({ ...user, resolveReference: async (r: any) => ({ targetScope: r.targetScope, sourceValue: r.value, value: "target-author", kind: "author", reviewed: true, ...bad }) })).rejects.toThrow();
  }
  expect((await migrateLegacyBlock({ ...user, resolveReference: async (r: any) => ({ targetScope: r.targetScope, sourceValue: r.value, value: "target-author", kind: "author", reviewed: true }) })).block.attrs.userId).toBe("target-author");
  expect((await migrateLegacyBlock(await input("core/author-bio", { userId: "" }))).block.attrs.userId).toBe("");
});
test("unknown attrs, cross-environment changes, nested legacy children and wrong versions refuse without stripping", async () => {
  await expect(migrateLegacyBlock(await input("core/heading", { unknownData: "keep" }))).rejects.toThrow("Unknown original attribute");
  const request = await input("core/heading");
  await expect(migrateLegacyBlock({ ...request, targetScope: { ...scope, instanceKey: "live" } })).rejects.toThrow("exact source environment");
  await expect(migrateLegacyBlock({ ...request, block: { ...request.block, version: 2 } })).rejects.toThrow("version/name");
  await expect(migrateLegacyBlock({ ...request, block: { ...request.block, innerBlocks: [request.block] } })).rejects.toThrow("separate block-tree migration");
});

test('legacy inline Markdown and literal prose migrate distinctly to canonical richtext without losing source', async () => {
  const source = '  A **bold** and *quiet* [walk](https://example.test/walk).\n\nReturn tomorrow.  ';
  const paragraph = await migrateLegacyBlock(await input('core/paragraph', { body: source }));
  expect(paragraph.block.attrs.body).toEqual({ type: 'doc', content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'A ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and ' }, { type: 'text', text: 'quiet', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' }, { type: 'text', text: 'walk', marks: [{ type: 'link', attrs: { href: 'https://example.test/walk', target: '_blank' } }] }, { type: 'text', text: '.' },
    ] }, { type: 'paragraph', content: [{ type: 'text', text: 'Return tomorrow.' }] },
  ] });
  expect(paragraph.revision.original.attrs.body).toBe(source);
  expect(paragraph.legacyRender.attrs.body).toBe(source);
  const section = await migrateLegacyBlock(await input('core/rich-text', { body: '**Literal stars**' }));
  expect(section.block.attrs.body.content[0].content).toEqual([{ type: 'text', text: '**Literal stars**' }]);
  const heading = await migrateLegacyBlock(await input('core/heading', { text: '*Literal heading*' }));
  expect(heading.block.attrs.text.content[0].content).toEqual([{ type: 'text', text: '*Literal heading*' }]);
  const list = await migrateLegacyBlock(await input('core/list', { items: [{ text: '**Marked item**', done: true }] }));
  expect(list.block.attrs.items[0]).toEqual({ text: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Marked item', marks: [{ type: 'bold' }] }] }] }, done: true });
});

test('legacy comparison rows with ambiguous headers require repair and retain the untouched source', async () => {
  for (const attrs of [{columns:[],rows:[{label:'Detail',cells:['One','Two']}]},{columns:['Detail','One','Two'],rows:[{label:'Detail',cells:['Only one']}]}]) {
    const request = await input('core/comparison-table',attrs);
    const original = structuredClone(request.block);
    await expect(migrateLegacyBlock(request)).rejects.toThrow();
    expect(request.block).toEqual(original);
  }
});
