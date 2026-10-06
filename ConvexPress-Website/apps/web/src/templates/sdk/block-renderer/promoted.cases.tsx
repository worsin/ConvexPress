import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import bannerSpec from "../../../../../../../blocks/blocks/page-banner/block.json";
import showcaseSpec from "../../../../../../../blocks/blocks/customer-showcase/block.json";
import eventsSpec from "../../../../../../../blocks/events/upcoming/block.json";
import { encodeComposedDefinition } from "../block-data/portable/composedDefinitions";
import { prepareBlockPromotion } from "../block-data/portable/blockPromotion";
import { installedPromotions, type InstalledPromotion } from "../block-data/portable/generated/promotions";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { createContentPageDisplayStore } from "../block-data/installed-page-data";
import { PrimitiveProvider } from "../primitives";
import { definePromotedBlock } from "./promoted";
import { prepareBlocks } from "./model";
import type { Composition } from "../block-data/portable/composition";

const policy = { enabledPlugins: ["events"], capabilities: [], disabledBlocks: [] };
// Exercise the installed SDK path with existing field contracts, without adding
// canonical inventory or replacing source files. Provenance exists only in this process.
function fixture(composition: Composition, dynamic = false, packTreatments?: Record<string, Composition>, media = false) {
  const name = media ? "blocks/customer-showcase" : dynamic ? "events/upcoming" : "blocks/page-banner";
  const spec = media ? showcaseSpec : dynamic ? eventsSpec : bannerSpec;
  const encoded = encodeComposedDefinition({ spec: { ...spec, name: "composed/promotion-render-test", examples: [{}] }, composition, ...(packTreatments ? { packTreatments } : {}) });
  const promotion = prepareBlockPromotion(encoded.json, encoded.digest, name);
  const records = installedPromotions as Record<string, InstalledPromotion>;
  if (records[name]) throw Error("Fixture must not replace installed provenance");
  const record = { sourceName: encoded.definition.spec.name, sourceVersion: encoded.definition.spec.version, sourceDigest: encoded.digest,
    packageDigest: promotion.bundle.packageDigest, specDigest: promotion.specDigest, rendererDigest: "a".repeat(64), definitionJson: encoded.json };
  records[name] = record;
  try {
    const renderer = definePromotedBlock(name, promotion.bundle);
    expect(() => definePromotedBlock(name, { ...promotion.bundle, sourceDigest: "f".repeat(64) })).toThrow();
    return { renderer, promotion, node: { id: "promoted", name, version: 1, attrs: {} } };
  } finally { delete records[name]; }
}
const heading = (bind: string): Composition => ({ version: 1, root: { el: "Heading", bind } });

test("promoted source uses the active pack's primitives and treatment and requires installed provenance", () => {
  const f = fixture(heading("attrs.title"), false, { journal: heading("'Journal: ' + attrs.title") });
  const library = { [f.node.name]: f.renderer };
  for (const packId of ["core", "journal", "depot", "aster-house"]) {
    const html = renderToStaticMarkup(<PrimitiveProvider packId={packId}>{prepareBlocks([f.node], library, policy, { media: {} }, undefined, packId)}</PrimitiveProvider>);
    expect(html).toContain(packId === "journal" ? "Journal: Page title" : ">Page title<");
  }
  expect(() => definePromotedBlock("blocks/page-banner", f.promotion.bundle)).toThrow("installed source");
  expect(() => prepareBlocks([f.node], library, policy)).toThrow("installed template");
  expect(() => renderToStaticMarkup(<>{prepareBlocks([f.node], library, policy, { media: {} }, undefined, "core")}</>)).toThrow("another template");
  const View = f.renderer.View;
  expect(() => renderToStaticMarkup(<View attrs={{}} resources={{ media: {} }} />)).toThrow("installed template provider");
  expect(() => renderToStaticMarkup(<PrimitiveProvider packId="depot">{prepareBlocks([f.node], library, policy, { media: {} }, undefined, "journal")}</PrimitiveProvider>)).toThrow("another template");
});

test("promoted compositions participate in page-wide emitted-anchor and expansion budgets", () => {
  const anchored = fixture({ version: 1, root: { el: "Heading", props: { anchor: "shared-anchor" }, bind: "attrs.title" } });
  const registry = { [anchored.node.name]: anchored.renderer };
  expect(() => prepareBlocks([anchored.node, { ...anchored.node, id: "second" }], registry, policy, { media: {} }, undefined, "core")).toThrow("anchor");
  expect(() => prepareBlocks([{ ...anchored.node, anchor: "shared-anchor" }], registry, policy, { media: {} }, undefined, "core")).toThrow("anchors must be unique");
  const expanded = fixture({ version: 1, root: { el: "Stack", children: Array.from({ length: 40 }, () => ({ el: "Text" as const, bind: '"Example"' })) } });
  expect(() => prepareBlocks(Array.from({ length: 60 }, (_, i) => ({ ...expanded.node, id: `instance${i}` })), { [expanded.node.name]: expanded.renderer }, policy, { media: {} }, undefined, "core")).toThrow("presentation budget");
});

test("promoted media resolves from the current authorized resources without copying site IDs into the package", () => {
  const f = fixture({ version: 1, root: { el: "Stack", each: "attrs.items", as: "item", children: [{ el: "Image", bind: { media: "item.mediaId" } }] } }, false, undefined, true);
  const tree = [{ ...f.node, attrs: { items: [{ mediaId: "site-image" }] } }], library = { [f.node.name]: f.renderer };
  const before = JSON.stringify(tree);
  expect(f.promotion.json).not.toContain("site-image");
  expect(() => prepareBlocks(tree, library, policy, { media: {} }, undefined, "core")).toThrow("authorized public resource");
  const resources = { media: { "site-image": { src: "/authorized.webp", alt: "Current site image" } } };
  const html = renderToStaticMarkup(<PrimitiveProvider packId="core">{prepareBlocks(tree, library, policy, resources, undefined, "core")}</PrimitiveProvider>);
  expect(html).toContain('src="/authorized.webp"');expect(html).toContain('alt="Current site image"');expect(JSON.stringify(tree)).toBe(before);
});

test("dynamic promoted content uses the installed resolver and loses display access when its grant is revoked", async () => {
  const f = fixture({ version: 1, root: { el: "Stack", children: [{ el: "Heading", bind: "attrs.heading" }, { el: "Stack", each: "data.items", as: "event", children: [{ el: "Text", bind: "event.title" }] }] } }, true);
  const tree = [f.node], registry = { [f.node.name]: f.renderer };
  const current = { scope: { websiteKey: "promoted", instanceKey: "staging" }, documentKey: "page", revision: "1", viewerKey: "public" };
  const envelope = await resolveCanonicalData(tree, current.scope, policy, async () => null, undefined, undefined, undefined, {}, async () => ({ asOf: 1,
    items: [{ id: "event", title: "Live event title", href: "/events/live", description: null, startsAt: 2000, endsAt: 4000, timeZone: "UTC", venue: "" }] }));
  const store = createContentPageDisplayStore();
  const pageData = { grant: store.install({ tree, policy, context: current, envelope }), current };
  const prepared = prepareBlocks(tree, registry, policy, { media: {} }, pageData, "core");
  expect(renderToStaticMarkup(<PrimitiveProvider packId="core">{prepared}</PrimitiveProvider>)).toContain("Live event title");
  store.invalidate();
  const stale = renderToStaticMarkup(<PrimitiveProvider packId="core">{prepared}</PrimitiveProvider>);
  expect(stale).not.toContain("Live event title");expect(stale).toContain("Content unavailable");
  expect(() => prepareBlocks(tree, registry, policy, { media: {} }, undefined, "core")).toThrow("authorized server data");
});
