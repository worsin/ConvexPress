import { expect, test } from "bun:test";
import { prepareContentMigration, renderedContentSource, assertMigrationSourceUnchanged } from "./content-migration.mjs";
import { z } from "./schema.mjs";

const scope = { websiteKey: "website-a", instanceKey: "staging-a" };
const richSpec = { name: "core/rich-text", version: 2, supports: { children: false }, fields: [{ id: "body", type: "richtext", required: true }] };
const definitions = new Map([[richSpec.name, { spec: richSpec }]]);
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "and this", marks: [{ type: "link", attrs: { href: "/notes" } }] }] }] };
const article = { _id: "persisted-article", type: "post", contentMode: "blocks", content: JSON.stringify(doc), blocksRevision: 7, updatedAt: 100, customPreservedField: { value: "source metadata" } };

test("block-mode articles with no block array retain their actually rendered document and marks", async () => {
  expect(renderedContentSource(article)).toBe("document");
  const original = structuredClone(article);
  const plan = await prepareContentMigration({ record: article, sourceScope: scope, definitions, packId: "journal" });
  expect(plan.status).toBe("requires-render-acceptance");
  expect(plan.candidate.blocks[0].attrs.body).toEqual(doc);
  expect(plan.originalRevision).toEqual(original);
  expect(article).toEqual(original);
  expect(plan.candidate.contentMode).toBeUndefined();
  expect(plan.candidate.content).toBeUndefined();
  expect(plan.legacyFieldsToRetireAfterAcceptance).toContain("contentMode");
  const repeat = await prepareContentMigration({ record: article, sourceScope: scope, definitions, packId: "journal" });
  expect(repeat.candidate).toEqual(plan.candidate);
  assertMigrationSourceUnchanged(plan, original, scope);
  expect(() => assertMigrationSourceUnchanged(plan, { ...original, updatedAt: 101 }, scope)).toThrow();
  expect(() => assertMigrationSourceUnchanged(plan, original, { ...scope, instanceKey: "production-a" })).toThrow();
});

test("page rendering precedence and unsupported article structures are explicit, never silently emptied", async () => {
  const hidden = await prepareContentMigration({ record: { ...article, type: "page" }, sourceScope: scope, definitions, packId: "journal" });
  expect(hidden.issue.code).toBe("HIDDEN_LEGACY_CONTENT");
  for (const content of ["<p>Unconverted HTML</p>", JSON.stringify({ type: "doc", content: [{ type: "table", content: [] }] })]) {
    const input = { ...article, content };
    const plan = await prepareContentMigration({ record: input, sourceScope: scope, definitions, packId: "journal" });
    expect(plan.status).toBe("requires-conversion");
    expect(plan.originalRevision).toEqual(input);
    expect(plan.candidate).toBeUndefined();
  }
  const unsafe = { ...article, content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Unsafe", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }) };
  expect((await prepareContentMigration({ record: unsafe, sourceScope: scope, definitions, packId: "journal" })).status).toBe("requires-conversion");
});

test("legacy block identity, unknown names, duplicate IDs, and child placement are validated", async () => {
  const spec = { name: "core/example", version: 1, supports: { children: false }, fields: [{ id: "text", type: "text" }] };
  const legacyDefinitions = new Map([[spec.name, { spec, legacySchema: z.object({ text: z.string().optional() }) }]]);
  const block = { id: "existing-id", name: spec.name, version: 1, attrs: { text: "Saved text" } };
  const prepare = blocks => prepareContentMigration({ record: { ...article, type: "page", blocks }, sourceScope: scope, definitions: legacyDefinitions, packId: "journal" });
  expect((await prepare([block])).candidate.blocks).toEqual([block]);
  expect((await prepare([block, block])).issue.code).toBe("BLOCK_ID");
  expect((await prepare([{ ...block, name: "missing/block" }])).issue.code).toBe("MISSING_BLOCK_MIGRATION");
  expect((await prepare([{ ...block, innerBlocks: [{ ...block, id: "child" }] }])).issue.code).toBe("CHILDREN_MIGRATION_REQUIRED");
  const multiple = await prepare([{ ...block, name: "missing/first" }, { ...block, id: "second", name: "missing/second" }]);
  expect(multiple.issues.map(issue => issue.path)).toEqual([["blocks", 0], ["blocks", 1]]);
  expect(multiple.candidate).toBeUndefined();
  expect(multiple.originalRevision.blocks).toHaveLength(2);
  await expect(prepareContentMigration({ record: article, sourceScope: scope, targetScope: { ...scope, websiteKey: "other" }, definitions })).rejects.toThrow("exact source environment");
});

test("blog structured content has the same precedence as all four public post surfaces", async () => {
  for (const fields of [
    { hero: { content: "Visible structured introduction" } },
    { topics: [{ title: "Visible topic" }] },
    { summary: { title: "Visible summary" } },
    { sources: "https://example.org/source" },
  ]) {
    const input = { ...article, ...fields };
    expect(renderedContentSource(input)).toBe("structured");
    const plan = await prepareContentMigration({ record: input, sourceScope: scope, definitions, packId: "journal" });
    expect(plan.candidate).toBeUndefined();
    expect(plan.issue.code).toBe("STRUCTURED_ADAPTER_REQUIRED");
    expect(plan.originalRevision).toEqual(input);
  }
  expect(renderedContentSource({ ...article, hero: { title: "Not rendered alone" }, topics: [{ subtitle: "Not rendered alone" }], tableOfContents: "Not rendered alone" })).toBe("document");
  expect(renderedContentSource({ ...article, blocks: [{ id: "existing" }], hero: { content: "Lower precedence" } })).toBe("blocks");
});
