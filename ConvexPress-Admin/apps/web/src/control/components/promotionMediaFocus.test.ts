import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("actual shared Dialog restores media triggers and refuses stale focus targets", () => {
	const output = execFileSync(
		process.execPath,
		[
			fileURLToPath(
				new URL("./promotionMediaFocus.dom-test-support.tsx", import.meta.url),
			),
		],
		{
			cwd: fileURLToPath(new URL("../../../", import.meta.url)),
			encoding: "utf8",
			timeout: 20000,
		},
	);
	expect(output).toContain(
		"media-dialog-focus: transfer/recovery Cancel restore",
	);
});
