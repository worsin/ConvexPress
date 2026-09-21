import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("visual inserter real DOM regression", () => {
	const r = spawnSync(
		process.execPath,
		["test", fileURLToPath(new URL("./inserter.cases.jsx", import.meta.url))],
		{ encoding: "utf8", timeout: 30000 },
	);
	if (r.status !== 0) throw Error(r.stdout + r.stderr);
	expect(r.status).toBe(0);
});
