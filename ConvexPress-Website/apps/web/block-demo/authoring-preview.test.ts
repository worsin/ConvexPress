import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
test("local authoring uses one pinned runtime and actual schema form/render DOM", async () => {
	const result = await promisify(execFile)(
		process.execPath,
		[fileURLToPath(new URL("./authoring-preview-runner.mjs", import.meta.url))],
		{ timeout: 30000, maxBuffer: 1024 * 1024 },
	);
	expect(result.stdout + result.stderr).toContain("2 pass");
	expect(result.stdout + result.stderr).toContain("0 fail");
});
