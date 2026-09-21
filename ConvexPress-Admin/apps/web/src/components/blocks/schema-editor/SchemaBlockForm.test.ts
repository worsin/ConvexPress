import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
// React DOM caches its event feature detection on first import. Other Admin DOM
// suites intentionally import it before creating a document; isolate this real
// input-event suite so test ordering cannot disable the input event plugin.
test("generated block form DOM handlers pass in an isolated React event environment", async () => {
	const result = await promisify(execFile)(
		process.execPath,
		[
			"test",
			fileURLToPath(new URL("./SchemaBlockForm.cases.tsx", import.meta.url)),
		],
		{ timeout: 30000, maxBuffer: 1024 * 1024 },
	);
	const output = result.stdout + result.stderr;
	expect(output).toContain("11 pass");
	expect(output).toContain("0 fail");
});
