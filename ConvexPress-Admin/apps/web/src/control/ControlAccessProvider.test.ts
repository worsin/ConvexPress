import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("controller capability batches stay scoped, reactive and fail closed", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./ControlAccessProvider.cases.tsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
