import { expect, test } from "bun:test";
import { createAiCatalog, type AiCatalogContext } from "./aiCatalog";
import { aiCatalog } from "./generated/ai-catalog";
import { dependencyDescriptors } from "./generated/metadata";
import { encodeComposedDefinition } from "./composedDefinitions";
import { blockSchemas } from "./generated/schemas";
const descriptors = Object.values(dependencyDescriptors);
const all: AiCatalogContext = { packId: "core", hiddenBlocks: [], styles: {}, policy: {
  enabledPlugins: [...new Set(descriptors.flatMap(item => [...item.requires.plugins, ...((item.provenance as {kind:string;owner?:string}).kind === "plugin" ? [(item.provenance as {owner:string}).owner] : [])]))],
  capabilities: [...new Set(descriptors.flatMap(item => item.requires.capabilities))], disabledBlocks: [],
} };
let count = 0;
const id = () => `generated-${++count}`;
const node = (name: string) => ({ name, version: aiCatalog.find(entry => entry.name === name)!.version, attrs: {} });
const heading = () => node("core/heading");

test("metadata and proposal validation do not construct the entire provider schema in a query", () => {
  const original = Object.getOwnPropertyDescriptor(blockSchemas, "core/heading")!;
  let accesses = 0;
  Object.defineProperty(blockSchemas, "core/heading", { ...original, get() { accesses++; return original.get!(); } });
  try {
    const result = createAiCatalog(all);
    expect(result.entries.length).toBe(aiCatalog.length); expect(accesses).toBe(0);
    result.validate({ title: "One paragraph", blocks: [node("core/paragraph")] }, id);
    expect(accesses).toBe(0);
    const schema = result.schema;
    expect(accesses).toBe(1); expect(result.schema).toBe(schema); expect(accesses).toBe(1);
  } finally { Object.defineProperty(blockSchemas, "core/heading", original); }
});

test("every installed block gets its actual fields and examples in the AI schema", () => {
  const result = createAiCatalog(all);
  expect(result.entries).toHaveLength(aiCatalog.length);
  expect(result.schema.$defs.node.anyOf).toHaveLength(aiCatalog.length);
  for (const entry of result.entries) {
    const branch = result.schema.$defs.node.anyOf.find(branch => (branch.properties as any).name.const === entry.name)!;
    expect((branch.properties as any).version.const).toBe(entry.version);
    expect((branch.properties as any).attrs.type).toBe("object");
    expect(result.validate({ title: "Example", blocks: [{ name: entry.name, version: entry.version, attrs: entry.example }] }, id).blocks[0].name).toBe(entry.name);
  }
});

test("enabled catalog excludes disabled/hidden blocks and unavailable plugin or runtime requirements", () => {
  const limited = createAiCatalog({ ...all, hiddenBlocks: ["core/heading"], policy: { enabledPlugins: [], capabilities: [], disabledBlocks: ["core/paragraph"] } });
  expect(limited.entries.some(entry => entry.name === "core/heading")).toBe(false);
  expect(limited.entries.some(entry => entry.name === "core/paragraph")).toBe(false);
  expect(limited.entries.some(entry => entry.name === "commerce/product-showcase")).toBe(false);
  expect(() => limited.validate({ title: "Hidden", blocks: [heading()] }, id)).toThrow();
});

test("nested generation preserves children, supplies fresh IDs and refuses partial invalid output", () => {
  const result = createAiCatalog(all);
  const tree = { title: "A complete page", blocks: [{ ...node("core/section"), children: [heading(), node("core/paragraph")] }] };
  const made = result.validate(tree, id);
  expect(made.blocks[0].children).toHaveLength(2);
  expect(new Set([made.blocks[0].id, ...made.blocks[0].children!.map(item => item.id)]).size).toBe(3);
  for (const invalid of [
    { ...tree, extra: true },
    { ...tree, blocks: [...tree.blocks, { ...heading(), name: "missing/type" }] },
    { ...tree, blocks: [{ ...heading(), version: 999 }] },
    { ...tree, blocks: [{ ...heading(), id: "provider-id" }] },
    { ...tree, blocks: [{ ...heading(), attrs: { text: 123 } }] },
    { ...tree, blocks: [{ ...heading(), children: [heading()] }] },
    { ...tree, blocks: [{ ...heading(), style: "not-in-template" }] },
    { ...tree, blocks: Array.from({ length: 81 }, heading) },
  ]) expect(() => result.validate(invalid, id)).toThrow();
});

test("custom schemas preserve exact approved snapshot versions and cannot weaken resolver policy", () => {
  const spec = { name: "composed/studio", version: 1, title: "Studio", description: "Studio", category: "text", role: "content", keywords: [], ai: { useFor: "Studio", avoid: "Navigation" }, fields: [{ id: "headline", type: "text", default: "Hello", max: 20 }], supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{headline}", examples: [{}] };
  const scope = { websiteKey: "studio", instanceKey: "test", deploymentOrigin: "https://studio.convex.cloud" };
  const values = [1,2].map(version => { const value = encodeComposedDefinition({ spec: { ...spec, version }, composition: { version: 1, root: { el: "Heading", bind: "attrs.headline" } } });return { name: spec.name, version, digest: value.digest, definitionJson: value.json }; });
  const result = createAiCatalog({ ...all, definitions: { scope, definitions: values } });
  expect(result.entries.filter(entry => entry.name === spec.name).map(entry => entry.version)).toEqual([1,2]);
  expect(result.validate({ title: "Custom", blocks: [{ name: spec.name, version: 2, attrs: {} }] }, id).blocks[0].attrs.headline).toBe("Hello");
  expect(() => result.validate({ title: "Custom", blocks: [{ name: spec.name, version: 3, attrs: {} }] }, id)).toThrow();
  const weak = encodeComposedDefinition({ spec: { ...spec, data: { resolver: "commerce.product", args: {} } }, composition: { version: 1, root: { el: "Heading", bind: "attrs.headline" } } });
  const unavailable = createAiCatalog({ ...all, policy: { ...all.policy, enabledPlugins: [] }, definitions: { scope, definitions: [{ name: spec.name, version: 1, digest: weak.digest, definitionJson: weak.json }] } });
  expect(unavailable.entries.some(entry => entry.name === spec.name)).toBe(false);
});

test("AI named styles are scoped to the individual block and default is always available", () => {
  const result = createAiCatalog({ ...all, packId: "journal", styles: { "core/cta-band": ["default", "inset"] } });
  const proposal = (name: string, style: string) => ({ title: "Styled", blocks: [{ ...node(name), style }] });
  expect(result.validate(proposal("core/cta-band", "inset"), id).blocks[0].style).toBe("inset");
  expect(result.validate(proposal("core/heading", "default"), id).blocks[0].style).toBe("default");
  expect(() => result.validate(proposal("core/heading", "inset"), id)).toThrow("unavailable template style");
  expect(() => result.validate(proposal("core/cta-band", "outline"), id)).toThrow("unavailable template style");
  const branch = result.schema.$defs.node.anyOf.find(branch => (branch.properties as any).name.const === "core/cta-band")!;
  expect((branch.properties as any).style.enum).toEqual(["default", "inset"]);
});
