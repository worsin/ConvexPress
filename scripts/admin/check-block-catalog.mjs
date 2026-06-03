/**
 * Block catalog drift checker.
 *
 * Verifies that every `core/*` block in the frontend registry has a matching
 * entry in the shared catalog package (and vice versa). Run via
 * `bun run check:blocks` and as part of CI.
 *
 * History: pre-consolidation the canonical catalog lived inline in
 * packages/backend/convex/blocks/aiPromptBuilder.ts. It now lives in
 * packages/blocks-catalog/src/index.ts — aiPromptBuilder.ts is a re-export
 * shim. We still allow falling back to the old path so the script keeps
 * working on older branches.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = process.cwd();

const adminRegistryPath = resolve(root, "apps/web/src/lib/blocks/registry.tsx");
const sharedCatalogPath = resolve(
  root,
  "packages/blocks-catalog/src/index.ts",
);
const legacyCatalogPath = resolve(
  root,
  "packages/backend/convex/blocks/aiPromptBuilder.ts",
);

const adminRegistry = readFileSync(adminRegistryPath, "utf8");
const catalogPath = existsSync(sharedCatalogPath)
  ? sharedCatalogPath
  : legacyCatalogPath;
const catalogSource = readFileSync(catalogPath, "utf8");
const errors = [];

function extractNames(source) {
  return Array.from(source.matchAll(/name:\s*"([^"]+)"/g))
    .map((match) => match[1])
    .filter((name) => name.startsWith("core/"));
}

const adminNames = new Set(extractNames(adminRegistry));
const catalogNames = new Set(extractNames(catalogSource));

const missingInCatalog = [...adminNames].filter(
  (name) => !catalogNames.has(name),
);
const missingInAdmin = [...catalogNames].filter(
  (name) => !adminNames.has(name),
);

if (missingInCatalog.length || missingInAdmin.length) {
  errors.push("Block catalog drift detected.");
  errors.push(`  Admin registry: ${adminRegistryPath}`);
  errors.push(`  Shared catalog: ${catalogPath}`);
  if (missingInCatalog.length) {
    errors.push(`  Missing in shared catalog: ${missingInCatalog.join(", ")}`);
  }
  if (missingInAdmin.length) {
    errors.push(`  Missing in admin registry: ${missingInAdmin.join(", ")}`);
  }
}

function listBlockDirs(rootDir) {
  if (!existsSync(rootDir)) return [];
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => resolve(rootDir, entry.name));
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`Invalid block metadata JSON: ${path} (${error.message})`);
    return null;
  }
}

function extractManifestName(path) {
  if (!existsSync(path)) return "";
  const source = readFileSync(path, "utf8");
  return source.match(/name:\s*"([^"]+)"/)?.[1] ?? "";
}

const adminBlocksRoot = resolve(root, "apps/web/src/blocks");
const websiteBlocksRoot = resolve(root, "../ConvexPress-Website/apps/web/src/blocks");
const discoveredAdminNames = new Map();

for (const blockDir of listBlockDirs(adminBlocksRoot)) {
  const folder = basename(blockDir);
  const metadataPath = resolve(blockDir, "block.json");
  const manifestPath = resolve(blockDir, "manifest.tsx");

  if (!existsSync(metadataPath)) {
    errors.push(`Missing Admin block metadata: ${metadataPath}`);
    continue;
  }
  if (!existsSync(manifestPath)) {
    errors.push(`Missing Admin block manifest: ${manifestPath}`);
    continue;
  }

  const metadata = readJson(metadataPath);
  if (!metadata) continue;
  if (typeof metadata.name !== "string" || !metadata.name.includes("/")) {
    errors.push(`Block ${folder} needs a namespaced metadata.name.`);
    continue;
  }
  if (metadata.name.startsWith("local/")) {
    errors.push(`Tracked block ${folder} must not use a local/* name.`);
  }
  if (discoveredAdminNames.has(metadata.name)) {
    errors.push(
      `Duplicate discovered block name ${metadata.name} in ${folder} and ${discoveredAdminNames.get(metadata.name)}.`,
    );
  }
  discoveredAdminNames.set(metadata.name, folder);

  if (metadata.rendererStatus === "ready") {
    const websiteDir = resolve(websiteBlocksRoot, folder);
    const websiteManifestPath = resolve(websiteDir, "manifest.tsx");
    const websiteSchemaPath = resolve(websiteDir, "schema.ts");
    if (!existsSync(websiteManifestPath)) {
      errors.push(`Missing Website renderer for ready block ${metadata.name}: ${websiteManifestPath}`);
      continue;
    }
    if (!existsSync(websiteSchemaPath)) {
      errors.push(`Missing Website schema for ready block ${metadata.name}: ${websiteSchemaPath}`);
    }
    const websiteName = extractManifestName(websiteManifestPath);
    if (websiteName && websiteName !== metadata.name) {
      errors.push(
        `Admin block ${metadata.name} is paired with Website manifest name ${websiteName} in ${websiteManifestPath}.`,
      );
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Block catalog check passed (${adminNames.size} core blocks, ${discoveredAdminNames.size} discovered official blocks; catalog source: ${
    catalogPath === sharedCatalogPath ? "@convexpress-admin/blocks-catalog" : "legacy shim"
  }).`,
);
