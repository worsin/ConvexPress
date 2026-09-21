import { expect, test } from "bun:test";
import { migrateStructuredArticle, hasStructuredArticle } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacyStructuredMigration";
import { validateCanonicalTree } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/instances";
import { prepareContentMigration } from "./content-migration.mjs";
const base = { postId: "persisted-article", path: "/blog/studio-practice" };
const flatten = (tree: any[]): any[] => tree.flatMap(node => [node, ...flatten(node.children ?? [])]);

test("offline preflight uses the same structured adapter and keeps the entire original revision", async () => {
  const record = { _id: base.postId, slug: "studio-practice", type: "post", contentMode: "article", hero: { content: "Visible article" }, content: "Hidden original" };
  const expected = migrateStructuredArticle({ ...base, hero: record.hero });
  const plan = await prepareContentMigration({ record, sourceScope: { websiteKey: "same", instanceKey: "same" }, packId: "core", definitions: new Map(), convertStructured: () => expected });
  expect(plan.status).toBe("requires-render-acceptance");
  expect(plan.candidate.blocks).toEqual(expected);
  expect(plan.blockCount).toBe(flatten(expected).length);
  expect(plan.originalRevision).toEqual(record);
});

test("structured migration preserves visible media, inline links, ordered references and anchors without changing the source", () => {
  const source = { ...base, hero: { title: "Hidden title", subtitle: "Plain https://example.org/subtitle", imageId: "stored-image", videoUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE", content: "Keep **literal** text.\n\nUse https://example.org/path.", ctaText: "Open studio", ctaUrl: "../studio?visit=yes#hours" },
    topics: [{ subtitle: "Invisible" }, { title: "A first step", imageId: "topic-image", content: "<script>literal, never executable</script>" }, { content: "Untitled visible topic" }],
    tableOfContents: "  Read first\n\nThen continue  ", summary: { title: "A summary", content: "Finish well." }, sources: "https://example.org/source\nPrinted source" };
  const original = structuredClone(source), tree = migrateStructuredArticle(source), nodes = flatten(tree);
  expect(source).toEqual(original);
  expect(migrateStructuredArticle(source)).toEqual(tree);
  expect(validateCanonicalTree(tree)).toEqual(tree);
  expect(new Set(nodes.map(n => n.id)).size).toBe(nodes.length);
  expect(tree.map(n => n.anchor).filter(Boolean)).toEqual(["topic-a-first-step", "topic-1"]);
  expect(nodes.filter(n => n.name === "core/image").map(n => n.attrs)).toEqual([
    { mediaId: "stored-image", alt: "Hero image", caption: "", href: "" },
    { mediaId: "topic-image", alt: "A first step", caption: "", href: "" },
  ]);
  expect(nodes.find(n => n.name === "core/iframe").attrs).toEqual({ url: { href: source.hero.videoUrl, label: "Open video" }, title: "Hero video" });
  const serialized = JSON.stringify(tree);
  for (const hidden of ["Hidden title", "Invisible"]) expect(serialized).not.toContain(hidden);
  for (const kept of ["Keep **literal** text.", "<script>literal, never executable</script>", "/studio?visit=yes#hours", "#topic-a-first-step", "#topic-1", "Printed source"]) expect(serialized).toContain(kept);
  expect(nodes[1].attrs.body.content[0].content).toEqual([{ type: "text", text: source.hero.subtitle }]);
  expect(serialized).toContain('"target":"_blank"');
});

test("legacy video and CTA refusals retain their existing safe fallback instead of activating unsafe resources", () => {
  for (const [url, expected] of [["https://example.org/film", "Open video"], ["javascript:alert(1)", "Embedded content unavailable."]]) {
    const tree = migrateStructuredArticle({ ...base, hero: { videoUrl: url, ctaText: "Unlinked CTA", ctaUrl: "javascript:alert(2)" } });
    expect(JSON.stringify(tree)).toContain(expected);
    expect(JSON.stringify(tree)).toContain("Unlinked CTA");
    expect(JSON.stringify(tree)).not.toContain("javascript:");
    expect(flatten(tree).some(n => n.name === "core/iframe")).toBe(false);
  }
  expect(hasStructuredArticle({ hero: { title: "Hidden" }, topics: [{ subtitle: "Hidden" }], tableOfContents: "Not a body" })).toBe(false);
  expect(hasStructuredArticle({ hero: { ctaText: "Selects an otherwise empty section" } })).toBe(true);
});

test("duplicate anchors, unknown fields, invalid values and capacity limits refuse the whole conversion", () => {
  for (const source of [
    { topics: [{ title: "Duplicate" }, { title: "Duplicate" }] },
    { hero: { content: "x".repeat(20001) } },
    { topics: Array.from({ length: 81 }, (_, i) => ({ title: `Topic ${i}` })) },
    { hero: { content: "Visible", unrecognized: "Never discard" } },
    { summary: { content: 12 } },
    { topics: [{ title: "A".repeat(102) }] },
  ]) expect(() => migrateStructuredArticle({ ...base, ...source } as any)).toThrow();
});
