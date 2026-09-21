import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { buildPattern } from "./build-pattern.mjs";
import { discoverBlocks } from "./discovery.mjs";
import { syncBlocks } from "./generator.mjs";
import { parsePattern } from "./patterns.mjs";
import { loadStaged } from "../../ConvexPress-Admin/apps/web/src/components/blocks/schema-editor/test-harness";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const roots: string[] = [];
const fixtures = ["core/section", "core/heading", "core/cta-band", "core/hero", "core/post-grid"];
const source = {
  id: "studio-invitation", title: "An invitation to collaborate", category: "contact",
  description: "A portable contact introduction with an in-page call to action.",
  blocks: [{ id: "section", name: "core/section", version: 1, attrs: {}, children: [
    { id: "title", name: "core/heading", version: 2, attrs: { anchor: "discuss" } },
    { id: "action", name: "core/cta-band", version: 2, attrs: { heading: "Start a conversation", primaryCtaLabel: "Discuss your project", primaryCtaUrl: "#discuss" } },
  ] }],
};
async function fixture() {
  const root = await mkdtemp(path.join(repo, "ConvexPress-Admin/.pattern-build-test-"));
  roots.push(root);
  for (const name of fixtures) {
    const dir = path.join(root, "blocks", name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "block.json"), await readFile(path.join(repo, "blocks", name, "block.json")));
  }
  await mkdir(path.join(root, "packs/studio"), { recursive: true });
  await writeFile(path.join(root, "packs/studio/template.json"), JSON.stringify({ id: "studio", title: "Studio", custom: { retained: true }, blocks: { treatments: {} } }));
  return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

test("builds a first portable pattern, registers the pack and generates editor-ready content", async () => {
  const root = await fixture();
  const plan = await buildPattern({ root, packId: "studio", input: source });
  expect(plan.nodeCount).toBe(3);
  expect(plan.manifestChanged).toBe(true);
  expect(await readdir(path.join(root, "packs/studio"))).toEqual(["template.json"]);
  await buildPattern({ root, packId: "studio", input: source, write: true });
  const found = await discoverBlocks(root);
  expect(found.packs[0].patterns[0].id).toBe("studio/studio-invitation");
  expect(found.packs[0].patterns[0].blocks[0].children[1].attrs.primaryCtaUrl).toBe("#discuss");
  expect(JSON.parse(await readFile(path.join(root, "packs/studio/template.json"), "utf8")).custom).toEqual({ retained: true });
  await syncBlocks({ root });
  const generated = await import(pathToFileURL(path.join(root, "blocks/.generated/patterns.ts")).href);
  expect(generated.templatePatterns).toEqual(found.packs[0].patterns);
  const loaded = await loadStaged("../canonical-editor/patterns.ts");
  try {
    const first = loaded.module.instantiatePattern(generated.templatePatterns[0].blocks);
    const second = loaded.module.instantiatePattern(generated.templatePatterns[0].blocks);
    expect(first[0].id).not.toBe(second[0].id);
    expect(first[0].children[0].attrs.anchor).not.toBe(second[0].children[0].attrs.anchor);
    expect(first[0].children[1].attrs.primaryCtaUrl).toBe(`#${first[0].children[0].attrs.anchor}`);
    expect(source.blocks[0].children[0].attrs.anchor).toBe("discuss");
  } finally { await loaded.cleanup(); }
  expect((await readdir(path.join(root, "packs/studio"))).sort()).toEqual(["patterns", "template.json"]);
});

test("adding to a registered pack preserves manifest bytes and refuses duplicates", async () => {
  const root = await fixture();
  await buildPattern({ root, packId: "studio", input: source, write: true });
  const manifest = await readFile(path.join(root, "packs/studio/template.json"), "utf8");
  const second = await buildPattern({ root, packId: "studio", input: { ...source, id: "second" }, write: true });
  expect(second.manifestChanged).toBe(false);
  expect(await readFile(path.join(root, "packs/studio/template.json"), "utf8")).toBe(manifest);
  await expect(buildPattern({ root, packId: "studio", input: source, write: true })).rejects.toThrow("already exists");
  expect((await discoverBlocks(root)).packs[0].patterns).toHaveLength(2);
});

test("invalid trees, private references, unknown packs and unsupported treatment produce no writes", async () => {
  const root = await fixture();
  const invalid = [
    { ...source, id: "../escape" },
    { ...source, blocks: [...source.blocks, ...source.blocks] },
    { ...source, blocks: [{ id: "old", name: "core/heading", version: 1, attrs: {} }] },
    { ...source, blocks: [{ id: "private", name: "core/hero", version: 2, attrs: { mediaId: "customer-image" } }] },
    { ...source, blocks: [{ id: "query", name: "core/post-grid", version: 1, attrs: { query: { author: "customer-id" } } }] },
    { ...source, blocks: [{ id: "style", name: "core/heading", version: 2, attrs: {}, treatment: { name: "missing", values: {} } }] },
  ];
  for (const input of invalid) await expect(buildPattern({ root, packId: "studio", input, write: true })).rejects.toThrow();
  await expect(buildPattern({ root, packId: "missing", input: source, write: true })).rejects.toThrow("Unknown installed pack");
  expect(await readdir(path.join(root, "packs/studio"))).toEqual(["template.json"]);
});

test("symlink destinations and an existing operation lock are refused without replacement", async () => {
  const root = await fixture(), other = await fixture();
  await symlink(other, path.join(root, "packs/studio/patterns"));
  await expect(buildPattern({ root, packId: "studio", input: source, write: true })).rejects.toThrow("symlink");
  const lock = path.join(other, "packs/studio/.pattern-build.lock");
  await writeFile(lock, "prior interrupted operation");
  await expect(buildPattern({ root: other, packId: "studio", input: source, write: true })).rejects.toThrow();
  expect(await readFile(lock, "utf8")).toBe("prior interrupted operation");
  expect((await discoverBlocks(other)).packs[0].patterns).toHaveLength(0);
});

test("competing installations never overwrite or duplicate a pattern", async () => {
  const root = await fixture();
  const results = await Promise.allSettled([1, 2].map(() => buildPattern({ root, packId: "studio", input: source, write: true })));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect((await discoverBlocks(root)).packs[0].patterns).toHaveLength(1);
  expect((await readdir(path.join(root, "packs/studio"))).sort()).toEqual(["patterns", "template.json"]);
});

test("the authored worked example is portable under all installed packs without changing its content", async () => {
  const example = JSON.parse(await readFile(path.join(repo, "block-kit/references/patterns/project-introduction.json"), "utf8"));
  const { blocks, packs } = await discoverBlocks(repo);
  const trees = packs.map(pack => parsePattern(example, blocks, pack).blocks);
  expect(trees).toHaveLength(4);
  for (const tree of trees) expect(tree).toEqual(trees[0]);
  expect(trees[0][2].attrs.primaryCtaUrl).toBe("/contact");
});

test("the pattern cap rejects overflow before publishing a file", async () => {
  const root = await fixture();
  await buildPattern({ root, packId: "studio", input: source, write: true });
  for (let i = 1; i < 64; i++) {
    await writeFile(path.join(root, `packs/studio/patterns/section-${i}.json`), JSON.stringify({ ...source, id: `section-${i}` }));
  }
  await expect(buildPattern({ root, packId: "studio", input: { ...source, id: "overflow" }, write: true })).rejects.toThrow("up to 64");
  expect((await readdir(path.join(root, "packs/studio/patterns"))).length).toBe(64);
});
