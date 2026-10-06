import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("all packs preserve copyright substitutions after footer row conversion", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./footer-copyright.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"passed":true');
});
