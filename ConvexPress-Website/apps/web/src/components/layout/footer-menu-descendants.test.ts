import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("all footer packs retain nested menu destinations and suppress orphaned branches", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./footer-menu-descendants.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"cases":12');
});
