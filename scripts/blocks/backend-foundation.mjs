import { syncFoundationShared } from "./foundation-shared.mjs";
import { syncBlocks } from "./generator.mjs";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output =
	"ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated";
if (process.argv.slice(2).some((arg) => arg !== "--check"))
	throw Error("Use --check or no arguments");
await syncFoundationShared({root, check:process.argv.includes("--check")});
const result = await syncBlocks({
	root,
	output,
	check: process.argv.includes("--check"),
});
const directory = path.join(root, output);
for (const name of await readdir(directory)) {
	if (!/\.(?:ts|mts|mjs)$/.test(name)) continue;
	const text = await readFile(path.join(directory, name), "utf8");
	for (const match of text.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
		const target = match[1];
		if (
			target.startsWith(".") &&
			!path.resolve(directory, target).startsWith(directory + path.sep)
		)
			throw Error(`Generated import escapes backend foundation: ${name}`);
		if (!target.startsWith(".") && !["zod", "convex/values"].includes(target))
			throw Error(`Unexpected generated dependency: ${target}`);
	}
}
const require = createRequire(path.join(directory, "schemas.ts"));
require.resolve("zod");
require.resolve("convex/values");
console.log(
	`Staged backend contracts: ${result.blocks} specs; ${result.changed.length} changed files. Imports resolve inside generated/ and installed backend dependencies. No Convex entrypoint activated.`,
);
