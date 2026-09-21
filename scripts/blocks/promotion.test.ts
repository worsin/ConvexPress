import { expect, test } from "bun:test";
import { encodeComposedDefinition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";
import { prepareBlockPromotion, decodeBlockPromotion } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/blockPromotion";

function definition() {
  return { spec: { name: "composed/services", title: "Services", description: "A reusable service introduction", category: "marketing", role: "content", version: 3, keywords: [], ai: { useFor: "Service introductions", avoid: "Checkout" },
    fields: [{ id: "headline", type: "text", default: "Thoughtful services", max: 160 }],
    supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{headline}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.headline" } },
    packTreatments: { journal: { version: 1, root: { el: "Stack", props: { gap: "lg" }, children: [{ el: "Eyebrow", bind: '"Our practice"' }, { el: "Heading", bind: "attrs.headline" }] } } } };
}

test("promotion preserves exact source and all template compositions while creating canonical version one", () => {
  const source = encodeComposedDefinition(definition()), result = prepareBlockPromotion(source.json, source.digest, "blocks/services");
  expect(result.targetSpec).toEqual({ ...source.definition.spec, name: "blocks/services", version: 1 });
  expect(result.definition).toEqual(source.definition);expect(result.bundle.sourceVersion).toBe(3);
  expect(decodeBlockPromotion(result.json)).toEqual(result);
  expect(result.json).not.toContain("deploymentOrigin");expect(result.json).not.toContain("createdBy");
  for (const field of ["targetName", "sourceName", "sourceVersion", "sourceDigest", "packageDigest", "definitionJson"]) {
    const changed = { ...result.bundle, [field]: field === "sourceVersion" ? 2 : field === "targetName" ? "blocks/another" : "forged" };
    expect(() => decodeBlockPromotion(JSON.stringify(changed))).toThrow();
  }
  expect(() => decodeBlockPromotion(JSON.stringify({ ...result.bundle, accountToken: "secret" }))).toThrow();
});

test("promotion refuses resource defaults including nested defaults masked by examples", () => {
  for (const type of ["media", "reference", "menu", "form"]) {
    const source = definition();
    source.spec.fields.push({ id: "resource", type, default: "site-owned", ...(type === "reference" ? { of: "product", storage: "id" } : type === "media" ? { storage: "id" } : {}) } as never);
    const value = encodeComposedDefinition(source);
    expect(() => prepareBlockPromotion(value.json, value.digest, "blocks/services")).toThrow("site-owned");
  }
  const nested = definition();
  nested.spec.fields.push({ id: "cards", type: "repeater", fields: [{ id: "photo", type: "media", storage: "id", default: "site-media", nullable: true }], default: [{ photo: null }] } as never);
  nested.spec.examples = [{ cards: [{ photo: null }] } as never];
  const value = encodeComposedDefinition(nested);
  expect(() => prepareBlockPromotion(value.json, value.digest, "blocks/services")).toThrow("site-owned");
});

test("portable data bindings are validated and cannot hide site IDs in plain text fields or literals", () => {
  for (const literal of [true, false]) {
    const source = definition();
    source.spec.fields.push({ id: "product", type: "text", default: "site-product" } as never);
    source.spec.data = { resolver: "commerce.productCompare", args: { products: [literal ? "site-product" : "attrs.product"], attributes: [] } } as never;
    const value = encodeComposedDefinition(source);
    expect(() => prepareBlockPromotion(value.json, value.digest, "blocks/services")).toThrow("resolver selections");
  }
  const source = definition();source.spec.data = { resolver: "content.latestPosts", args: { count: 3 } } as never;
  const value = encodeComposedDefinition(source);
  expect(prepareBlockPromotion(value.json, value.digest, "blocks/services").targetSpec.data).toEqual(value.definition.spec.data);
});

test("promotion rejects reserved names, paths, digest substitutions and oversized packages", () => {
  const source = encodeComposedDefinition(definition());
  for (const name of ["core/services", "composed/services", "../services", "blocks/../services", "blocks/Services", "blocks/service;rm"]) expect(() => prepareBlockPromotion(source.json, source.digest, name)).toThrow();
  expect(() => prepareBlockPromotion(source.json, "a".repeat(64), "blocks/services")).toThrow();
  expect(() => decodeBlockPromotion("x".repeat(768 * 1024 + 1))).toThrow("768KiB");
});


test("absent optional parents and overridden text defaults cannot conceal site-owned references", () => {
  for (const type of ["object", "repeater"]) {
    const source = definition();
    source.spec.fields.push({ id: "unused", type, fields: [{ id: "photo", type: "media", storage: "id", default: "site-media" }] } as never);
    const value = encodeComposedDefinition(source);
    expect(() => prepareBlockPromotion(value.json, value.digest, "blocks/services")).toThrow("site-owned");
  }
  const source = definition();
  source.spec.fields.push({ id: "products", type: "repeater", item: { id: "product", type: "text", required: true }, default: ["private-product"] } as never);
  source.spec.examples = [{ products: [] } as never];
  source.spec.data = { resolver: "commerce.productCompare", args: { products: "attrs.products", attributes: [] } } as never;
  const value = encodeComposedDefinition(source);
  expect(() => prepareBlockPromotion(value.json, value.digest, "blocks/services")).toThrow("resolver selections");
});
