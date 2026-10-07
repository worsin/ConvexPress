import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("footer content controls and row conversion retain author choices across all packs", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./footer-content-controls.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"cases":63');
});
