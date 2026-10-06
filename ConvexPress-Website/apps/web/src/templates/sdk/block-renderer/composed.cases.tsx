import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrimitiveProvider } from "../primitives";
import { encodeComposedDefinition } from "../block-data/portable/composedDefinitions";
import { resolveCanonicalDataWithDefinitions } from "../block-data/portable/resolve";
import { createContentPageDisplayStore } from "../block-data/installed-page-data";
import { prepareBlocks } from "./model";
import section from "../../../../../../../blocks/core/section/render";
import heading from "../../../../../../../blocks/core/heading/render";
import featured from "../../../../../../../blocks/core/featured-page/render";
import type { Composition } from "../block-data/portable/composition";
import { sha256Hex } from "../block-data/portable/shared/fingerprints";
import { act } from "react";
import { JSDOM } from "jsdom";
import { useDisplayInstallation } from "../block-data/use-display-installation";
import { canonicalContentDigest, parseCanonicalDocumentRead } from "../block-data/portable/documentContracts";

const scope = { websiteKey: "custom-render", instanceKey: "staging" };
const installation = { ...scope, deploymentOrigin: "https://custom-render.convex.cloud" };
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
const library = { "core/section": section, "core/heading": heading, "core/featured-page": featured };
const composedTree = (label = "attrs.title"): Composition => ({ version: 1, root: { el: "Stack", children: [
  { el: "Heading", bind: label }, { el: "Slot", props: { name: "children" } },
] } });
export function composedRenderFixture(version = 1, composition = composedTree(), dynamic = false) {
  const spec = { name: "composed/introduction", title: "Introduction", description: "Composed editor fixture", category: "text", role: "content", version,
    keywords: [], ai: { useFor: "Introduction", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: `Version ${version}`, max: 80 }],
    supports: { children: true, styles: false, layout: ["tone"], anchor: true, visibility: false },
    data: dynamic ? { resolver: "site.info", args: {} } : null, preview: "{title}", examples: [{}] };
  const definition = { spec, composition, packTreatments: dynamic ? undefined : { journal: composedTree("'Journal: ' + attrs.title"), depot: composedTree("'Depot: ' + attrs.title") } };
  const encoded = encodeComposedDefinition(JSON.parse(JSON.stringify(definition)));
  const composed = { scope: installation, definitions: { scope: installation, definitions: [{ name: spec.name, version, digest: encoded.digest, definitionJson: encoded.json }] } };
  const node = { id: `custom${version}`, name: spec.name, version, attrs: {} };
  return { composed, node, definition };
}
const render = (tree: unknown, fixture = composedRenderFixture(), packId = "core", resources = { media: {} }, pageData?: Parameters<typeof prepareBlocks>[4]) =>
  renderToStaticMarkup(<PrimitiveProvider packId={packId}>{prepareBlocks(tree, library, policy, resources, pageData, packId, undefined, fixture.composed)}</PrimitiveProvider>);

test("actual renderer routes exact composed versions alongside Library blocks and selects only the active pack treatment", () => {
  const one = composedRenderFixture(), two = composedRenderFixture(2);
  one.composed.definitions.definitions.push(...two.composed.definitions.definitions);
  const tree = [{ id: "section", name: "core/section", version: 1, attrs: {}, children: [one.node, two.node] }];
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    const html = render(tree, one, pack);
    for (const id of ["section", "custom1", "custom2"]) expect(html).toContain(`data-block-id="${id}"`);
    expect(html).toContain(pack === "journal" ? "Journal: Version 1" : pack === "depot" ? "Depot: Version 1" : ">Version 1<");
    expect(html).toContain("Version 2");
    if (pack !== "journal") expect(html).not.toContain("Journal:");
    if (pack !== "depot") expect(html).not.toContain("Depot:");
  }
  expect(() => render(tree, two)).toThrow();
  expect(() => prepareBlocks([one.node], library, policy)).toThrow("No canonical");
  expect(() => renderToStaticMarkup(<PrimitiveProvider packId="depot">{prepareBlocks(tree, library, policy, { media: {} }, undefined, "journal", undefined, one.composed)}</PrimitiveProvider>)).toThrow("another template");
});

test("canonical children appear once at the local slot and cannot be dropped, duplicated or replaced with layout slots", () => {
  const fixture = composedRenderFixture();
  const child = { id: "nested", name: "core/heading", version: 2, attrs: {} };
  const tree = [{ ...fixture.node, children: [child] }];
  expect(render(tree, fixture).match(/data-block-id="nested"/g)).toHaveLength(1);
  for (const composition of [
    { version: 1, root: { el: "Heading", bind: "attrs.title" } },
    { version: 1, root: { el: "Stack", children: [{ el: "Slot", props: { name: "children" } }, { el: "Slot", props: { name: "children" } }] } },
  ] as Composition[]) {
    const bad = composedRenderFixture(1, composition);
    expect(() => render([{ ...bad.node, children: [child] }], bad)).toThrow("exactly one");
  }
  expect(() => composedRenderFixture(1, { version: 1, root: { el: "Slot", props: { name: "header" } } })).toThrow("not exposed");
});

test("emitted composition anchors participate in whole-page collisions and generated heading IDs", () => {
  const fixture = composedRenderFixture(1, { version: 1, root: { el: "Heading", props: { anchor: "shared" }, bind: "attrs.title" } });
  expect(() => render([fixture.node, { id: "heading", name: "core/heading", version: 2, attrs: { anchor: "shared" } }], fixture)).toThrow("anchor");
  expect(() => render([{ ...fixture.node, anchor: "shared" }], fixture)).toThrow("anchor");
  expect(() => render([fixture.node, { ...fixture.node, id: "other" }], fixture)).toThrow("anchor");
  const generated = `cp-heading-${sha256Hex("generated-heading").slice(0, 24)}`;
  const reserved = composedRenderFixture(1, { version: 1, root: { el: "Heading", props: { anchor: generated }, bind: "attrs.title" } });
  expect(render([reserved.node, { id: "generated-heading", name: "core/heading", version: 2, attrs: {} }], reserved)).toContain(`id="${generated}-2"`);
});

test("expanded custom blocks share a complete page budget", () => {
  const fixture = composedRenderFixture(1, { version: 1, root: { el: "Stack", children: Array.from({ length: 299 }, () => ({ el: "Text" as const, bind: "'Bounded copy'" })) } });
  expect(() => render(Array.from({ length: 9 }, (_, index) => ({ ...fixture.node, id: `item${index}` })), fixture)).toThrow("complete page");
  const textHeavy = composedRenderFixture(1, { version: 1, root: { el: "Stack", children: Array.from({ length: 90 }, () => ({ el: "Text" as const, bind: `'${"X".repeat(3000)}'` })) } });
  expect(() => render([textHeavy.node, { ...textHeavy.node, id: "second" }], textHeavy)).toThrow("complete page");
});

test("custom images use only supplied resources and preserve authored alternatives without mutating stored IDs", () => {
  const fixture = composedRenderFixture();
  const input = { ...fixture.definition, spec: { ...fixture.definition.spec, preview: "Image", fields: [{ id: "image", type: "media" }], examples: [{ image: { id: "photo", alt: "Authored alternative" } }] },
    composition: { version: 1, root: { el: "Image", bind: { media: "attrs.image" } } }, packTreatments: undefined };
  const encoded = encodeComposedDefinition(JSON.parse(JSON.stringify(input)));
  fixture.composed.definitions.definitions[0] = { ...fixture.composed.definitions.definitions[0], digest: encoded.digest, definitionJson: encoded.json };
  const tree = [{ ...fixture.node, attrs: { image: { id: "photo", alt: "Authored alternative" } } }];
  const before = JSON.stringify(tree);
  const resources = { media: { photo: { src: "/photo.webp", alt: "Catalog alternative", width: 1200, height: 800 } } };
  const html = render(tree, fixture, "core", resources);
  expect(html).toContain('src="/photo.webp"'); expect(html).toContain('alt="Authored alternative"');
  expect(JSON.stringify(tree)).toBe(before);
  expect(() => render(tree, fixture)).toThrow("authorized public resource");
  expect(() => render(tree, fixture, "core", { media: { photo: { src: "javascript:alert(1)", alt: "Unsafe" } } })).toThrow();
});

test("mixed dynamic Library and composed views share the definition-bound grant and clear when invalidated", async () => {
  const fixture = composedRenderFixture(1, composedTree("data.name"), true);
  const tree = [fixture.node, { id: "featured", name: "core/featured-page", version: 1, attrs: {} }];
  const envelope = await resolveCanonicalDataWithDefinitions(tree, scope, policy, {
    readPage: async () => ({ page: null }), readNavigation: async () => ({ name: "Live site name", tagline: null, logo: null }),
  }, fixture.composed);
  const store = createContentPageDisplayStore(), current = { scope, documentKey: "page", revision: "1", viewerKey: "visitor" };
  const pageData = { grant: store.install({ tree, policy, context: current, envelope, composed: fixture.composed }), current };
  expect(render(tree, fixture, "core", { media: {} }, pageData)).toContain("Live site name");
  const prepared = prepareBlocks(tree, library, policy, { media: {} }, pageData, "core", undefined, fixture.composed);
  store.invalidate();
  const stale = renderToStaticMarkup(<PrimitiveProvider packId="core">{prepared}</PrimitiveProvider>);
  expect(stale).not.toContain("Live site name"); expect(stale).toContain("Content unavailable");
  expect(() => render(tree, fixture)).toThrow("installed data grant");
});

test("already-mounted custom content clears on grant invalidation without a parent render", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.invalid" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  try {
    const fixture = composedRenderFixture(1, composedTree("data.name"), true), tree = [fixture.node];
    const envelope = await resolveCanonicalDataWithDefinitions(tree, scope, policy, {
      readPage: async () => ({ page: null }), readNavigation: async () => ({ name: "Mounted dynamic heading", tagline: null, logo: null }),
    }, fixture.composed);
    const store = createContentPageDisplayStore(), current = { scope, documentKey: "page", revision: "1", viewerKey: "visitor" };
    const pageData = { grant: store.install({ tree, policy, context: current, envelope, composed: fixture.composed }), current };
    await act(async () => root.render(<PrimitiveProvider packId="core">{prepareBlocks(tree, library, policy, { media: {} }, pageData, "core", undefined, fixture.composed)}</PrimitiveProvider>));
    expect(document.body.textContent).toContain("Mounted dynamic heading");
    await act(async () => store.invalidate());
    expect(document.body.textContent).not.toContain("Mounted dynamic heading");
    expect(document.body.textContent).toContain("Content unavailable.");
  } finally {
    await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, previous);
  }
});

test("the production document installer supplies exact definitions to the actual SSR renderer", async () => {
  const fixture = composedRenderFixture(1, composedTree("data.name"), true), tree = [fixture.node];
  const envelope = await resolveCanonicalDataWithDefinitions(tree, scope, policy, {
    readPage: async () => ({ page: null }), readNavigation: async () => ({ name: "Installed custom document", tagline: null, logo: null }),
  }, fixture.composed);
  const source = parseCanonicalDocumentRead({ contract: "canonical-document-v1", scope, policy, data: envelope, resources: { media: {} },
    presentation: { packId: "core", revision: "b".repeat(64) }, document: { id: "page", type: "page", title: "Custom page", status: "draft", path: "/custom", blocksVersion: 2, revision: 1,
      blocks: tree, digest: canonicalContentDigest("Custom page", tree, fixture.composed), composedDefinitions: fixture.composed.definitions },
  });
  if (!source || source.contract !== "canonical-document-v1") throw Error("Invalid fixture");
  const document = source;
  function Document() {
    const installed = useDisplayInstallation(document, "visitor");
    expect(installed.composed).toEqual(fixture.composed);
    return <PrimitiveProvider packId="core">{prepareBlocks(document.document.blocks, library, policy, document.resources, installed.data, "core", undefined, installed.composed)}</PrimitiveProvider>;
  }
  const html = renderToStaticMarkup(<Document />);
  expect(html).toContain("Installed custom document");
  expect(html).toContain('data-block-id="custom1"');
});

test("custom child slots render published reusable occurrences with definition-bound data", async () => {
  const { resolveSyncedOccurrencesSnapshot } = await import("../block-data/portable/syncedOccurrences");
  const { projectSyncedDisplay } = await import("../block-data/portable/syncedDisplay");
  const { syncedContentDigest } = await import("../block-data/portable/syncedContent");
  const { default: synced } = await import("../../../../../../../blocks/core/synced/render");
  const fixture = composedRenderFixture();
  const blocks = [{ id: "shared-heading", name: "core/heading", version: 2, attrs: { text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Shared heading" }] }] } } }];
  const reference = { id: "reuse", name: "core/synced", version: 1, attrs: { syncedBlock: "source", revisionPolicy: "pinned", revision: 1 } };
  const tree = [{ ...fixture.node, children: [reference] }];
  const plan = resolveSyncedOccurrencesSnapshot(tree, installation, () => ({ id: "source", revision: 1, title: "Shared", blocks, digest: syncedContentDigest("Shared", blocks), scope: installation, published: true }), { composed: fixture.composed });
  const projected = projectSyncedDisplay(plan, new Set(plan.byId.keys()));
  const envelope = await resolveCanonicalDataWithDefinitions(projected.resolverTree, scope, policy, {}, fixture.composed);
  const current = { scope, documentKey: "mixed", revision: "1", viewerKey: "guest" };
  const store = createContentPageDisplayStore();
  const grant = store.install({tree:projected.resolverTree,policy,context:current,envelope,composed:fixture.composed});
  const draw = (packId: string) => renderToStaticMarkup(<PrimitiveProvider packId={packId}>{prepareBlocks(projected.blocks, { ...library, "core/synced":synced }, policy, {media:{}}, {grant,current}, packId, {source:projected.synced,scope}, fixture.composed)}</PrimitiveProvider>);
  for (const pack of ["core","journal","depot","aster-house"]) {
    const html = draw(pack);
    expect(html).toContain("Version 1");expect(html.match(/Shared heading/g)).toHaveLength(1);
    expect(html).toContain(`data-block-id="${plan.resolverTree[0]!.children![0]!.id}"`);
  }
  const dto = {contract:"canonical-document-v1",scope,policy,document:{id:"mixed",type:"page",title:"Mixed",status:"draft",path:"/mixed",blocksVersion:2,revision:1,blocks:plan.resolution.blocks,composedDefinitions:fixture.composed.definitions,digest:canonicalContentDigest("Mixed",plan.resolution.blocks,fixture.composed)},presentation:{packId:"core",revision:"b".repeat(64)},data:envelope,resources:{media:{}},synced:projected.synced};
  expect(parseCanonicalDocumentRead(dto)?.contract).toBe("canonical-document-v1");
  store.invalidate();expect(()=>draw("core")).toThrow();
});
