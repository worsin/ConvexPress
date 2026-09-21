import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== "--check"))
	throw Error("Usage: bun run sync:blocks:all [--check]");
for (const [runtime, file] of [
	[process.execPath, "cli.mjs"],
	[process.execPath, "backend-foundation.mjs"],
	["bun", "generate-legacy-compatibility.ts"],
	[process.execPath, "portable-data.mjs"],
	[process.execPath, "deployed-foundation.mjs"],
	["bun", "generate-transport-validators.ts"],
]) {
	execFileSync(runtime, [`scripts/blocks/${file}`, ...args], {
		cwd: root,
		stdio: "inherit",
	});
}
console.log(
	"Canonical source contracts synchronized. No backend deployment or saved-content mutation performed.",
);
