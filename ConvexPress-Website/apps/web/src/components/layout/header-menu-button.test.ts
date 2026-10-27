import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("every pack's menu button reports the navigation drawer it opens and whether it is open", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./header-menu-button.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"menuButtonChecks":8');
});
