import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("missing help, author and dated post pages answer 404, and an article has one address", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./missing-content.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"cases":10');
});
