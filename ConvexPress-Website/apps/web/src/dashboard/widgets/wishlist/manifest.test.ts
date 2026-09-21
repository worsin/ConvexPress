import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
test("wishlist widget renders exact totals and recovery states in an isolated DOM", async () => {
	const result = await promisify(execFile)(
		process.execPath,
		["test", fileURLToPath(new URL("./manifest.cases.jsx", import.meta.url))],
		{ timeout: 30000, maxBuffer: 1024 * 1024 },
	);
	expect(result.stdout + result.stderr).toContain("3 pass");
	expect(result.stdout + result.stderr).toContain("0 fail");
});
