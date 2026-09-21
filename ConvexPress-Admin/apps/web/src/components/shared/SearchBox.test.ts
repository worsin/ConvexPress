import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("search submission and external navigation cannot replay stale debounce values", () => {
	const output = execFileSync(
		process.execPath,
		[
			fileURLToPath(
				new URL("./SearchBox.dom-test-support.tsx", import.meta.url),
			),
		],
		{
			cwd: fileURLToPath(new URL("../../../", import.meta.url)),
			encoding: "utf8",
			timeout: 15000,
		},
	);
	expect(output).toContain(
		"SearchBox: submit, debounce, clear, external navigation and unmount passed",
	);
});
