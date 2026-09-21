import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("isolated desktop website-editing scope and logout lifecycle", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./WebsiteEditingProvider.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 15000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
}, 20000);
