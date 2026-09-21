import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg !== "--check")) throw Error("Use --check or no arguments");
const check = args.includes("--check");
const skills = ["block-build", "block-add-feature", "block-audit", "block-style", "block-compose", "block-migrate-content", "pattern-build", "block-promote"];
const destinations = [
  ".codex/skills", ".claude/skills",
  "ConvexPress-Admin/.codex/skills", "ConvexPress-Admin/.claude/skills",
  "agents/admin/codex-skills", "agents/admin/claude-skills",
];
async function inventory(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error(`Kit source symlink: ${prefix}${entry.name}`);
    if (entry.isDirectory()) result.push(...await inventory(path.join(directory, entry.name), `${prefix}${entry.name}/`));
    else if (entry.isFile()) result.push(`${prefix}${entry.name}`);
  }
  return result.sort();
}
async function inspectDestination(relative) {
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    try { if ((await lstat(current)).isSymbolicLink()) throw Error(`Kit destination symlink: ${relative}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
const mappings = (await inventory(path.join(root, "block-kit"))).map(file => [`block-kit/${file}`, `agents/kits/block-kit/${file}`]);
for (const skill of skills) for (const destination of destinations)
  mappings.push([`block-kit/skills/${skill}/SKILL.md`, `${destination}/${skill}/SKILL.md`]);
const drift = [];
for (const [source, target] of mappings) {
  await inspectDestination(target);
  const body = await readFile(path.join(root, source), "utf8");
  let existing;
  try { existing = await readFile(path.join(root, target), "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (body === existing) continue;
  drift.push(target);
  if (!check) {
    await mkdir(path.dirname(path.join(root, target)), { recursive: true });
    await writeFile(path.join(root, target), body);
  }
}
if (check && drift.length) throw Error(`Block kit drift. Run bun run sync:block-kit:\n${drift.join("\n")}`);
console.log(`Block kit: ${skills.length} canonical skills, ${mappings.length} distribution files, ${drift.length} ${check ? "stale" : "updated"}.`);
