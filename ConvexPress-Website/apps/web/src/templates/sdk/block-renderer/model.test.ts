import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("canonical renderer contract regressions execute with the existing workspace runtime", () => {
	const result = spawnSync(
		process.execPath,
		[fileURLToPath(new URL("./run-tests.fixture.mjs", import.meta.url))],
		{ encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	expect(result.status).toBe(0);
});
