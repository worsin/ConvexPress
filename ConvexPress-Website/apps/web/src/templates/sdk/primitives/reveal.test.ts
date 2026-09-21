import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("Section reveal preserves content and follows viewport and user preferences", () => {
	const result = spawnSync(
		process.execPath,
		[fileURLToPath(new URL("./reveal.fixture.jsx", import.meta.url))],
		{ encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	expect(result.status).toBe(0);
});
