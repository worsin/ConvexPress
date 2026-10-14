/**
 * Public argument contract: no PUBLIC query, mutation or action may accept
 * `v.any()` anywhere in its arguments.
 *
 * A public function is callable by any client, so its argument validator is
 * the first trust boundary. `v.any()` (at the top level or nested inside an
 * object, array, record or union) lets a caller send an arbitrary value that
 * the handler then has to defend against by hand. Open-ended payloads are
 * taken as a JSON-encoded `v.string()` and parsed with validation inside the
 * handler instead.
 *
 * The test loads every module the Convex CLI would bundle (same discovery
 * rules as scripts/typing/generate-static-api.ts), reads each registered
 * function's exportArgs() JSON, and fails with the function id and the JSON
 * path of every `{"type":"any"}` it finds. Internal functions are not checked:
 * only other server code can call them.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const convexDir = resolve(import.meta.dir, "..");
const EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".jsx"];

function* walk(dir: string): Generator<string> {
	for (const name of readdirSync(dir).sort()) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name === "node_modules") continue;
			if (full !== convexDir && existsSync(join(full, "convex.config.ts"))) continue;
			yield* walk(full);
		} else yield full;
	}
}

function modulePaths(): string[] {
	const out: string[] = [];
	for (const file of walk(convexDir)) {
		const rel = relative(convexDir, file);
		const base = file.split(sep).pop() ?? "";
		const ext = EXTENSIONS.find((e) => rel.endsWith(e));
		if (!ext || rel.startsWith(`_generated${sep}`) || base.startsWith(".") || base.startsWith("#")) continue;
		if (base === "schema.ts" || base === "schema.js" || (base.match(/\./g) ?? []).length > 1 || rel.includes(" ")) continue;
		if ((ext === ".ts" || ext === ".tsx") && !/^\s{0,100}(import|export)/m.test(readFileSync(file, "utf8"))) continue;
		out.push(rel.split(sep).join("/"));
	}
	return out.sort();
}

type Registered = {
	isQuery?: boolean;
	isMutation?: boolean;
	isAction?: boolean;
	isPublic?: boolean;
	exportArgs?: () => string;
};

function isRegistered(value: unknown): value is Registered {
	return (typeof value === "object" || typeof value === "function") && value !== null && "exportArgs" in value;
}

/** JSON paths (within one exportArgs document) of every `{"type":"any"}` node. */
function anyPaths(node: unknown, path: string): string[] {
	if (Array.isArray(node)) return node.flatMap((child, index) => anyPaths(child, `${path}[${index}]`));
	if (node === null || typeof node !== "object") return [];
	const own = "type" in node && node.type === "any" ? [path || "$"] : [];
	return [...own, ...Object.entries(node).flatMap(([key, child]) => anyPaths(child, `${path}.${key}`))];
}

describe("public argument contract", () => {
	test("no public function accepts v.any() in its args", async () => {
		const offenders: string[] = [];
		let publicCount = 0;
		for (const modulePath of modulePaths()) {
			const mod: Record<string, unknown> = await import(join(convexDir, modulePath));
			for (const [name, value] of Object.entries(mod)) {
				if (!isRegistered(value) || !value.exportArgs || !value.isPublic) continue;
				if (!value.isQuery && !value.isMutation && !value.isAction) continue;
				publicCount += 1;
				const id = `${modulePath.replace(/\.[^.]+$/, "")}:${name}`;
				for (const path of anyPaths(JSON.parse(value.exportArgs()), "")) offenders.push(`${id} ${path}`);
			}
		}
		expect(publicCount).toBeGreaterThan(500);
		expect(offenders).toEqual([]);
	}, 600_000);
});
