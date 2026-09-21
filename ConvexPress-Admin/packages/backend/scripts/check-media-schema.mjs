/** Evaluate the schema-only inventory generator using the shipped frozen compiler. */
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync, unlinkSync, realpathSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const directory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(realpathSync(new URL("../node_modules/convex/package.json", import.meta.url)));
const { buildSync } = require("esbuild");
const generator = path.join(directory, "generate-media-reference-inventory.ts");
const temporary = path.join(directory, `.media-schema-check-${randomUUID()}.mjs`);
const { outputFiles } = buildSync({ entryPoints: [generator], bundle: true, write: false, platform: "node", format: "esm", packages: "external", define: { "import.meta.url": JSON.stringify(pathToFileURL(generator).href) } });
// This command is always a check, including when invoked by packaging.
const originalArgs = [...process.argv];
if (!process.argv.includes("--check")) process.argv.push("--check");
try { writeFileSync(temporary, outputFiles[0].contents); await import(pathToFileURL(temporary).href); }
finally { process.argv.splice(0, process.argv.length, ...originalArgs); try { unlinkSync(temporary); } catch { } }
