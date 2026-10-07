import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("footer section choices change all four public surfaces and retain authored links", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./footer-section-controls.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"cases":84');
});
