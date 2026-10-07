import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("all four footer surfaces honor every exposed row presentation value", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./footer-row-controls.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"cases":80');
});
