import { afterEach, expect, test } from "bun:test";
import resourceComposition from "../../ConvexPress-Admin/packages/backend/convex/blockDefinitions/__tests__/fixtures/resource-composition.json";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { promoteBlock } from "./promote";
import { discoverBlocks } from "./discovery.mjs";
import { syncBlocks } from "./generator.mjs";
import { encodeComposedDefinition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";
import { prepareBlockPromotion } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/blockPromotion";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const roots: string[] = [];
const source = encodeComposedDefinition({
  spec: { name: "composed/services", title: "Services", description: "A portable services introduction", category: "marketing", role: "content", version: 2,
    keywords: [], ai: { useFor: "Services", avoid: "Checkout" }, fields: [{ id: "headline", type: "text", default: "Carefully considered" }],
    supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{headline}", examples: [{}] },
  composition: { version: 1, root: { el: "Heading", bind: "attrs.headline" } },
  packTreatments: { journal: { version: 1, root: { el: "Heading", bind: "attrs.headline" } } },
});
const promotion = prepareBlockPromotion(source.json, source.digest, "blocks/services");
async function fixture() {
  const root = await mkdtemp(path.join(repo, "ConvexPress-Admin/.promotion-test-")); roots.push(root);
  await mkdir(path.join(root, "packs/journal"), { recursive: true });
  await writeFile(path.join(root, "packs/journal/template.json"), JSON.stringify({ id: "journal", title: "Journal", blocks: { treatments: {} } }));
  return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

test("dry run does not write; installation produces deterministic source and installed provenance", async () => {
  const root = await fixture();
  const plan = await promoteBlock({ root, packageJson: promotion.json });
  expect(plan.files).toEqual(["promotion.json", "render.tsx", "contract.test.ts", "block.json"]);
  expect(await readdir(root)).toEqual(["packs"]);
  const installed = await promoteBlock({ root, packageJson: promotion.json, write: true });
  expect(installed.folder).toBe("blocks/blocks/services");
  const found = await discoverBlocks(root);
  expect(found.blocks).toHaveLength(1);
  expect(found.blocks[0].spec).toEqual(promotion.targetSpec);
  expect(found.blocks[0].promotion).toMatchObject({ sourceDigest: source.digest, packageDigest: promotion.bundle.packageDigest, sourceVersion: 2 });
  expect(JSON.parse(await readFile(path.join(root, installed.folder, "promotion.json"), "utf8"))).toEqual(promotion.bundle);
  expect(await readdir(path.join(root, installed.folder))).not.toContain(".promotion-pending.json");
  await syncBlocks({ root });
  const metadata = await import(pathToFileURL(path.join(root, "blocks/.generated/promotions.ts")).href);
  expect(metadata.installedPromotions["blocks/services"]).toEqual({ ...found.blocks[0].promotion, definitionJson: source.json });
  expect((await syncBlocks({ root, check: true })).changed).toEqual([]);
  await expect(promoteBlock({ root, packageJson: promotion.json, write: true })).rejects.toThrow("already exists");
  expect((await discoverBlocks(root)).blocks[0].promotion).toEqual(found.blocks[0].promotion);
});

test("discovery refuses altered spec, renderer, package and interrupted installation", async () => {
  for (const target of ["block.json", "render.tsx", "promotion.json", ".promotion-pending.json"]) {
    const root = await fixture();
    await promoteBlock({ root, packageJson: promotion.json, write: true });
    const folder = path.join(root, "blocks/blocks/services");
    if (target === "block.json") await writeFile(path.join(folder, target), JSON.stringify({ ...promotion.targetSpec, title: "Altered" }));
    else if (target === "promotion.json") await writeFile(path.join(folder, target), JSON.stringify({ ...promotion.bundle, sourceVersion: 7 }));
    else await writeFile(path.join(folder, target), "unreviewed change");
    await expect(discoverBlocks(root)).rejects.toThrow();
    await expect(syncBlocks({ root })).rejects.toThrow();
  }
});

test("invalid packages, unavailable pack treatments and symlink destinations cannot install", async () => {
  const root = await fixture();
  await expect(promoteBlock({ root, packageJson: JSON.stringify({ ...promotion.bundle, targetName: "../../escape" }), write: true })).rejects.toThrow();
  expect(await readdir(root)).toEqual(["packs"]);
  await rm(path.join(root, "packs/journal"), { recursive: true });
  await expect(promoteBlock({ root, packageJson: promotion.json, write: true })).rejects.toThrow("Install the journal");
  expect(await readdir(root)).toEqual(["packs"]);
  const other = await fixture();
  await symlink(other, path.join(root, "blocks"));
  await expect(promoteBlock({ root, packageJson: promotion.json, write: true })).rejects.toThrow("symlink");
  expect(await readdir(other)).toEqual(["packs"]);
});

test("competing promotions reserve one folder and never overwrite the winner", async () => {
  const root = await fixture();
  const outcomes = await Promise.allSettled([1, 2].map(() => promoteBlock({ root, packageJson: promotion.json, write: true })));
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
  expect((await discoverBlocks(root)).blocks[0].promotion.sourceDigest).toBe(source.digest);
});


test("an exported resource composition installs with its exact resolver, media fields and child slot", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "packs/aster-house"), { recursive: true });
  await writeFile(path.join(root, "packs/aster-house/template.json"), JSON.stringify({ id: "aster-house", title: "Aster House", blocks: { treatments: {} } }));
  const encoded = encodeComposedDefinition(resourceComposition);
  const reviewed = prepareBlockPromotion(encoded.json, encoded.digest, "blocks/resource-feature");
  expect((await promoteBlock({ root, packageJson: reviewed.json })).write).toBe(false);
  await promoteBlock({ root, packageJson: reviewed.json, write: true });
  const found = (await discoverBlocks(root)).blocks[0];
  expect(found.spec.data).toEqual(resourceComposition.spec.data);
  expect(found.spec.supports.children).toBe(true);
  expect(found.promotion?.sourceDigest).toBe(encoded.digest);
  await syncBlocks({ root });
  const metadata = await import(pathToFileURL(path.join(root, "blocks/.generated/promotions.ts")).href);
  expect(metadata.installedPromotions["blocks/resource-feature"].definitionJson).toBe(encoded.json);
  expect((await syncBlocks({ root, check: true })).changed).toEqual([]);
});
