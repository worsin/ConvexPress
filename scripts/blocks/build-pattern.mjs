import { lstat, mkdir, readFile, writeFile, link, unlink, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { parsePattern } from "./patterns.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const json = value => `${JSON.stringify(value, null, 2)}\n`;
async function absent(file) {
  try { await lstat(file); return false; }
  catch (error) { if (error.code !== "ENOENT") throw error; return true; }
}
async function realPath(root, relative) {
  let current = root;
  for (const segment of ["", ...relative.split(path.sep)]) {
    current = path.join(current, segment);
    try { if ((await lstat(current)).isSymbolicLink()) throw Error(`Pattern destination contains a symlink: ${relative}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

/** Builds a portable source pattern. Publishing content or deploying is separate. */
export async function buildPattern({ root = repository, packId, input, write = false }) {
  if (typeof packId !== "string" || !/^[a-z][a-z0-9-]*$/.test(packId)) throw Error("Use an installed pack ID");
  if (Buffer.byteLength(JSON.stringify(input) ?? "") > 512 * 1024) throw Error("Oversized pattern");
  const { blocks, packs } = await discoverBlocks(root);
  const pack = packs.find(item => item.id === packId);
  if (!pack) throw Error(`Unknown installed pack: ${packId}`);
  const parsed = parsePattern(input, blocks, pack);
  if (pack.patterns.some(item => item.id === parsed.id)) throw Error(`Pattern already exists: ${parsed.id}`);
  if (pack.patterns.length >= 64) throw Error("A template supports up to 64 starter patterns");
  const relative = path.join(pack.path, "patterns", `${input.id}.json`);
  await realPath(root, relative);
  const target = path.join(root, relative), manifestFile = path.join(root, pack.path, "template.json");
  await realPath(root, path.join(pack.path, "template.json"));
  const manifestSource = await readFile(manifestFile, "utf8"), manifest = JSON.parse(manifestSource);
  if (manifest.id !== packId) throw Error("Pack manifest identity does not match its folder");
  if (!(await absent(target))) throw Error(`Refusing to overwrite ${relative}`);
  const pattern = { ...input, blocks: parsed.blocks };
  const body = json(pattern);
  if (Buffer.byteLength(body) > 512 * 1024) throw Error("Normalized pattern exceeds 512KiB");
  const declaresPatterns = manifest.blocks?.patterns === "./patterns/*.json";
  const count = nodes => nodes.reduce((total, node) => total + 1 + count(node.children ?? []), 0);
  const result = { id: parsed.id, packId, file: relative, nodeCount: count(parsed.blocks), write, manifestChanged: !declaresPatterns, pattern };
  if (!write) return result;

  // Serialize this tool's writers. An interrupted operation leaves the lock for
  // explicit inspection; it never silently overwrites a partial operation.
  const lock = path.join(root, pack.path, ".pattern-build.lock");
  await writeFile(lock, json({ id: parsed.id, target: relative }), { flag: "wx" });
  const temp = path.join(root, pack.path, `.pattern-${randomUUID()}.tmp`);
  const manifestTemp = `${temp}.manifest`;
  let published = false;
  const failures = [];
  try {
    if (await readFile(manifestFile, "utf8") !== manifestSource) throw Error("Pack manifest changed during pattern planning");
    await realPath(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(temp, body, { flag: "wx" });
    // Publish the complete file without replacing another writer's target.
    await link(temp, target);
    published = true;
    if (!declaresPatterns) {
      await writeFile(manifestTemp, json({ ...manifest, blocks: { ...manifest.blocks, patterns: "./patterns/*.json" } }), { flag: "wx" });
      if (await readFile(manifestFile, "utf8") !== manifestSource) throw Error("Pack manifest changed before pattern registration");
      await rename(manifestTemp, manifestFile);
    }
  } catch (error) {
    failures.push(error);
    // Roll back only this exact newly created file, and only while the manifest
    // is still the version we read. Otherwise leave evidence for reconciliation.
    try {
      if (published && await readFile(manifestFile, "utf8") === manifestSource && await readFile(target, "utf8") === body) await unlink(target);
    } catch (rollbackError) { failures.push(rollbackError); }
  }
  for (const file of [temp, manifestTemp, lock]) {
    try { await unlink(file); } catch (error) { if (error.code !== "ENOENT") failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, `Inspect ${relative} and its manifest before retrying: ${failures.map(error => error.message).join("; ")}`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {}, seen = new Set();
    if (args.length === 1 && args[0] === "--help") {
      console.log("Usage: bun run pattern:build --pack pack-id --file pattern.json [--write]. Default: validate and print the plan without writing.");
    } else {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (seen.has(arg)) throw Error(`Repeated option ${arg}`);
        seen.add(arg);
        if (arg === "--write") options.write = true;
        else if (["--pack", "--file"].includes(arg) && args[i + 1] && !args[i + 1].startsWith("--")) options[arg.slice(2)] = args[++i];
        else throw Error(`Unknown or incomplete option ${arg}`);
      }
      if (!options.file || !options.pack) throw Error("Both --pack and --file are required");
      const entry = await lstat(options.file);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 512 * 1024) throw Error("Input must be a regular JSON file no larger than 512KiB");
      console.log(json(await buildPattern({ packId: options.pack, input: JSON.parse(await readFile(options.file, "utf8")), write: options.write })));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
