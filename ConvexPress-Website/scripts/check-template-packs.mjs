#!/usr/bin/env node
/**
 * check:templates — validates every template pack under
 * apps/web/src/templates/packs/*:
 *   - template.json has the required fields and a slug id matching its folder
 *   - every surface id it lists exists in the SDK surface catalog
 *   - every listed surface has a surfaces/<id>.tsx file, and vice versa
 *   - variants are declared for implemented catalog surfaces only
 *   - surfaces do not reach the backend directly or use colour literals
 *   - every generated manifest and Admin mirror matches its authoritative source
 * Exit code is the verdict.
 */
import { spawnSync } from "node:child_process";
import { validateTemplateContract } from "./template-contract.mjs";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const packsDir = join(root, "apps/web/src/templates/packs");
const catalogFile = join(root, "apps/web/src/templates/sdk/catalog.ts");
const adminCatalog = resolve(root, "../ConvexPress-Admin/apps/web/src/lib/templates/catalog.ts");

const ids = (source) => [...source.matchAll(/S\("([a-zA-Z0-9.-]+)",/g)].map((m) => m[1]);
const catalog = new Set(ids(readFileSync(catalogFile, "utf8")));
const problems = [];
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;

if (catalog.size === 0) problems.push("surface catalog is empty or unreadable");
if (existsSync(adminCatalog)) {
  const mirror = new Set(ids(readFileSync(adminCatalog, "utf8")));
  for (const id of catalog) if (!mirror.has(id)) problems.push(`admin catalog mirror is missing surface "${id}"`);
  for (const id of mirror) if (!catalog.has(id)) problems.push(`admin catalog mirror lists unknown surface "${id}"`);
}

const packs = readdirSync(packsDir).filter((entry) => statSync(join(packsDir, entry)).isDirectory());
for (const id of packs) {
  const dir = join(packsDir, id);
  const manifestPath = join(dir, "template.json");
  if (!existsSync(manifestPath)) { problems.push(`${id}: missing template.json`); continue; }
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (error) { problems.push(`${id}: template.json is not valid JSON (${error.message})`); continue; }
  problems.push(...validateTemplateContract(dir, manifest, catalog).map(problem => `${id}: ${problem}`));
  for (const field of ["id", "name", "version", "sdk", "tagline", "description", "surfaces"]) {
    if (manifest[field] === undefined) problems.push(`${id}: template.json is missing "${field}"`);
  }
  if (manifest.id !== id) problems.push(`${id}: template.json id "${manifest.id}" does not match the folder name`);
  if (!slug.test(String(manifest.id))) problems.push(`${id}: id must be a lowercase slug`);
  const surfaces = Array.isArray(manifest.surfaces) ? manifest.surfaces : [];
  const files = existsSync(join(dir, "surfaces")) ? readdirSync(join(dir, "surfaces")).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, "")) : [];
  for (const surface of surfaces) {
    if (!catalog.has(surface)) problems.push(`${id}: surface "${surface}" is not in the SDK catalog`);
    if (!files.includes(surface)) problems.push(`${id}: surface "${surface}" is listed but surfaces/${surface}.tsx is missing`);
  }
  for (const file of files) if (!surfaces.includes(file)) problems.push(`${id}: surfaces/${file}.tsx exists but is not listed in template.json`);
  for (const surface of Object.keys(manifest.variants ?? {})) {
    if (!catalog.has(surface)) problems.push(`${id}: variants declared for unknown surface "${surface}"`);
    if (!surfaces.includes(surface)) problems.push(`${id}: variants declared for "${surface}" which the pack does not implement`);
  }
  for (const file of files) {
    const source = readFileSync(join(dir, "surfaces", `${file}.tsx`), "utf8");
    if (/from "convex\/react"|generated\/api"/.test(source)) problems.push(`${id}: surfaces/${file}.tsx reaches the backend directly; use SDK view models`);
    if (/#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border)-(?:zinc|slate|gray|neutral|stone|red|blue|green)-\d{2,3}\b/.test(source)) problems.push(`${id}: surfaces/${file}.tsx uses a colour literal; use token classes`);
  }
}

if (problems.length) {
  console.error(`Template pack check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

for (const module of ["draftModel", "chromeDefinitions", "templateActivation", "settingsSchema"]) {
  const source = join(root, `apps/web/src/templates/sdk/${module}.ts`);
  const mirror = resolve(root, `../ConvexPress-Admin/apps/web/src/lib/templates/${module}.ts`);
  if (existsSync(source) && (!existsSync(mirror) || readFileSync(source, "utf8") !== readFileSync(mirror, "utf8"))) throw new Error(`${module}: Admin mirror is stale; run sync:templates`);
}

const synchronization = spawnSync(process.execPath, [join(here, "sync-template-packs.mjs"), "--check"], { encoding: "utf8" });
if (synchronization.error || synchronization.status !== 0) {
  console.error(synchronization.error?.message ?? synchronization.stderr ?? "Template synchronization check failed");
  process.exit(1);
}

console.log(`Template pack check passed (${packs.length} pack${packs.length === 1 ? "" : "s"}, ${catalog.size} catalog surfaces).`);
