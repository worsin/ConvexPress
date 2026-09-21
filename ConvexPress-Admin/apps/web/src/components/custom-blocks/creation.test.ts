import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("new custom block review retains source and prevents stale or repeated creation", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./creation.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
