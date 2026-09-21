#!/usr/bin/env node
/** Reproduce installed Convex entrypoint discovery/API generation without contacting a deployment. */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const convex = path.dirname(require.resolve("convex/package.json"));
const { apiCodegen } = await import(pathToFileURL(path.join(convex, "dist/esm/cli/codegen_templates/api.js")).href);
const functions = path.join(root, "convex");
// Convex excludes multi-dot filenames, but not __tests__ directories. Keep the
// same discovery boundary and fail on accidentally deployable test helpers.
function discover(directory) {
 return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  const relative = path.relative(functions, file);
  if (relative.startsWith("_generated" + path.sep) || relative === "_generated" || relative.startsWith("_deps" + path.sep) || relative === "_deps") return [];
  if (entry.isDirectory()) return existsSync(path.join(file, "convex.config.ts")) ? [] : discover(file);
  if (![".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".jsx"].includes(path.extname(entry.name)) || entry.name.startsWith(".") || entry.name.startsWith("#") || entry.name.split(".").length !== 2 || ["schema.ts", "schema.js"].includes(entry.name) || relative.includes(" ")) return [];
  return (!file.endsWith(".ts") && !file.endsWith(".tsx")) || /^(?:\s{0,100})(?:import|export)/m.test(readFileSync(file, "utf8")) ? [relative] : [];
 });
}
const modules = discover(functions).sort();
const escapedTests = modules.filter(file => file.split(path.sep).some(part => ["__tests__", "tests", "test"].includes(part)));
if (escapedTests.length) throw new Error(`Test helpers would be shipped as Convex function modules: ${escapedTests.join(", ")}. Use a multi-dot filename such as helper.test-support.ts.`);
const generated = apiCodegen(modules);
// This backend has no Convex components; preserve the standard components export.
const files = { "api.d.ts": generated.DTS + '\nexport declare const components: {};\n', "api.js": generated.JS + '\nimport { componentsGeneric } from "convex/server";\nexport const components = componentsGeneric();\n' };
for (const [name, contents] of Object.entries(files)) writeFileSync(path.join(functions, "_generated", name), contents.replace(/[ \t]+$/gm, ""));
console.log(`Generated offline Convex API from ${modules.length} production modules (${JSON.parse(readFileSync(path.join(convex, "package.json"), "utf8")).version}).`);
