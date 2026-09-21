import { expect, test } from "bun:test";
import { planCanonicalData } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/planner";
import { canonicalTreeSchema, validateCanonicalTree, collectCanonicalAnchors } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/instances";
import { anchorDescriptors } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/metadata";
import { blockSpecSchema } from "./schema.mjs";
import { anchorFields } from "./generator.mjs";
import catalog from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/catalog.json";
const scope = { websiteKey: "website", instanceKey: "staging" };
const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
const heading = (id: string, attrs = {}) => ({ id, name: "core/heading", version: 2, attrs });

test("the actual data planner rejects legacy/unsupported layout before any resolver work", () => {
  expect(() => planCanonicalData([{ ...heading("heading"), layout: { padding: "large" } }], scope, policy)).toThrow();
  expect(() => planCanonicalData([{ ...heading("heading"), layout: { align: "end" } }], scope, policy)).toThrow();
});

test("whole-page generated anchors reject collisions across heading attrs and instance envelopes", () => {
  expect(() => planCanonicalData([heading("first", { anchor: "same" }), { ...heading("second"), anchor: "same" }], scope, policy)).toThrow();
  expect(() => planCanonicalData([heading("first", { anchor: "invalid space" })], scope, policy)).toThrow();
});

test("saved style identities survive planning while malformed envelopes are refused", () => {
  expect(() => planCanonicalData([{ ...heading("heading"), style: "signature-unknown" }], scope, policy)).not.toThrow();
  expect(() => planCanonicalData([{ ...heading("heading"), anchor: 123 }], scope, policy)).toThrow();
});

test("generated name-correlated tree preserves marks, intent, IDs and recursive children", () => {
  const text = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A marked heading", marks: [{ type: "bold" }, { type: "link", attrs: { href: "/notes", target: "_self" } }] }, { type: "hardBreak" }] }] };
  const tree = [{ id: "section", name: "core/section", version: 1, attrs: {}, layout: { width: "wide", tone: "muted", spacing: "spacious", align: "center" }, children: [{ ...heading("marked", { text, anchor: "article-title" }), visibility: "everyone", lock: { edit: false } }] }];
  const parsed = validateCanonicalTree(tree);
  expect(parsed[0].layout).toEqual(tree[0].layout);
  expect(parsed[0].children?.[0].attrs.text).toEqual(text);
  expect(parsed[0].children?.[0].id).toBe("marked");
  expect(canonicalTreeSchema.safeParse(tree).success).toBe(true);
});

test("the shared type vocabulary is closed and unsupported active policies refuse", () => {
  for (const extra of [
    { visibility: { mode: "signedIn" } }, { visibility: "signedIn" },
    { visibility: "signedOut" }, { lock: { edit: "yes" } }, { lock: { unknown: false } },
    { layout: { className: "mx-8" } }, { innerBlocks: [] }, { attrs: [] },
  ]) expect(canonicalTreeSchema.safeParse([{ ...heading("x"), ...extra }]).success).toBe(false);
  expect(canonicalTreeSchema.safeParse([{ ...heading("x"), unknown: true }]).success).toBe(false);
  expect(canonicalTreeSchema.safeParse([{ ...heading("x"), version: 1 }]).success).toBe(false);
});

test("bounds reject excessive depth, nodes and bytes without silently dropping nodes", () => {
  expect(() => validateCanonicalTree(Array.from({ length: 81 }, (_, i) => heading(`h${i}`)))).toThrow();
  let nested: unknown = heading("leaf");
  for (let i = 0; i < 8; i++) nested = { id: `section${i}`, name: "core/section", version: 1, attrs: {}, children: [nested] };
  expect(() => validateCanonicalTree([nested])).toThrow();
  expect(() => validateCanonicalTree([heading("large", { anchor: "x".repeat(512 * 1024) })])).toThrow();
  expect(() => validateCanonicalTree([heading("duplicate"), heading("duplicate")])).toThrow();
  expect(() => validateCanonicalTree([{ ...heading("leaf"), children: [] }])).toThrow();
});

test("explicit DOM-ID metadata handles repeaters and ignores links and unrelated media ids", () => {
  expect(anchorDescriptors["core/heading"]).toEqual([{ path: ["anchor"] }]);
  expect(anchorDescriptors["core/footnotes"]).toEqual([{ path: ["notes", "*", "key"] }]);
  expect(anchorFields([{ id: "groups", type: "repeater", fields: [{ id: "nested", type: "object", fields: [{ id: "target", type: "text", domId: true }, { id: "anchor", type: "link" }] }] }])).toEqual([{ path: ["groups", "*", "nested", "target"] }]);
  expect(collectCanonicalAnchors({ notes: [{ key: "note-one" }, { key: "note-two" }] }, anchorDescriptors["core/footnotes"])).toEqual([{ value: "note-one", path: "attrs.notes.0.key" }, { value: "note-two", path: "attrs.notes.1.key" }]);
  const footnote = catalog.find(block => block.name === "core/footnotes")!;
  const attrs = footnote.examples[0];
  const key = (attrs as any).notes[0].key;
  expect(() => validateCanonicalTree([{ id: "notes", name: footnote.name, version: footnote.version, attrs }, heading("title", { anchor: key })])).toThrow();
  const spec = { ...catalog.find(block => block.name === "core/heading")!, fields: [{ id: "image", type: "media", domId: true }] };
  expect(blockSpecSchema.safeParse(spec).success).toBe(false);
});

test("every discovered canonical specimen satisfies the complete standalone tree contract", () => {
  for (const block of catalog) for (const attrs of block.examples) {
    const result = validateCanonicalTree([{ id: "example", name: block.name, version: block.version, attrs }]);
    expect(result[0].attrs).toEqual(attrs);
  }
});
