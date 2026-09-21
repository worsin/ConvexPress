import { expect, test } from "bun:test";
import { hasStructuredArticle, migrateStructuredArticle } from "./legacyStructuredMigration";
import type { CanonicalTree } from "./generated/types";

const identity = { postId: "persisted-post", path: "/blog/article" };
const flat = (tree: CanonicalTree): CanonicalTree => tree.flatMap(node => [node, ...flat(node.children ?? [])]);
const texts = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(texts) : value && typeof value === "object"
  ? Object.entries(value).flatMap(([key, entry]) => key === "text" && typeof entry === "string" ? [entry] : texts(entry)) : [];

test("structured conversion retains visible order, filtered-topic anchors, literal text and links without mutating source", () => {
  const source = { ...identity,
    hero: { title: "Hidden hero title", subtitle: "Literal <subtitle>", content: "  Intro https://example.com/notes\n\nSecond paragraph  ", ctaText: "Go", ctaUrl: "/go" },
    topics: [{ subtitle: "Ignored subtitle-only topic" }, { title: "First actual topic", subtitle: "Topic subtitle", content: "First body" }, { content: "Second body", imageId: "demo-image", title: "" }],
    tableOfContents: "First label\nSecond label", summary: { title: "Conclusion", content: "Summary body" }, sources: " Original https://example.com/source\nReference B ",
  };
  const before = structuredClone(source), tree = migrateStructuredArticle(source), all = flat(tree);
  expect(source).toEqual(before);
  expect(migrateStructuredArticle(source)).toEqual(tree);
  expect(tree.map(node => texts(node)[0])).toEqual(["Literal <subtitle>", "Table of Contents", "First actual topic", "Second body", "Conclusion", "Sources"]);
  expect(all.filter(node => node.anchor).map(node => node.anchor)).toEqual(["topic-first-actual-topic", "topic-1"]);
  for (const text of ["  Intro ", "Second paragraph  ", "Topic subtitle", "Reference B"]) expect(texts(tree)).toContain(text);
  const encoded = JSON.stringify(tree);
  for (const hidden of ["Hidden hero title", "Ignored subtitle-only topic"]) expect(encoded).not.toContain(hidden);
  for (const link of ['"target":"_blank"', "#topic-first-actual-topic", "#topic-1"]) expect(encoded).toContain(link);
});

test("source selection preserves the legacy visible-body rule and a label-only CTA stays unrendered", () => {
  expect(hasStructuredArticle({ hero: { title: "Only title" }, topics: [{ subtitle: "Only subtitle" }], tableOfContents: "Only nav" })).toBe(false);
  expect(hasStructuredArticle({ hero: { ctaText: "Only CTA label" } })).toBe(true);
  const source = { ...identity, hero: { ctaText: "Only CTA label" } }, before = structuredClone(source);
  expect(texts(migrateStructuredArticle(source))).not.toContain("Only CTA label");
  expect(source).toEqual(before);
});

test("unreviewed videos stay links while duplicate anchors, unknown fields and excessive nodes refuse conversion", () => {
  const tree = migrateStructuredArticle({ ...identity, topics: [{ videoUrl: "https://example.com/embed" }] });
  expect(flat(tree).some(node => node.name === "core/iframe")).toBe(false);
  expect(JSON.stringify(tree)).toContain('"href":"https://example.com/embed"');
  expect(() => migrateStructuredArticle({ ...identity, topics: [{ title: "Same!" }, { title: "Same" }] })).toThrow();
  expect(() => migrateStructuredArticle({ ...identity, hero: { content: "body", unknown: "retained" } } as any)).toThrow();
  expect(() => migrateStructuredArticle({ ...identity, topics: Array.from({ length: 80 }, (_, i) => ({ title: `Topic ${i}`, content: "Body" })) })).toThrow();
});

test("safe literal HTML, entities and quoted HTTP URLs migrate without interpretation", () => {
  const content = '<strong>Literal</strong> A &amp; B https://example.com/"onclick="bad';
  const source = { ...identity, hero: { content }, sources: content }, before = structuredClone(source);
  const body = flat(migrateStructuredArticle(source)).find(node => node.name === "core/paragraph")!;
  expect(source).toEqual(before);
  expect(texts(body.attrs).join("")).toBe(content);
  expect((body.attrs as any).body.content[0].content.at(-1).marks[0].attrs.href).toBe('https://example.com/"onclick="bad');
});

test("CTA conversion retains rejected destinations in the unchanged source and emits only safe display text", () => {
  for (const url of ["javascript:alert(1)", "/\\example.com", "/\n/example.com"]) {
    const source = { ...identity, hero: { ctaText: "Authored label", ctaUrl: url } }, before = structuredClone(source);
    const tree = migrateStructuredArticle(source);
    expect(source).toEqual(before);
    expect(texts(tree)).toContain("Authored label");
    expect(JSON.stringify(tree)).not.toContain('"type":"link"');
  }
  const tree = migrateStructuredArticle({ ...identity, hero: { ctaText: "Visit", ctaUrl: " HTTPS://example.com/contact " } });
  const paragraph = flat(tree).find(node => node.name === "core/paragraph")!;
  expect((paragraph.attrs as any).body.content[0].content[0].marks[0].attrs).toEqual({ href: "HTTPS://example.com/contact", target: "_blank" });
});
