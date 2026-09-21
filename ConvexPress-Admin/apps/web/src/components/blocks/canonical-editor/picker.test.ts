import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// The wrapper covers the whole isolated multi-case suite, not one picker case.
// Keep its budget above the child's existing 30-second process limit.
test("canonical menu picker DOM and authority integration", () => {
	const result = spawnSync(
		process.execPath,
		["test", fileURLToPath(new URL("./picker.cases.jsx", import.meta.url))],
		{ encoding: "utf8", timeout: 30000 },
	);
	if (result.status !== 0) throw Error(result.stdout + result.stderr);
	expect(result.status).toBe(0);
}, 35000);
