import { expect, test } from "bun:test";
import { parseComposedDefinition, encodeComposedDefinition, decodeComposedDefinition, composedAttrsSchema } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";

const definition = () => ({
  spec: { name: "composed/welcome", title: "Welcome", description: "An authored welcome", category: "text", role: "content", version: 1,
    keywords: [], ai: { useFor: "An introduction", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: "Welcome", max: 80 }],
    supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
  composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
});

test("composed definitions retain the canonical spec vocabulary and reproducible content digest", () => {
  const input = definition();
  const encoded = encodeComposedDefinition(input);
  expect(decodeComposedDefinition(encoded.json, encoded.digest)).toEqual(encoded);
  const reordered = { composition: input.composition, spec: Object.fromEntries(Object.entries(input.spec).reverse()) };
  expect(encodeComposedDefinition(reordered).digest).toBe(encoded.digest);
  expect(composedAttrsSchema(encoded.definition).parse({})).toEqual({ title: "Welcome" });
  expect(() => composedAttrsSchema(encoded.definition).parse({ title: 7 })).toThrow();
  expect(() => composedAttrsSchema(encoded.definition).parse({ extra: true })).toThrow();
  expect(() => decodeComposedDefinition(encoded.json, "f".repeat(64))).toThrow("integrity");
});

test("invalid namespaces, examples and pack treatments fail before a definition can be stored", () => {
  const input = definition();
  for (const name of ["core/welcome", "composed/../welcome", "composed/Welcome", "composed/"]) {
    expect(() => parseComposedDefinition({ ...input, spec: { ...input.spec, name } })).toThrow();
  }
  expect(() => parseComposedDefinition({ ...input, published: true })).toThrow();
  expect(() => parseComposedDefinition({ ...input, composition: { version: 1, root: { el: "Text", bind: "attrs.missing" } } })).toThrow();
  expect(() => parseComposedDefinition({ ...input, spec: { ...input.spec, examples: [{ title: 2 }] } })).toThrow();
  expect(() => parseComposedDefinition({ ...input, packTreatments: { "../foreign": input.composition } })).toThrow();
  expect(() => parseComposedDefinition({ ...input, packTreatments: { journal: { version: 1, root: { el: "Text", props: { style: "position:fixed" }, bind: "attrs.title" } } } })).toThrow();
  expect(() => parseComposedDefinition({ ...input, packTreatments: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`pack-${i}`, input.composition])) })).toThrow("16");
});
