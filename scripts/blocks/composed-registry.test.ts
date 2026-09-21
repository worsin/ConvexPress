import { expect, test } from "bun:test";
import { createComposedRegistry, composedDefinitionRequests } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedRegistry";
import { encodeComposedDefinition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";
import { validateCanonicalTree } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/instances";
import catalog from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/catalog.json";

const scope = { websiteKey: "website", instanceKey: "staging", deploymentOrigin: "https://site.convex.cloud" };
function snapshot(version = 1) {
  const value = encodeComposedDefinition({
    spec: { name: "composed/welcome", title: "Welcome", description: "Authored block", category: "text", role: "content", version,
      keywords: [], ai: { useFor: "Introduction", avoid: "Navigation" }, fields: [
        { id: "title", type: "text", default: version === 1 ? "Original" : "Revised", max: version === 1 ? 80 : 10 },
        { id: "target", type: "text", format: "anchor", domId: true },
        { id: "items", type: "repeater", fields: [{ id: "image", type: "media" }, { id: "page", type: "reference", of: "page", storage: "id" }] },
      ], supports: { children: false, styles: false, layout: ["width"], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
  });
  return { name: value.definition.spec.name, version, digest: value.digest, definitionJson: value.json };
}
const node = (id = "custom", version = 1, attrs = {}) => ({ id, name: "composed/welcome", version, attrs });
const create = (...definitions: ReturnType<typeof snapshot>[]) => createComposedRegistry({ scope, definitions }, scope);

test("exact-version registry permits two definitions of one name without changing old defaults or schemas", () => {
  const registry = create(snapshot(1), snapshot(2));
  const input = [node("old", 1), node("new", 2)];
  expect(registry.validateTree(input).map(item => item.attrs.title)).toEqual(["Original", "Revised"]);
  expect(registry.validateTree([node("old", 1, { title: "Long original title" })])[0].attrs.title).toBe("Long original title");
  expect(() => registry.validateTree([node("new", 2, { title: "Long original title" })])).toThrow("Attributes");
  expect(() => registry.validateTree([node("absent", 3)])).toThrow("specification");
  expect(() => validateCanonicalTree(input)).toThrow("specification");
  expect(() => create().validateTree(input)).toThrow("specification");
  expect(registry.snapshotFor([node("old", 1)]).definitions).toEqual([snapshot(1)]);
  const result = registry.definition("composed/welcome", 1)!;
  result.spec.fields.length = 0;
  expect(registry.validateTree([node()])[0].attrs.title).toBe("Original");
  expect(registry.definition("composed/welcome", 3)).toBeNull();
});

test("registry snapshots reject cross-site identities, mismatched versions, duplicate entries and tampering", () => {
  const one = snapshot();
  for (const changed of [{ websiteKey: "foreign" }, { instanceKey: "production" }, { deploymentOrigin: "https://foreign.convex.cloud" }]) {
    expect(() => createComposedRegistry({ scope: { ...scope, ...changed }, definitions: [one] }, scope)).toThrow("another site");
  }
  expect(() => create(one, one)).toThrow("Duplicate");
  expect(() => create({ ...one, version: 2 })).toThrow("identity");
  expect(() => create({ ...one, digest: "a".repeat(64) })).toThrow("integrity");
  expect(() => create({ ...one, name: "core/heading" })).toThrow();
  expect(() => createComposedRegistry({ scope, definitions: Array(81).fill(one) }, scope)).toThrow();
});

test("composed nodes retain canonical structure, anchor collision and closed-attribute enforcement", () => {
  const registry = create(snapshot());
  for (const extra of [{ attrs: { unknown: true } }, { children: [] }, { layout: { tone: "muted" } }, { style: "uninstalled" }, { visibility: "signedIn" }, { lock: { edit: "invalid" } }, { definition: {} }, { treatment: { name: "default", values: {} } }]) {
    expect(() => registry.validateTree([{ ...node(), ...extra }])).toThrow();
  }
  expect(() => registry.validateTree([node("a", 1, { target: "same" }), { id: "heading", name: "core/heading", version: 2, attrs: { anchor: "same" } }])).toThrow("Duplicate page-wide");
  expect(() => registry.validateTree([node(), node()])).toThrow("unique");
  expect(() => registry.validateTree([{ ...node(), name: "foreign/custom" }])).toThrow("specification");
  const tree = [{ id: "section", name: "core/section", version: 1, attrs: {}, children: [node()] }];
  expect(registry.validateTree(tree)[0].children?.[0].attrs.title).toBe("Original");
  expect(registry.dependencies("composed/welcome", 1)).toEqual([
    { path: ["items", "*", "image"], type: "media", valuePath: ["id"] },
    { path: ["items", "*", "page"], type: "reference", of: "page", storage: "id", valuePath: [] },
  ]);
});

test("all installed block examples retain their generated contracts inside an extended registry", () => {
  const registry = create(snapshot());
  for (const block of catalog) for (const attrs of block.examples) {
    const tree = [{ id: "example", name: block.name, version: block.version, attrs }];
    expect(registry.validateTree(tree)).toEqual(validateCanonicalTree(tree));
  }
});

test("bounded request discovery deduplicates only identical name/version pairs before database access", () => {
  const tree = [node("one"), node("two"), node("three", 2)];
  expect(composedDefinitionRequests(tree)).toEqual([{ name: "composed/welcome", version: 1 }, { name: "composed/welcome", version: 2 }]);
  expect(() => composedDefinitionRequests([node(), node()])).toThrow("Duplicate");
  expect(() => composedDefinitionRequests([{ ...node(), definitionJson: "injected" }])).toThrow();
  expect(() => composedDefinitionRequests([{ ...node(), name: "unknown/block" }])).toThrow("Unknown");
  expect(() => composedDefinitionRequests(Array.from({ length: 81 }, (_, i) => node(`node-${i}`)))).toThrow("limit");
  let nested: unknown = node();
  for (let i = 0; i < 8; i++) nested = { id: `section-${i}`, name: "core/section", version: 1, attrs: {}, children: [nested] };
  expect(() => composedDefinitionRequests([nested])).toThrow("limit");
});

test("registry aggregate bytes are bounded independently of each otherwise valid definition", () => {
  const makeLarge = (version: number) => {
    const value = JSON.parse(snapshot(version).definitionJson);
    value.composition = { version: 1, root: { el: "Stack", children: Array.from({ length: 90 }, () => ({ el: "Text", bind: "'" + "a".repeat(3000) + "'" })) } };
    const encoded = encodeComposedDefinition(value);
    return { name: value.spec.name, version, digest: encoded.digest, definitionJson: encoded.json };
  };
  const one = makeLarge(1), two = makeLarge(2);
  expect(create(one).definition(one.name, 1)?.spec.version).toBe(1);
  expect(() => create(one, two)).toThrow("512KiB");
});
