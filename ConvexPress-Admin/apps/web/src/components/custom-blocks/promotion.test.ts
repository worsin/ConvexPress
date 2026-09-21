import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("SDK promotion review and acknowledgement recovery execute in the editor", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./promotion.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
