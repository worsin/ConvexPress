import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { parseBlockSpec } from "./schema.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const scaffold = new URL("../../block-kit/scaffold/", import.meta.url);

async function ensureDirectory(directory) {
  try { await mkdir(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const entry = await lstat(directory);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw Error(`Expected a real directory: ${directory}`);
}

/** Creates source only. Sync and deploy remain explicit, inspectable operations. */
export async function createBlock({ root = repository, name, title, description, dryRun = false }) {
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(name) || name.length > 160)
    throw Error("Use a stable namespace/name, for example blocks/notice");
  const base = JSON.parse(await readFile(new URL("block.json", scaffold), "utf8"));
  const spec = parseBlockSpec({ ...base, name, title: title ?? name.split("/")[1].replaceAll("-", " "), description: description ?? base.description });
  const { blocks } = await discoverBlocks(root);
  if (blocks.some(block => block.spec.name === name)) throw Error(`Block already exists: ${name}`);
  const folder = path.join(root, "blocks", ...name.split("/"));
  try { await lstat(folder); throw Error(`Refusing to replace existing folder: ${folder}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const files = {
    "block.json": `${JSON.stringify(spec, null, 2)}\n`,
    "render.tsx": (await readFile(new URL("render.tsx.template", scaffold), "utf8")).replace("__BLOCK_NAME__", JSON.stringify(name)),
    "contract.test.ts": await readFile(new URL("contract.test.ts.template", scaffold), "utf8"),
  };
  if (!dryRun) {
    await ensureDirectory(root);
    await ensureDirectory(path.join(root, "blocks"));
    await ensureDirectory(path.dirname(folder));
    // Exclusive directory creation rejects concurrent writers and partial retries.
    await mkdir(folder);
    for (const [file, body] of Object.entries(files)) await writeFile(path.join(folder, file), body, { flag: "wx" });
  }
  return { name, folder: path.relative(root, folder), files: Object.keys(files), dryRun };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), name = args.shift();
    if (name === "--help") {
      console.log('Usage: bun run create:block namespace/name [--title "Title"] [--description "Purpose"] [--dry-run]');
    } else {
      const options = { name };
      const seen = new Set();
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (seen.has(arg)) throw Error(`Repeated option ${arg}`);
        seen.add(arg);
        if (arg === "--dry-run") options.dryRun = true;
        else if (["--title", "--description"].includes(arg) && args[i + 1] && !args[i + 1].startsWith("--")) options[arg.slice(2)] = args[++i];
        else throw Error(`Unknown or incomplete option ${arg}`);
      }
      console.log(JSON.stringify(await createBlock(options), null, 2));
      console.log("Customize the spec and renderer, then run the canonical sync sequence in block-kit/WORKFLOW.md. Source creation does not deploy or certify the block.");
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
