import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("primitive DOM and hydration checks run in an isolated document", () => {
	const result = spawnSync(
		process.execPath,
		[fileURLToPath(new URL("./dom.fixture.jsx", import.meta.url))],
		{ encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	expect(result.status).toBe(0);
});
