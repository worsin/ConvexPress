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
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  console.error("Block catalog drift detected.");
  console.error(`  Admin registry: ${adminRegistryPath}`);
  console.error(`  Shared catalog: ${catalogPath}`);
  if (missingInCatalog.length) {
    console.error(
      "  Missing in shared catalog:",
      missingInCatalog.join(", "),
    );
  }
  if (missingInAdmin.length) {
    console.error("  Missing in admin registry:", missingInAdmin.join(", "));
  }
  process.exit(1);
}

console.log(
  `Block catalog check passed (${adminNames.size} core blocks; catalog source: ${
    catalogPath === sharedCatalogPath ? "@convexpress-admin/blocks-catalog" : "legacy shim"
  }).`,
);
