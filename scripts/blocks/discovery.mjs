import { parsePackPresentation } from "./pack-presentation.mjs";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { discoverPatterns } from "./patterns.mjs";
import { discoverPackDesign } from "./pack-design.mjs";
import { parseBlockSpec } from "./schema.mjs";
import { inspectPromotionSource } from "./promotion-source.mjs";

async function entries(directory) {
  try {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Block discovery refuses symlink ${directory}`);
    const result = await readdir(directory, { withFileTypes: true });
    for (const entry of result) if (entry.isSymbolicLink()) throw new Error(`Block discovery refuses symlink ${path.join(directory, entry.name)}`);
    return result.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  } catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
const directories = async dir => (await entries(dir)).filter(entry => entry.isDirectory() && !entry.name.startsWith("."));

// Fixed folder conventions, never a list of block names. Plugin/pack ownership
// comes from its discovered folder, not from guessing the block-name prefix.
export async function discoverBlocks(root) {
  const candidates = [], packs = [];
  for (const namespace of await directories(path.join(root, "blocks"))) {
    for (const block of await directories(path.join(root, "blocks", namespace.name))) {
      candidates.push({ folder: path.join("blocks", namespace.name, block.name), expectedName: `${namespace.name}/${block.name}`, provenance: { kind: namespace.name === "core" ? "core" : "library" } });
    }
  }
  const sources = [
    ["plugin", "extensions"], ["plugin", "plugins"],
    ["plugin", "ConvexPress-Admin/packages/backend/convex/extensions"],
    ["pack", "packs"], ["pack", "ConvexPress-Website/apps/web/src/templates/packs"],
  ];
  for (const [kind, base] of sources) {
    for (const owner of await directories(path.join(root, base))) {
      if (!/^[a-z][a-z0-9-]*$/.test(owner.name)) throw new Error(`Invalid ${kind} folder ${owner.name}`);
      if (kind === "pack") packs.push({ id: owner.name, path: `${base}/${owner.name}` });
      const parent = path.join(base, owner.name, "blocks");
      for (const block of await directories(path.join(root, parent))) {
        candidates.push({ folder: path.join(parent, block.name), expectedName: `${owner.name}/${block.name}`, provenance: { kind, owner: owner.name } });
      }
    }
  }
  if (candidates.length > 2000) throw new Error("Block discovery exceeds 2000 folders");
  const names = new Set(), blocks = [];
  for (const candidate of candidates) {
    const files = await entries(path.join(root, candidate.folder));
    if (!files.some(file => file.name === "block.json" && file.isFile())) {
      // Pack blocks may contain renderer folders before being spec-backed.
      if (["pack", "plugin"].includes(candidate.provenance.kind)) continue;
      throw new Error(`Missing block.json in ${candidate.folder}`);
    }
    if (files.some(file => file.name === ".promotion-pending.json")) throw Error(`Unfinished promotion in ${candidate.folder}; inspect the source operation before syncing.`);
    const source = `${candidate.folder}/block.json`;
    const contents = await readFile(path.join(root, source), "utf8");
    if (Buffer.byteLength(contents) > 128 * 1024) throw new Error(`Oversized spec ${source}`);
    const spec = parseBlockSpec(JSON.parse(contents));
    if (spec.name !== candidate.expectedName) throw new Error(`Block name ${spec.name} does not match folder ownership ${candidate.expectedName}`);
    if (names.has(spec.name)) throw new Error(`Duplicate block name ${spec.name}`);
    names.add(spec.name);
    let promotion;
    let promotedDefinition;
    if (files.some(file => file.name === "promotion.json" && file.isFile())) {
      const body = await readFile(path.join(root, candidate.folder, "promotion.json"), "utf8");
      if (Buffer.byteLength(body) > 768 * 1024) throw Error("Oversized promotion package");
      if (candidate.provenance.kind !== "library") throw Error("Promoted blocks belong in the Library.");
      const bundle = JSON.parse(body);
      promotedDefinition = bundle.definitionJson;
      promotion = inspectPromotionSource(bundle, spec, await readFile(path.join(root, candidate.folder, "render.tsx"), "utf8"));
    }
    blocks.push({ spec, source, ...(promotion ? { promotion, promotedDefinition } : {}), provenance: candidate.provenance, hasRenderer: files.some(file => file.name === "render.tsx" && file.isFile()) });
  }
  blocks.sort((a, b) => a.spec.name < b.spec.name ? -1 : a.spec.name > b.spec.name ? 1 : 0);
  const packIds = new Set();
  for (const pack of packs) { if (packIds.has(pack.id)) throw new Error(`Duplicate pack discovery ${pack.id}`); packIds.add(pack.id); }
  for (const pack of packs) {
    let manifest;
    try { const body = await readFile(path.join(root, pack.path, "template.json"), "utf8"); if (Buffer.byteLength(body) > 512 * 1024) throw Error("Oversized pack manifest"); manifest = JSON.parse(body); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const treatments = manifest?.blocks?.treatments ?? {};
    if (!treatments || typeof treatments !== "object" || Array.isArray(treatments) || Object.keys(treatments).length > 2000) throw Error("Invalid pack treatments");
    for (const [name, supported] of Object.entries(treatments)) {
      const spec = blocks.find(block => block.spec.name === name)?.spec;
      if (!spec || !Array.isArray(supported) || supported.length > 8 || new Set(supported).size !== supported.length || supported.some(value => typeof value !== "string" || !(spec.treatments ?? []).some(item => item.name === value))) throw Error(`Unknown pack treatment ${pack.id}/${name}`);
    }
    const renderers = manifest?.blocks?.renderers ?? {};
    if (!renderers || typeof renderers !== "object" || Array.isArray(renderers)) throw Error("Invalid pack renderers");
    for (const [name, source] of Object.entries(renderers)) {
      if (!blocks.some(block => block.spec.name === name) || source !== `./blocks/${name}.tsx`) throw Error(`Invalid owned renderer ${pack.id}/${name}`);
      const file = await lstat(path.join(root, pack.path, source));
      if (!file.isFile() || file.isSymbolicLink()) throw Error("Pack renderer must be a regular owned file");
    }
    Object.assign(pack, parsePackPresentation(manifest, blocks, pack.id));
    pack.renderers = renderers;
    pack.treatments = treatments;
    pack.patterns = await discoverPatterns(root, pack, manifest, blocks);
    pack.design = await discoverPackDesign(root, pack, manifest);
  }
  return { blocks, packs: packs.sort((a, b) => a.id < b.id ? -1 : 1) };
}
